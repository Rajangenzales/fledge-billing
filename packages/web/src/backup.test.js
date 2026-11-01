import React from "react";
import { webcrypto } from "node:crypto";
import { IDBFactory } from "fake-indexeddb";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import {
  BACKUP_STORE_NAMES,
  createBrowserRepositories,
  openFledgeDatabase,
  readBackupRecords,
  replaceBackupRecords,
} from "./indexed-db.js";
import { gstinCheckCharacter, STATE_UTS } from "@fledge/domain";
import {
  allocateReceiptToInvoice as allocatePayment,
  createDocument,
  createProduct,
  createSavedGstRate,
  createCustomer,
  finalizeDocument,
  getCustomerAdvance,
  getInvoiceSettlement,
  recordCustomerReceipt,
  saveBusinessProfile,
} from "@fledge/application/browser";
import { createEncryptedBackup, restoreEncryptedBackup } from "./backup.js";
import BackupRecovery from "./BackupRecovery.jsx";

const PASSPHRASE = "a-long-test-passphrase";
const AAD = new TextEncoder().encode("fledge-browser-backup:1");
const KDF_ITERATIONS = 600_000;

describe("encrypted browser backup and recovery", () => {
  let database;
  let restoredDatabase;

  afterEach(() => {
    database?.close();
    restoredDatabase?.close();
    database = null;
    restoredDatabase = null;
  });

  it("round-trips every business-owned IndexedDB store in the encrypted backup", async () => {
    database = await openFledgeDatabase(new IDBFactory());
    await populateAllStores(database);
    const original = await readBackupRecords(database);
    const backup = await createEncryptedBackup(database, PASSPHRASE, webcrypto);

    expect(backup).not.toContain("Fledge Traders");
    expect(JSON.parse(backup)).toMatchObject({
      format: "fledge-browser-backup",
      formatVersion: 1,
      encryption: {
        algorithm: "AES-GCM",
        keyDerivation: "PBKDF2",
        hash: "SHA-256",
        iterations: KDF_ITERATIONS,
      },
    });

    const addTransaction = database.transaction(["customers"], "readwrite");
    addTransaction.objectStore("customers").put({
      id: "local-only",
      businessId: "business-1",
      name: "Do not retain",
    });
    await transactionDone(addTransaction);
    await overwriteProduct(database, { id: "product-1", businessId: "business-1", name: "Changed" });
    await restoreEncryptedBackup(database, backup, PASSPHRASE, webcrypto);

    expect(await readBackupRecords(database)).toEqual(original);
  });

  it("restores a financial workspace into a clean profile with counts and balances preserved", async () => {
    const source = await createFinancialWorkspace(new IDBFactory());
    database = source.database;
    const original = await readBackupRecords(database);
    const expectedCounts = recordCounts(original);
    const backup = await createEncryptedBackup(database, PASSPHRASE, webcrypto);

    restoredDatabase = await openFledgeDatabase(new IDBFactory());
    expect(await readBackupRecords(restoredDatabase)).toEqual(
      Object.fromEntries(BACKUP_STORE_NAMES.map((store) => [store, []])),
    );
    await restoreEncryptedBackup(restoredDatabase, backup, PASSPHRASE, webcrypto);

    const restored = await readBackupRecords(restoredDatabase);
    expect(restored).toEqual(original);
    expect(recordCounts(restored)).toEqual(expectedCounts);

    const repositories = createBrowserRepositories(restoredDatabase);
    const payments = createPaymentDependencies(repositories);
    expect(await getInvoiceSettlement(source.invoiceId, payments.allocation)).toMatchObject({
      invoiceTotal: "236",
      allocatedAmount: "50",
      outstandingAmount: "186",
      paymentStatus: "partially_paid",
    });
    expect(await getCustomerAdvance(source.customerId, payments.receipt)).toMatchObject({
      customerId: source.customerId,
      receiptCount: 1,
      unallocatedAmount: "150",
    });
  });

  it("uses fresh random salt and IV for each export", async () => {
    database = await openFledgeDatabase(new IDBFactory());
    const first = JSON.parse(await createEncryptedBackup(database, PASSPHRASE, webcrypto));
    const second = JSON.parse(await createEncryptedBackup(database, PASSPHRASE, webcrypto));
    expect(first.encryption.salt).not.toBe(second.encryption.salt);
    expect(first.encryption.iv).not.toBe(second.encryption.iv);
  });

  it("shows encryption, data-sensitivity and replacement warnings in the recovery flow", () => {
    const markup = renderToStaticMarkup(React.createElement(BackupRecovery, {
      database: {},
      onRestore: async () => {},
    }));
    expect(markup).toContain("Export encrypted backup");
    expect(markup).toContain("Restore from backup");
    expect(markup).toContain("sensitive business data");
    expect(markup).toContain("Browser storage can be cleared or evicted");
    expect(markup).toContain("Validate and restore backup");
  });

  it("rejects a wrong passphrase and tampering without changing any live records", async () => {
    database = await openFledgeDatabase(new IDBFactory());
    await populateAllStores(database);
    const original = await readBackupRecords(database);
    const backup = await createEncryptedBackup(database, PASSPHRASE, webcrypto);

    await expect(restoreEncryptedBackup(database, backup, "wrong-test-passphrase", webcrypto))
      .rejects.toThrow(/passphrase is incorrect or the backup has been altered/i);
    const envelope = JSON.parse(backup);
    const changedCiphertext = `${envelope.ciphertext.slice(0, -4)}AAAA`;
    await expect(restoreEncryptedBackup(database, JSON.stringify({
      ...envelope,
      ciphertext: changedCiphertext,
    }), PASSPHRASE, webcrypto)).rejects.toThrow(/passphrase is incorrect or the backup has been altered/i);
    expect(await readBackupRecords(database)).toEqual(original);
  });

  it("rejects unsupported formats and schemas before replacing records", async () => {
    database = await openFledgeDatabase(new IDBFactory());
    await populateAllStores(database);
    const original = await readBackupRecords(database);
    const backup = await createEncryptedBackup(database, PASSPHRASE, webcrypto);
    const envelope = JSON.parse(backup);

    await expect(restoreEncryptedBackup(database, JSON.stringify({
      ...envelope,
      formatVersion: 99,
    }), PASSPHRASE, webcrypto)).rejects.toThrow(/format version is not supported/i);

    const incompatibleSchema = await resealPayload(backup, (payload) => {
      payload.databaseSchemaVersion += 1;
    });
    await expect(restoreEncryptedBackup(database, incompatibleSchema, PASSPHRASE, webcrypto))
      .rejects.toThrow(/incompatible local database schema/i);
    const legacySchema = await resealPayload(backup, (payload) => {
      payload.databaseSchemaVersion -= 1;
      payload.stores = payload.stores.filter((store) => store !== "logoAssets");
      delete payload.records.logoAssets;
    });
    await restoreEncryptedBackup(database, legacySchema, PASSPHRASE, webcrypto);
    expect((await readBackupRecords(database)).logoAssets).toEqual([]);

    const olderSchema = await resealPayload(backup, (payload) => {
      payload.databaseSchemaVersion -= 1;
    });
    await expect(restoreEncryptedBackup(database, olderSchema, PASSPHRASE, webcrypto))
      .rejects.toThrow(/incompatible local database schema/i);
    expect(await readBackupRecords(database)).toEqual(original);
  });

  it("rejects malformed or mixed-business records before mutating any store", async () => {
    database = await openFledgeDatabase(new IDBFactory());
    await populateAllStores(database);
    const original = await readBackupRecords(database);
    const backup = await createEncryptedBackup(database, PASSPHRASE, webcrypto);
    const malformed = await resealPayload(backup, (payload) => {
      delete payload.records.customers[0].id;
    });
    await expect(restoreEncryptedBackup(database, malformed, PASSPHRASE, webcrypto))
      .rejects.toThrow(/customers record is malformed/i);
    const foreignRecord = await resealPayload(backup, (payload) => {
      payload.records.products[0].businessId = "another-business";
    });
    await expect(restoreEncryptedBackup(database, foreignRecord, PASSPHRASE, webcrypto))
      .rejects.toThrow(/does not belong to the backed-up business/i);
    expect(await readBackupRecords(database)).toEqual(original);
  });

  it("rolls back all queued store clears if the atomic replacement transaction fails", async () => {
    database = await openFledgeDatabase(new IDBFactory());
    await populateAllStores(database);
    const original = await readBackupRecords(database);
    const records = structuredClone(original);
    const transaction = database.transaction(["business"], "readonly");
    const storePrototype = Object.getPrototypeOf(transaction.objectStore("business"));
    transaction.abort();
    const originalClear = storePrototype.clear;
    let clearCount = 0;
    storePrototype.clear = function failAfterSeveralQueuedClears(...args) {
      clearCount += 1;
      if (clearCount === 5) throw new Error("Injected storage failure");
      return originalClear.apply(this, args);
    };

    try {
      await expect(replaceBackupRecords(database, records)).rejects.toThrow("Injected storage failure");
    } finally {
      storePrototype.clear = originalClear;
    }
    expect(await readBackupRecords(database)).toEqual(original);
  });
});

async function createFinancialWorkspace(factory) {
  const database = await openFledgeDatabase(factory);
  const repositories = createBrowserRepositories(database);
  const timestamp = "2026-11-01T00:00:00.000Z";
  const business = await saveBusinessProfile(
    {
      legalName: "Fledge Traders",
      displayName: "Fledge",
      address: "Market Road",
      stateId: "IN-KL",
      gstRegistered: true,
      gstin: `32AABCU9603R1Z${gstinCheckCharacter("32AABCU9603R1Z")}`,
    },
    {
      repository: repositories.businessRepository,
      states: STATE_UTS,
      now: () => timestamp,
      createId: () => "business-1",
    },
  );
  const customer = await createCustomer(
    {
      name: "Harbour Stores",
      billingAddress: "Beach Road",
      stateId: "IN-KL",
      registrationType: "unregistered",
    },
    {
      repository: repositories.customerRepository,
      states: STATE_UTS,
      now: () => timestamp,
      createId: () => "customer-1",
    },
  );
  const productDependencies = {
    repository: repositories.productRepository,
    now: () => timestamp,
    createId: (() => {
      let sequence = 0;
      return () => `catalog-${++sequence}`;
    })(),
  };
  const rate = await createSavedGstRate(
    { name: "GST 18", percentage: "18" },
    productDependencies,
  );
  const product = await createProduct(
    {
      type: "goods",
      name: "Notebook",
      code: "NB-1",
      hsnSac: "482010",
      unit: "nos",
      defaultPrice: "100",
      defaultDiscount: "0",
      taxCategoryId: "taxable",
      savedGstRateId: rate.id,
      taxInclusive: false,
    },
    productDependencies,
  );
  const documentDependencies = {
    repository: repositories.documentRepository,
    states: STATE_UTS,
    now: () => timestamp,
    createId: (() => {
      let sequence = 0;
      return () => `document-${++sequence}`;
    })(),
  };
  const draft = await createDocument({
    customerId: customer.id,
    documentType: "tax_invoice",
    documentDate: "2026-11-01",
    placeOfSupplyStateId: "IN-KL",
    gstEnabled: true,
    reverseCharge: false,
    lines: [{
      productId: product.id,
      description: "Notebook",
      hsnSac: "482010",
      quantity: "2",
      unit: "nos",
      rate: "100",
      discountType: "none",
      taxInclusive: false,
      gstRatePercent: "18",
      taxCategoryId: "taxable",
    }],
  }, documentDependencies);
  const invoice = await finalizeDocument(draft.id, documentDependencies);
  const payments = createPaymentDependencies(repositories);
  const receipt = await recordCustomerReceipt({
    customerId: customer.id,
    amount: "200",
    paymentDate: "2026-11-01",
    method: "upi",
    idempotencyKey: "restore-test-receipt",
  }, payments.receipt);
  await allocatePayment({
    receiptId: receipt.id,
    invoiceId: invoice.id,
    amount: "50",
    idempotencyKey: "restore-test-allocation",
  }, payments.allocation);

  return {
    database,
    business,
    customerId: customer.id,
    invoiceId: invoice.id,
  };
}

function createPaymentDependencies(repositories) {
  let sequence = 0;
  const dependencies = {
    now: () => "2026-11-01T00:00:00.000Z",
    createId: () => `payment-${++sequence}`,
  };
  return {
    receipt: { repository: repositories.customerReceiptRepository, ...dependencies },
    allocation: { repository: repositories.allocationRepository, ...dependencies },
  };
}

function recordCounts(records) {
  return Object.fromEntries(
    BACKUP_STORE_NAMES.map((store) => [store, records[store].length]),
  );
}

async function populateAllStores(db) {
  const examples = {
    business: [{ id: "business-1", legalName: "Fledge Traders" }],
    customers: [{ id: "customer-1", businessId: "business-1", name: "Harbour Stores" }],
    savedGstRates: [{ id: "rate-1", businessId: "business-1", percentage: "18" }],
    products: [{ id: "product-1", businessId: "business-1", name: "Notebook" }],
    documents: [{ id: "document-1", businessId: "business-1", documentNumber: "INV-0001" }],
    numberSeries: [{
      id: "series-1",
      businessId: "business-1",
      documentType: "tax_invoice",
      financialYear: "2026-27",
    }],
    templates: [{
      id: "template-1",
      businessId: "business-1",
      key: "tax-invoice",
      version: 1,
    }],
    customerReceipts: [{
      id: "receipt-1",
      businessId: "business-1",
      customerId: "customer-1",
      idempotencyKey: "receipt-key",
    }],
    paymentAllocationEvents: [{
      id: "allocation-1",
      businessId: "business-1",
      receiptId: "receipt-1",
      invoiceId: "document-1",
      customerId: "customer-1",
      idempotencyKey: "allocation-key",
    }],
    paymentAdjustmentEvents: [{
      id: "adjustment-1",
      businessId: "business-1",
      receiptId: "receipt-1",
      customerId: "customer-1",
      idempotencyKey: "adjustment-key",
    }],
  };
  const transaction = db.transaction(BACKUP_STORE_NAMES, "readwrite");
  for (const store of BACKUP_STORE_NAMES) {
    for (const record of examples[store]) transaction.objectStore(store).put(record);
  }
  await transactionDone(transaction);
}

async function overwriteProduct(db, record) {
  const transaction = db.transaction(["products"], "readwrite");
  transaction.objectStore("products").put(record);
  await transactionDone(transaction);
}

async function resealPayload(backup, change) {
  const envelope = JSON.parse(backup);
  const salt = decodeBase64(envelope.encryption.salt);
  const iv = decodeBase64(envelope.encryption.iv);
  const encrypted = decodeBase64(envelope.ciphertext);
  const material = await webcrypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(PASSPHRASE),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  const key = await webcrypto.subtle.deriveKey({
    name: "PBKDF2",
    salt,
    iterations: KDF_ITERATIONS,
    hash: "SHA-256",
  }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  const plaintext = await webcrypto.subtle.decrypt({
    name: "AES-GCM",
    iv,
    additionalData: AAD,
    tagLength: 128,
  }, key, encrypted);
  const payload = JSON.parse(new TextDecoder().decode(plaintext));
  change(payload);
  const changedCiphertext = await webcrypto.subtle.encrypt({
    name: "AES-GCM",
    iv,
    additionalData: AAD,
    tagLength: 128,
  }, key, new TextEncoder().encode(JSON.stringify(payload)));
  return JSON.stringify({
    ...envelope,
    ciphertext: encodeBase64(new Uint8Array(changedCiphertext)),
  });
}

function decodeBase64(value) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function encodeBase64(bytes) {
  return btoa(String.fromCharCode(...bytes));
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onabort = () => reject(transaction.error ?? new Error("Transaction aborted"));
    transaction.onerror = () => reject(transaction.error ?? new Error("Transaction failed"));
  });
}
