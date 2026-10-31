import type { AllocationEvent, AllocationRepository, InvoiceSettlement } from "@fledge/application";
import { AllocationError } from "@fledge/application";
import type { SchemaDatabase } from "./connection.js";
import type { Migration } from "./migrate.js";

export const allocationEvents: Migration = {
  version: 10,
  name: "payment-allocation-events",
  up(db) {
    db.exec(`
      CREATE TABLE payment_allocation_event (
        id TEXT PRIMARY KEY,
        business_id TEXT NOT NULL REFERENCES business(id),
        customer_id TEXT NOT NULL REFERENCES customer(id),
        receipt_id TEXT NOT NULL REFERENCES customer_receipt(id),
        invoice_id TEXT NOT NULL REFERENCES document(id),
        event_type TEXT NOT NULL CHECK (event_type IN ('allocate', 'release')),
        allocation_id TEXT REFERENCES payment_allocation_event(id),
        amount TEXT NOT NULL,
        reason TEXT,
        idempotency_key TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        UNIQUE (business_id, idempotency_key),
        CHECK (
          (event_type = 'allocate' AND allocation_id IS NULL AND amount <> '0')
          OR (event_type = 'release' AND allocation_id IS NOT NULL)
        )
      )
    `);
    db.exec("CREATE UNIQUE INDEX payment_allocation_release_once_idx ON payment_allocation_event (allocation_id) WHERE event_type = 'release'");
    db.exec("CREATE INDEX payment_allocation_receipt_idx ON payment_allocation_event (business_id, receipt_id, recorded_at)");
    db.exec("CREATE INDEX payment_allocation_invoice_idx ON payment_allocation_event (business_id, invoice_id, recorded_at)");
  },
};

export function createAllocationRepository(db: SchemaDatabase): AllocationRepository {
  return {
    getBusinessId() {
      const rows = db.prepare("SELECT id FROM business").all();
      if (rows.length > 1) throw new AllocationError("More than one business profile is stored.");
      return typeof rows[0]?.id === "string" ? rows[0].id as string : null;
    },
    allocate(event) {
      return transaction(db, () => {
        const prior = byKey(db, event.businessId, event.idempotencyKey);
        if (prior) {
          if (!sameCommand(prior, event)) throw new AllocationError("This allocation request key was already used for different details.");
          return prior;
        }
        const receipt = db.prepare("SELECT business_id, customer_id, amount FROM customer_receipt WHERE id = ?").get(event.receiptId);
        if (!receipt || receipt.business_id !== event.businessId) throw new AllocationError("That receipt was not found for this business.");
        const invoice = db.prepare("SELECT business_id, customer_id, document_type, status, grand_total FROM document WHERE id = ?").get(event.invoiceId);
        if (!invoice || invoice.business_id !== event.businessId) throw new AllocationError("That invoice was not found for this business.");
        if (receipt.customer_id !== invoice.customer_id) throw new AllocationError("The receipt and invoice must belong to the same customer.");
        if (event.customerId && event.customerId !== receipt.customer_id) throw new AllocationError("The receipt customer does not match.");
        if (invoice.status !== "finalized") throw new AllocationError("Only finalized invoices can receive an allocation.");
        if (!["tax_invoice", "non_gst_invoice", "bill_of_supply"].includes(String(invoice.document_type))) {
          throw new AllocationError("Choose a finalized invoice or bill of supply, not a quotation or receipt.");
        }
        const customerId = String(receipt.customer_id);
        const receiptAvailable = paise(String(receipt.amount)) - activeForReceipt(db, event.businessId, event.receiptId);
        if (paise(event.amount) > receiptAvailable) throw new AllocationError("The allocation exceeds the receipt's available balance.");
        const outstanding = paise(String(invoice.grand_total)) - activeForInvoice(db, event.businessId, event.invoiceId);
        if (paise(event.amount) > outstanding) throw new AllocationError("The allocation exceeds the invoice's outstanding amount.");
        const saved = { ...event, customerId };
        insertEvent(db, saved);
        return saved;
      });
    },
    release(event) {
      return transaction(db, () => {
        const prior = byKey(db, event.businessId, event.idempotencyKey);
        if (prior) {
          if (prior.eventType !== "release" || prior.allocationId !== event.allocationId || prior.reason !== event.reason) {
            throw new AllocationError("This release request key was already used for different details.");
          }
          return prior;
        }
        const original = db.prepare("SELECT * FROM payment_allocation_event WHERE id = ? AND business_id = ? AND event_type = 'allocate'").get(event.allocationId, event.businessId);
        if (!original) throw new AllocationError("That allocation was not found for this business.");
        const alreadyReleased = db.prepare("SELECT id FROM payment_allocation_event WHERE allocation_id = ? AND event_type = 'release'").get(event.allocationId);
        if (alreadyReleased) throw new AllocationError("That allocation has already been released.");
        const saved: AllocationEvent = {
          ...event,
          customerId: text(original.customer_id),
          receiptId: text(original.receipt_id),
          invoiceId: text(original.invoice_id),
          amount: text(original.amount),
        };
        insertEvent(db, saved);
        return saved;
      });
    },
    listReceiptEvents(receiptId) {
      const businessId = this.getBusinessId();
      if (!businessId) return [];
      return db.prepare("SELECT * FROM payment_allocation_event WHERE business_id = ? AND receipt_id = ? ORDER BY recorded_at, id").all(businessId, receiptId).map(toEvent);
    },
    getInvoiceSettlement(invoiceId) {
      const businessId = this.getBusinessId();
      if (!businessId) return null;
      const invoice = db.prepare("SELECT customer_id, document_type, status, grand_total FROM document WHERE id = ? AND business_id = ?").get(invoiceId, businessId);
      if (!invoice) return null;
      if (invoice.status !== "finalized" || !["tax_invoice", "non_gst_invoice", "bill_of_supply"].includes(String(invoice.document_type))) {
        throw new AllocationError("Payment settlement is available only for finalized invoices and bills of supply.");
      }
      const allocated = activeForInvoice(db, businessId, invoiceId);
      const total = paise(String(invoice.grand_total));
      if (allocated > total) throw new AllocationError("Saved allocations exceed the invoice total. Review the payment history.");
      const outstanding = total - allocated;
      return {
        invoiceId, currency: "INR", invoiceTotal: formatPaise(total),
        allocatedAmount: formatPaise(allocated), outstandingAmount: formatPaise(outstanding),
        paymentStatus: allocated === 0n ? "unpaid" : outstanding === 0n ? "paid" : "partially_paid",
      };
    },
    getCustomerAllocatedTotal(customerId) {
      const businessId = this.getBusinessId();
      if (!businessId) return "0";
      const rows = db.prepare("SELECT id, amount FROM payment_allocation_event WHERE business_id = ? AND customer_id = ? AND event_type = 'allocate'").all(businessId, customerId);
      let total = 0n;
      for (const row of rows) {
        const allocation = db.prepare("SELECT id FROM payment_allocation_event WHERE allocation_id = ? AND event_type = 'release'").get(text(row.id));
        if (!allocation) total += paise(text(row.amount));
      }
      return formatPaise(total);
    },
  };
}

function insertEvent(db: SchemaDatabase, event: AllocationEvent): void {
  db.prepare(`
    INSERT INTO payment_allocation_event (
      id, business_id, customer_id, receipt_id, invoice_id, event_type,
      allocation_id, amount, reason, idempotency_key, recorded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(event.id, event.businessId, event.customerId, event.receiptId, event.invoiceId,
    event.eventType, event.allocationId, event.amount, event.reason, event.idempotencyKey, event.recordedAt);
}
function byKey(db: SchemaDatabase, businessId: string, key: string): AllocationEvent | null {
  const row = db.prepare("SELECT * FROM payment_allocation_event WHERE business_id = ? AND idempotency_key = ?").get(businessId, key);
  return row ? toEvent(row) : null;
}
function toEvent(row: Record<string, unknown>): AllocationEvent {
  const eventType = row.event_type;
  if (eventType !== "allocate" && eventType !== "release") throw new AllocationError("A saved allocation event is invalid.");
  return {
    id: text(row.id), businessId: text(row.business_id), customerId: text(row.customer_id),
    receiptId: text(row.receipt_id), invoiceId: text(row.invoice_id), eventType,
    allocationId: nullableText(row.allocation_id), amount: text(row.amount),
    reason: nullableText(row.reason), idempotencyKey: text(row.idempotency_key), recordedAt: text(row.recorded_at),
  };
}
function activeForReceipt(db: SchemaDatabase, businessId: string, receiptId: string): bigint {
  const rows = db.prepare("SELECT event_type, amount FROM payment_allocation_event WHERE business_id = ? AND receipt_id = ?").all(businessId, receiptId);
  return rows.reduce((sum, row) => sum + (row.event_type === "allocate" ? paise(text(row.amount)) : -paise(text(row.amount))), 0n);
}
function activeForInvoice(db: SchemaDatabase, businessId: string, invoiceId: string): bigint {
  const rows = db.prepare("SELECT event_type, amount FROM payment_allocation_event WHERE business_id = ? AND invoice_id = ?").all(businessId, invoiceId);
  return rows.reduce((sum, row) => sum + (row.event_type === "allocate" ? paise(text(row.amount)) : -paise(text(row.amount))), 0n);
}
function sameCommand(left: AllocationEvent, right: AllocationEvent): boolean {
  return left.eventType === right.eventType && left.receiptId === right.receiptId &&
    left.invoiceId === right.invoiceId && left.amount === right.amount;
}
function paise(value: string): bigint {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) throw new AllocationError("A saved financial amount is invalid.");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, "0"));
}
function formatPaise(value: bigint): string {
  const whole = value / 100n;
  const fraction = (value % 100n).toString().padStart(2, "0");
  return fraction === "00" ? whole.toString() : `${whole}.${fraction}`;
}
function text(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw new AllocationError("A saved allocation field is invalid.");
  return value;
}
function nullableText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new AllocationError("A saved allocation field is invalid.");
  return value;
}
function transaction<T>(db: SchemaDatabase, work: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try { const result = work(); db.exec("COMMIT"); return result; }
  catch (error) { try { db.exec("ROLLBACK"); } catch { /* already ended */ } throw error; }
}
