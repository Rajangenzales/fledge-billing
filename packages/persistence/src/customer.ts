import { type CustomerRepository, type StoredCustomer } from "@fledge/application";
import { CustomerError } from "@fledge/domain";
import type { SchemaDatabase } from "./connection.js";
import type { Migration } from "./migrate.js";

export const customerMaster: Migration = {
  version: 3,
  name: "customer",
  up(db) {
    db.exec(`
      CREATE TABLE customer (
        id TEXT PRIMARY KEY,
        business_id TEXT NOT NULL REFERENCES business(id),
        name TEXT NOT NULL,
        phone TEXT,
        email TEXT,
        gstin TEXT,
        registration_type TEXT NOT NULL CHECK (registration_type IN ('registered', 'unregistered')),
        billing_address TEXT NOT NULL,
        shipping_address TEXT,
        state_ut_id TEXT NOT NULL REFERENCES state_ut(id),
        pin_code TEXT,
        notes TEXT,
        active INTEGER NOT NULL CHECK (active IN (0, 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        CHECK (
          (registration_type = 'registered' AND gstin IS NOT NULL)
          OR (registration_type = 'unregistered' AND gstin IS NULL)
        )
      )
    `);
  },
};

export function createCustomerRepository(db: SchemaDatabase): CustomerRepository {
  return {
    getBusinessId() {
      return readBusinessId(db);
    },
    list() {
      const businessId = readBusinessId(db);
      if (!businessId) {
        return [];
      }
      return db
        .prepare(
          `SELECT id, business_id, name, phone, email, gstin, registration_type,
                  billing_address, shipping_address, state_ut_id, pin_code, notes,
                  active, created_at, updated_at
           FROM customer
           WHERE business_id = ?
           ORDER BY name COLLATE NOCASE ASC, id ASC`,
        )
        .all(businessId)
        .map(toStoredCustomer);
    },
    get(id) {
      const businessId = readBusinessId(db);
      if (!businessId) {
        return null;
      }
      const row = db
        .prepare(
          `SELECT id, business_id, name, phone, email, gstin, registration_type,
                  billing_address, shipping_address, state_ut_id, pin_code, notes,
                  active, created_at, updated_at
           FROM customer
           WHERE id = ? AND business_id = ?`,
        )
        .get(id, businessId);
      return row ? toStoredCustomer(row) : null;
    },
    insert(record) {
      write(db, record, false);
    },
    update(record) {
      write(db, record, true);
    },
  };
}

function write(db: SchemaDatabase, record: StoredCustomer, updating: boolean): void {
  db.exec("BEGIN IMMEDIATE");
  try {
    const businessId = readBusinessId(db);
    if (!businessId || businessId !== record.businessId) {
      throw new CustomerError("Save the business profile before adding a customer.");
    }
    if (updating) {
      const existing = db.prepare("SELECT id FROM customer WHERE id = ? AND business_id = ?").get(
        record.id,
        businessId,
      );
      if (!existing) {
        throw new CustomerError("That customer was not found.");
      }
      db.prepare(
        `UPDATE customer SET
          name = ?, phone = ?, email = ?, gstin = ?, registration_type = ?,
          billing_address = ?, shipping_address = ?, state_ut_id = ?, pin_code = ?,
          notes = ?, active = ?, updated_at = ?
         WHERE id = ? AND business_id = ?`,
      ).run(
        record.name,
        record.phone,
        record.email,
        record.gstin,
        record.registrationType,
        record.billingAddress,
        record.shippingAddress,
        record.stateId,
        record.pinCode,
        record.notes,
        record.active ? 1 : 0,
        record.updatedAt,
        record.id,
        record.businessId,
      );
    } else {
      db.prepare(
        `INSERT INTO customer (
          id, business_id, name, phone, email, gstin, registration_type,
          billing_address, shipping_address, state_ut_id, pin_code, notes,
          active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        record.id,
        record.businessId,
        record.name,
        record.phone,
        record.email,
        record.gstin,
        record.registrationType,
        record.billingAddress,
        record.shippingAddress,
        record.stateId,
        record.pinCode,
        record.notes,
        record.active ? 1 : 0,
        record.createdAt,
        record.updatedAt,
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // The failed statement may already have ended the transaction.
    }
    throw error;
  }
}

function readBusinessId(db: SchemaDatabase): string | null {
  const rows = db.prepare("SELECT id FROM business").all();
  const row = rows[0];
  if (!row) {
    return null;
  }
  if (rows.length > 1) {
    throw new CustomerError("More than one business profile is stored.");
  }
  if (typeof row.id !== "string" || row.id.length === 0) {
    throw new CustomerError("The stored business profile is invalid.");
  }
  return row.id;
}

function toStoredCustomer(row: Record<string, unknown>): StoredCustomer {
  const registrationType = row.registration_type;
  if (registrationType !== "registered" && registrationType !== "unregistered") {
    throw new CustomerError("The stored customer registration type is invalid.");
  }
  return {
    id: text(row.id, "id"),
    businessId: text(row.business_id, "business_id"),
    name: text(row.name, "name"),
    phone: nullableText(row.phone),
    email: nullableText(row.email),
    gstin: nullableText(row.gstin),
    registrationType,
    billingAddress: text(row.billing_address, "billing_address"),
    shippingAddress: nullableText(row.shipping_address),
    stateId: text(row.state_ut_id, "state_ut_id"),
    pinCode: nullableText(row.pin_code),
    notes: nullableText(row.notes),
    active: row.active === 1,
    createdAt: text(row.created_at, "created_at"),
    updatedAt: text(row.updated_at, "updated_at"),
  };
}

function text(value: unknown, column: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new CustomerError(`Stored customer column ${column} is invalid.`);
  }
  return value;
}

function nullableText(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    throw new CustomerError("A stored customer field is invalid.");
  }
  return value;
}
