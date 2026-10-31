import type { CustomerReceipt, CustomerReceiptRepository, PaymentMethod, ReceiptIdentitySnapshot } from "@fledge/application";
import { CustomerReceiptError } from "@fledge/application";
import type { SchemaDatabase } from "./connection.js";
import type { Migration } from "./migrate.js";

export const customerReceipt: Migration = {
  version: 9,
  name: "customer-receipt",
  up(db) {
    db.exec(`
      CREATE TABLE customer_receipt (
        id TEXT PRIMARY KEY,
        business_id TEXT NOT NULL REFERENCES business(id),
        customer_id TEXT NOT NULL REFERENCES customer(id),
        amount TEXT NOT NULL,
        currency TEXT NOT NULL CHECK (currency = 'INR'),
        payment_date TEXT NOT NULL,
        method TEXT NOT NULL CHECK (method IN ('cash', 'upi', 'bank_transfer', 'card', 'cheque', 'other')),
        reference TEXT,
        notes TEXT,
        idempotency_key TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        UNIQUE (business_id, idempotency_key),
        CHECK (length(payment_date) = 10)
      )
    `);
    db.exec("CREATE INDEX customer_receipt_customer_date_idx ON customer_receipt (business_id, customer_id, payment_date, recorded_at)");
  },
};

export function createCustomerReceiptRepository(db: SchemaDatabase): CustomerReceiptRepository {
  return {
    getBusinessId() {
      const rows = db.prepare("SELECT id FROM business").all();
      if (rows.length > 1) throw new CustomerReceiptError("More than one business profile is stored.");
      const id = rows[0]?.id;
      return typeof id === "string" ? id : null;
    },
    customerExists(customerId, businessId) {
      return Boolean(db.prepare("SELECT id FROM customer WHERE id = ? AND business_id = ?").get(customerId, businessId));
    },
    insert(record) {
      return transaction(db, () => {
        const existing = db.prepare(
          "SELECT * FROM customer_receipt WHERE business_id = ? AND idempotency_key = ?",
        ).get(record.businessId, record.idempotencyKey);
        if (existing) {
          const saved = toReceipt(existing);
          if (!sameRequest(saved, record)) {
            throw new CustomerReceiptError("This receipt request key was already used for different receipt details.");
          }
          return saved;
        }
        if (!this.customerExists(record.customerId, record.businessId)) {
          throw new CustomerReceiptError("Choose a customer belonging to this business.");
        }
        const identitySnapshot = captureIdentitySnapshot(db, record.businessId, record.customerId);
        db.prepare(`
          INSERT INTO customer_receipt (
            id, business_id, customer_id, amount, currency, payment_date,
            method, reference, notes, idempotency_key, recorded_at, identity_snapshot_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          record.id, record.businessId, record.customerId, record.amount, record.currency,
          record.paymentDate, record.method, record.reference, record.notes,
          record.idempotencyKey, record.recordedAt, JSON.stringify(identitySnapshot),
        );
        return { ...record, identitySnapshot };
      });
    },
    list(customerId) {
      const businessId = this.getBusinessId();
      if (!businessId) return [];
      return db.prepare(`
        SELECT * FROM customer_receipt
        WHERE business_id = ? AND customer_id = ?
        ORDER BY payment_date DESC, recorded_at DESC, id DESC
      `).all(businessId, customerId).map(toReceipt);
    },
    allocatedTotal(customerId) {
      const businessId = this.getBusinessId();
      if (!businessId) return "0";
      const rows = db.prepare("SELECT id, amount FROM payment_allocation_event WHERE business_id = ? AND customer_id = ? AND event_type = 'allocate'").all(businessId, customerId);
      let paise = 0n;
      for (const row of rows) {
        const released = db.prepare("SELECT id FROM payment_allocation_event WHERE allocation_id = ? AND event_type = 'release'").get(text(row.id));
        if (!released) {
          const value = row.amount;
          if (typeof value !== "string" || !/^\d+(?:\.\d{1,2})?$/.test(value)) throw new CustomerReceiptError("A saved allocation amount is invalid.");
          const [whole, fraction = ""] = value.split(".");
          paise += BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, "0"));
        }
      }
      return formatPaise(paise);
    },
    adjustmentTotals(customerId) {
      const businessId = this.getBusinessId();
      if (!businessId) return { refundedAmount: "0", reversedReceiptAmount: "0" };
      const rows = db.prepare("SELECT * FROM payment_adjustment_event WHERE business_id = ? AND customer_id = ?").all(businessId, customerId);
      let refunded = 0n;
      let reversedReceipt = 0n;
      for (const row of rows) {
        if (row.event_type === "refund") {
          const reversed = db.prepare("SELECT id FROM payment_adjustment_event WHERE original_event_id = ? AND event_type = 'reverse_refund'").get(text(row.id));
          if (!reversed) refunded += amountPaise(text(row.amount));
        }
        if (row.event_type === "reverse_receipt") reversedReceipt += amountPaise(text(row.amount));
      }
      return { refundedAmount: formatPaise(refunded), reversedReceiptAmount: formatPaise(reversedReceipt) };
    },
    total(customerId) {
      const businessId = this.getBusinessId();
      if (!businessId) return "0";
      const rows = db.prepare(`
        SELECT amount FROM customer_receipt WHERE business_id = ? AND customer_id = ?
      `).all(businessId, customerId);
      // Amounts are decimal strings. Sum using integer paise, never floating point.
      let paise = 0n;
      for (const row of rows) {
        const value = row.amount;
        if (typeof value !== "string" || !/^\d+(?:\.\d{1,2})?$/.test(value)) {
          throw new CustomerReceiptError("A saved receipt amount is invalid.");
        }
        const [whole, fraction = ""] = value.split(".");
        paise += BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, "0"));
      }
      return formatPaise(paise);
    },
  };
}

function sameRequest(left: CustomerReceipt, right: CustomerReceipt): boolean {
  return left.businessId === right.businessId &&
    left.customerId === right.customerId &&
    left.amount === right.amount &&
    left.paymentDate === right.paymentDate &&
    left.method === right.method &&
    left.reference === right.reference &&
    left.notes === right.notes;
}

function toReceipt(row: Record<string, unknown>): CustomerReceipt {
  const method = row.method;
  if (method !== "cash" && method !== "upi" && method !== "bank_transfer" &&
      method !== "card" && method !== "cheque" && method !== "other") {
    throw new CustomerReceiptError("A saved receipt payment method is invalid.");
  }
  return {
    id: text(row.id), businessId: text(row.business_id), customerId: text(row.customer_id),
    amount: text(row.amount), currency: "INR", paymentDate: text(row.payment_date),
    method: method as PaymentMethod, reference: nullableText(row.reference),
    notes: nullableText(row.notes), idempotencyKey: text(row.idempotency_key),
    recordedAt: text(row.recorded_at),
    identitySnapshot: parseIdentitySnapshot(row.identity_snapshot_json),
  };
}

function captureIdentitySnapshot(
  db: SchemaDatabase,
  businessId: string,
  customerId: string,
): ReceiptIdentitySnapshot {
  const business = db.prepare(`
    SELECT b.legal_name, b.display_name, b.address, b.state_id, bs.name AS state_name,
           b.pin_code, b.gst_registered, b.gstin, b.business_type, b.phone, b.email
    FROM business b
    JOIN state_ut bs ON bs.id = b.state_id
    WHERE b.id = ?
  `).get(businessId);
  const customer = db.prepare(`
    SELECT c.name, c.phone, c.email, c.gstin, c.registration_type,
           c.billing_address, c.shipping_address, c.state_ut_id, cs.name AS state_name,
           c.pin_code
    FROM customer c
    JOIN state_ut cs ON cs.id = c.state_ut_id
    WHERE c.id = ? AND c.business_id = ?
  `).get(customerId, businessId);
  if (!business || !customer) {
    throw new CustomerReceiptError("Business or customer identity could not be captured.");
  }
  const registrationType = customer.registration_type;
  if (registrationType !== "registered" && registrationType !== "unregistered") {
    throw new CustomerReceiptError("The customer registration type is invalid.");
  }
  return {
    business: {
      legalName: text(business.legal_name), displayName: text(business.display_name),
      address: text(business.address), stateId: text(business.state_id),
      stateName: text(business.state_name), pinCode: nullableText(business.pin_code),
      gstRegistered: business.gst_registered === 1, gstin: nullableText(business.gstin),
      businessType: nullableText(business.business_type), phone: nullableText(business.phone),
      email: nullableText(business.email),
    },
    customer: {
      name: text(customer.name), phone: nullableText(customer.phone), email: nullableText(customer.email),
      gstin: nullableText(customer.gstin), registrationType, billingAddress: text(customer.billing_address),
      shippingAddress: nullableText(customer.shipping_address), stateId: text(customer.state_ut_id),
      stateName: text(customer.state_name), pinCode: nullableText(customer.pin_code),
    },
  };
}

function parseIdentitySnapshot(value: unknown): ReceiptIdentitySnapshot | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new CustomerReceiptError("A saved receipt identity snapshot is invalid.");
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || !("business" in parsed) || !("customer" in parsed)) {
      throw new Error("Invalid snapshot shape");
    }
    return parsed as ReceiptIdentitySnapshot;
  } catch {
    throw new CustomerReceiptError("A saved receipt identity snapshot is unreadable.");
  }
}

function text(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw new CustomerReceiptError("A saved receipt field is invalid.");
  return value;
}
function nullableText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new CustomerReceiptError("A saved receipt field is invalid.");
  return value;
}
function amountPaise(value: string): bigint {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) throw new CustomerReceiptError("A saved adjustment amount is invalid.");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, "0"));
}
function formatPaise(value: bigint): string {
  const whole = value / 100n;
  const fraction = (value % 100n).toString().padStart(2, "0");
  return fraction === "00" ? whole.toString() : `${whole}.${fraction}`;
}
function transaction<T>(db: SchemaDatabase, work: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch { /* transaction already ended */ }
    throw error;
  }
}
