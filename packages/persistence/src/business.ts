import { type BusinessRepository, type StoredBusiness } from "@fledge/application";
import { BusinessProfileError } from "@fledge/domain";
import type { SchemaDatabase } from "./connection.js";
import type { Migration } from "./migrate.js";

export const businessProfile: Migration = {
  version: 2,
  name: "business-profile",
  up(db) {
    db.exec(`
      CREATE TABLE business (
        id TEXT PRIMARY KEY,
        legal_name TEXT NOT NULL,
        display_name TEXT NOT NULL,
        address TEXT NOT NULL,
        state_id TEXT NOT NULL REFERENCES state_ut(id),
        pin_code TEXT,
        gst_registered INTEGER NOT NULL CHECK (gst_registered IN (0, 1)),
        gstin TEXT,
        business_type TEXT,
        phone TEXT,
        email TEXT,
        logo_reference TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        CHECK (
          (gst_registered = 1 AND gstin IS NOT NULL)
          OR (gst_registered = 0 AND gstin IS NULL)
        )
      )
    `);
    db.exec(`
      CREATE TABLE business_setting (
        id TEXT PRIMARY KEY,
        business_id TEXT NOT NULL REFERENCES business(id),
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        UNIQUE (business_id, key)
      )
    `);
  },
};

export function createBusinessRepository(db: SchemaDatabase): BusinessRepository {
  return {
    get() {
      return readBusiness(db);
    },
    save(record) {
      db.exec("BEGIN IMMEDIATE");
      try {
        const existing = readBusiness(db);
        if (existing && existing.id !== record.id) {
          throw new BusinessProfileError("A business profile is already saved.");
        }
        if (existing) {
          updateBusiness(db, record);
        } else {
          insertBusiness(db, record);
        }
        replaceSettings(db, record);
        db.exec("COMMIT");
      } catch (error) {
        try {
          db.exec("ROLLBACK");
        } catch {
          // The failed statement may already have ended the transaction.
        }
        throw error;
      }
    },
  };
}

function readBusiness(db: SchemaDatabase): StoredBusiness | null {
  const rows = db
    .prepare(
      `SELECT id, legal_name, display_name, address, state_id, pin_code,
              gst_registered, gstin, business_type, phone, email, logo_reference,
              created_at, updated_at
       FROM business`,
    )
    .all();
  const row = rows[0];
  if (!row) {
    return null;
  }
  if (rows.length > 1) {
    throw new BusinessProfileError("More than one business profile is stored.");
  }
  const settings = db
    .prepare("SELECT key, value FROM business_setting WHERE business_id = ?")
    .all(text(row.id, "id"));
  return {
    id: text(row.id, "id"),
    legalName: text(row.legal_name, "legal_name"),
    displayName: text(row.display_name, "display_name"),
    address: text(row.address, "address"),
    stateId: text(row.state_id, "state_id"),
    pinCode: nullableText(row.pin_code),
    gstRegistered: row.gst_registered === 1,
    gstin: nullableText(row.gstin),
    businessType: nullableText(row.business_type),
    phone: nullableText(row.phone),
    email: nullableText(row.email),
    logoReference: nullableText(row.logo_reference),
    paymentDetails: settingValue(settings, "payment_details"),
    invoicePreferences: settingValue(settings, "invoice_preferences"),
    createdAt: text(row.created_at, "created_at"),
    updatedAt: text(row.updated_at, "updated_at"),
  };
}

function insertBusiness(db: SchemaDatabase, record: StoredBusiness): void {
  db.prepare(
    `INSERT INTO business (
      id, legal_name, display_name, address, state_id, pin_code, gst_registered, gstin,
      business_type, phone, email, logo_reference, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    record.id,
    record.legalName,
    record.displayName,
    record.address,
    record.stateId,
    record.pinCode,
    record.gstRegistered ? 1 : 0,
    record.gstin,
    record.businessType,
    record.phone,
    record.email,
    record.logoReference,
    record.createdAt,
    record.updatedAt,
  );
}

function updateBusiness(db: SchemaDatabase, record: StoredBusiness): void {
  db.prepare(
    `UPDATE business SET
      legal_name = ?, display_name = ?, address = ?, state_id = ?, pin_code = ?,
      gst_registered = ?, gstin = ?, business_type = ?, phone = ?, email = ?,
      logo_reference = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    record.legalName,
    record.displayName,
    record.address,
    record.stateId,
    record.pinCode,
    record.gstRegistered ? 1 : 0,
    record.gstin,
    record.businessType,
    record.phone,
    record.email,
    record.logoReference,
    record.updatedAt,
    record.id,
  );
}

function replaceSettings(db: SchemaDatabase, record: StoredBusiness): void {
  db.prepare("DELETE FROM business_setting WHERE business_id = ?").run(record.id);
  const insert = db.prepare(
    "INSERT INTO business_setting (id, business_id, key, value) VALUES (?, ?, ?, ?)",
  );
  const settings: Array<[string, string | null]> = [
    ["payment_details", record.paymentDetails],
    ["invoice_preferences", record.invoicePreferences],
  ];
  for (const [key, value] of settings) {
    if (value !== null) {
      insert.run(`${record.id}:${key}`, record.id, key, value);
    }
  }
}

function settingValue(rows: Record<string, unknown>[], key: string): string | null {
  const matches = rows.filter((row) => row.key === key);
  const match = matches[0];
  if (!match) {
    return null;
  }
  if (matches.length > 1) {
    throw new BusinessProfileError(`Business setting "${key}" is stored more than once.`);
  }
  return text(match.value, key);
}

function text(value: unknown, column: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new BusinessProfileError(`Stored business column ${column} is invalid.`);
  }
  return value;
}

function nullableText(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    throw new BusinessProfileError("A stored business field is invalid.");
  }
  return value;
}
