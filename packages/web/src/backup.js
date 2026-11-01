import {
  BACKUP_STORE_NAMES,
  DATABASE_VERSION,
  readBackupRecords,
  replaceBackupRecords,
} from "./indexed-db.js";

const BACKUP_FORMAT = "fledge-browser-backup";
const BACKUP_FORMAT_VERSION = 1;
const KDF_ITERATIONS = 600_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const AUTHENTICATION_TAG_BITS = 128;
const AUTHENTICATED_DATA = new TextEncoder().encode(`${BACKUP_FORMAT}:${BACKUP_FORMAT_VERSION}`);
const UNIQUE_INDEXES = {
  numberSeries: [["businessId", "documentType", "financialYear"]],
  templates: [["businessId", "key", "version"]],
  customerReceipts: [["businessId", "idempotencyKey"]],
  paymentAllocationEvents: [
    ["businessId", "idempotencyKey"],
    ["releasedAllocationId"],
  ],
  paymentAdjustmentEvents: [
    ["businessId", "idempotencyKey"],
    ["reversedReceiptId"],
    ["reversedRefundId"],
  ],
};
const REQUIRED_INDEX_FIELDS = {
  numberSeries: ["businessId", "documentType", "financialYear"],
  templates: ["businessId", "key", "version"],
  customerReceipts: ["businessId", "customerId", "idempotencyKey"],
  paymentAllocationEvents: ["businessId", "receiptId", "invoiceId", "customerId", "idempotencyKey"],
  paymentAdjustmentEvents: ["businessId", "receiptId", "customerId", "idempotencyKey"],
};

export class BackupError extends Error {
  constructor(message) {
    super(message);
    this.name = "BackupError";
    this.userMessage = message;
  }
}

export async function createEncryptedBackup(database, passphrase, cryptoProvider = globalThis.crypto) {
  validatePassphrase(passphrase);
  const cryptoApi = requireCrypto(cryptoProvider);
  const records = await readBackupRecords(database);
  const payload = {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    databaseSchemaVersion: DATABASE_VERSION,
    stores: [...BACKUP_STORE_NAMES],
    records: jsonSafeRecords(records),
  };
  validatePayload(payload);

  const salt = cryptoApi.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = cryptoApi.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(passphrase, salt, cryptoApi);
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const encrypted = await cryptoApi.subtle.encrypt({
    name: "AES-GCM",
    iv,
    additionalData: AUTHENTICATED_DATA,
    tagLength: AUTHENTICATION_TAG_BITS,
  }, key, plaintext);

  return JSON.stringify({
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    encryption: {
      algorithm: "AES-GCM",
      keyDerivation: "PBKDF2",
      hash: "SHA-256",
      iterations: KDF_ITERATIONS,
      salt: encodeBase64(salt),
      iv: encodeBase64(iv),
    },
    ciphertext: encodeBase64(new Uint8Array(encrypted)),
  });
}

export async function restoreEncryptedBackup(
  database,
  backupText,
  passphrase,
  cryptoProvider = globalThis.crypto,
) {
  validatePassphrase(passphrase);
  const envelope = parseEnvelope(backupText);
  const cryptoApi = requireCrypto(cryptoProvider);
  const salt = decodeBase64(envelope.encryption.salt, "Backup salt");
  const iv = decodeBase64(envelope.encryption.iv, "Backup IV");
  const ciphertext = decodeBase64(envelope.ciphertext, "Backup encrypted data");
  if (salt.length !== SALT_BYTES || iv.length !== IV_BYTES || ciphertext.length <= 16) {
    throw new BackupError("This backup file is damaged or incomplete.");
  }

  const key = await deriveKey(passphrase, salt, cryptoApi);
  let plaintext;
  try {
    plaintext = await cryptoApi.subtle.decrypt({
      name: "AES-GCM",
      iv,
      additionalData: AUTHENTICATED_DATA,
      tagLength: AUTHENTICATION_TAG_BITS,
    }, key, ciphertext);
  } catch {
    throw new BackupError("The passphrase is incorrect or the backup has been altered.");
  }

  let payload;
  try {
    payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(plaintext));
  } catch {
    throw new BackupError("The decrypted backup data is invalid.");
  }
  validatePayload(payload);
  await replaceBackupRecords(database, payload.records);
}

function validatePassphrase(passphrase) {
  if (typeof passphrase !== "string" || passphrase.length < 12) {
    throw new BackupError("Use a passphrase with at least 12 characters.");
  }
}

function requireCrypto(cryptoProvider) {
  if (
    !cryptoProvider ||
    typeof cryptoProvider.getRandomValues !== "function" ||
    !cryptoProvider.subtle
  ) {
    throw new BackupError("Secure backup encryption is unavailable in this browser.");
  }
  return cryptoProvider;
}

async function deriveKey(passphrase, salt, cryptoApi) {
  const material = await cryptoApi.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return cryptoApi.subtle.deriveKey({
    name: "PBKDF2",
    salt,
    iterations: KDF_ITERATIONS,
    hash: "SHA-256",
  }, material, {
    name: "AES-GCM",
    length: 256,
  }, false, ["encrypt", "decrypt"]);
}

function parseEnvelope(backupText) {
  let envelope;
  try {
    envelope = JSON.parse(backupText);
  } catch {
    throw new BackupError("Choose a valid Fledge backup file.");
  }
  if (!isRecord(envelope) || envelope.format !== BACKUP_FORMAT) {
    throw new BackupError("This is not a supported Fledge backup file.");
  }
  if (envelope.formatVersion !== BACKUP_FORMAT_VERSION) {
    throw new BackupError("This backup format version is not supported by this app.");
  }
  const encryption = envelope.encryption;
  if (
    !isRecord(encryption) ||
    encryption.algorithm !== "AES-GCM" ||
    encryption.keyDerivation !== "PBKDF2" ||
    encryption.hash !== "SHA-256" ||
    encryption.iterations !== KDF_ITERATIONS ||
    typeof encryption.salt !== "string" ||
    typeof encryption.iv !== "string" ||
    typeof envelope.ciphertext !== "string"
  ) {
    throw new BackupError("This backup uses unsupported or invalid encryption settings.");
  }
  return envelope;
}

function validatePayload(payload) {
  if (!isRecord(payload) || payload.format !== BACKUP_FORMAT) {
    throw new BackupError("The decrypted backup does not have a valid Fledge data format.");
  }
  if (payload.formatVersion !== BACKUP_FORMAT_VERSION) {
    throw new BackupError("This backup format version is not supported by this app.");
  }
  if (payload.databaseSchemaVersion === DATABASE_VERSION - 1 && isRecord(payload.records) && Array.isArray(payload.stores)) {
    const legacyStores = BACKUP_STORE_NAMES.filter((store) => store !== "logoAssets");
    const isLegacyStoreSet =
      payload.stores.length === legacyStores.length &&
      payload.stores.every((store, index) => store === legacyStores[index]) &&
      Object.keys(payload.records).length === legacyStores.length &&
      legacyStores.every((store) => Object.hasOwn(payload.records, store));
    if (isLegacyStoreSet) {
      payload.stores = [...BACKUP_STORE_NAMES];
      payload.records.logoAssets = [];
      payload.databaseSchemaVersion = DATABASE_VERSION;
    }
  }
  if (payload.databaseSchemaVersion !== DATABASE_VERSION) {
    throw new BackupError("This backup was made with an incompatible local database schema.");
  }
  if (
    Object.keys(payload).length !== 5 ||
    !Array.isArray(payload.stores) ||
    payload.stores.length !== BACKUP_STORE_NAMES.length ||
    payload.stores.some((store, index) => store !== BACKUP_STORE_NAMES[index]) ||
    !isRecord(payload.records) ||
    Object.keys(payload.records).length !== BACKUP_STORE_NAMES.length ||
    BACKUP_STORE_NAMES.some((store) => !Object.hasOwn(payload.records, store))
  ) {
    throw new BackupError("The backup is incomplete or contains an unsupported store.");
  }

  let businessId = null;
  for (const storeName of BACKUP_STORE_NAMES) {
    const records = payload.records[storeName];
    if (!Array.isArray(records)) {
      throw new BackupError(`The backup contains invalid ${storeName} records.`);
    }
    const ids = new Set();
    for (const record of records) {
      if (!isRecord(record) || typeof record.id !== "string" || !record.id.trim()) {
        throw new BackupError(`A ${storeName} record is malformed.`);
      }
      if (ids.has(record.id)) {
        throw new BackupError(`The backup contains duplicate ${storeName} record IDs.`);
      }
      ids.add(record.id);

      if (storeName === "business") {
        if (records.length !== 1) {
          throw new BackupError("The backup contains more than one business profile.");
        }
        businessId = record.id;
      } else if (typeof record.businessId !== "string" || !record.businessId.trim()) {
        throw new BackupError(`A ${storeName} record has no business owner.`);
      }
      if (storeName === "logoAssets" && (
        !["image/png", "image/jpeg"].includes(record.mimeType) ||
        !Array.isArray(record.bytes) ||
        record.bytes.length < 4 || record.bytes.length > 1_000_000 ||
        record.bytes.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255) ||
        (record.mimeType === "image/png" && ![137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => record.bytes[index] === byte)) ||
        (record.mimeType === "image/jpeg" && !(record.bytes[0] === 255 && record.bytes[1] === 216 && record.bytes[2] === 255))
      )) {
        throw new BackupError("A saved business logo asset is invalid.");
      }
      const requiredIndexFields = REQUIRED_INDEX_FIELDS[storeName] ?? [];
      if (requiredIndexFields.some((field) => record[field] === undefined || record[field] === null)) {
        throw new BackupError(`A ${storeName} record is missing required indexed data.`);
      }
    }
  }

  for (const storeName of BACKUP_STORE_NAMES.filter((name) => name !== "business")) {
    for (const record of payload.records[storeName]) {
      if (!businessId || record.businessId !== businessId) {
        throw new BackupError(`A ${storeName} record does not belong to the backed-up business.`);
      }
    }
  }
  validateUniqueIndexes(payload.records);
}

function validateUniqueIndexes(recordsByStore) {
  for (const [storeName, indexes] of Object.entries(UNIQUE_INDEXES)) {
    for (const indexFields of indexes) {
      const seen = new Set();
      for (const record of recordsByStore[storeName]) {
        const values = indexFields.map((field) => record[field]);
        if (values.some((value) => value === undefined || value === null)) continue;
        const key = JSON.stringify(values);
        if (seen.has(key)) {
          throw new BackupError(`The backup contains conflicting ${storeName} records.`);
        }
        seen.add(key);
      }
    }
  }
}

function jsonSafeRecords(records) {
  assertJsonValue(records, new Set());
  try {
    const serialized = JSON.stringify(records);
    if (serialized === undefined) throw new Error("No records");
    const parsed = JSON.parse(serialized);
    if (!isRecord(parsed)) throw new Error("Invalid records");
    return parsed;
  } catch {
    throw new BackupError("Local records could not be safely encoded for backup.");
  }
}

function assertJsonValue(value, ancestors) {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) return;
  if (typeof value !== "object") {
    throw new BackupError("Local records contain values that cannot be safely backed up.");
  }
  if (ancestors.has(value)) {
    throw new BackupError("Local records contain a circular value and cannot be safely backed up.");
  }
  if (
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  ) {
    throw new BackupError("Local records contain values that cannot be safely backed up.");
  }
  if (!Array.isArray(value) && Reflect.ownKeys(value).length !== Object.keys(value).length) {
    throw new BackupError("Local records contain values that cannot be safely backed up.");
  }
  ancestors.add(value);
  const children = Array.isArray(value) ? value : Object.values(value);
  for (const child of children) assertJsonValue(child, ancestors);
  ancestors.delete(value);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function encodeBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function decodeBase64(value, label) {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new BackupError(`${label} is invalid.`);
  }
  try {
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw new BackupError(`${label} is invalid.`);
  }
}
