import type { PaymentAdjustmentEvent, PaymentAdjustmentRepository, PaymentAdjustmentTotals } from "@fledge/application";
import { PaymentAdjustmentError } from "@fledge/application";
import type { SchemaDatabase } from "./connection.js";
import type { Migration } from "./migrate.js";

export const paymentAdjustments: Migration = {
  version: 11,
  name: "payment-refund-reversal-events",
  up(db) {
    db.exec(`
      CREATE TABLE payment_adjustment_event (
        id TEXT PRIMARY KEY,
        business_id TEXT NOT NULL REFERENCES business(id),
        customer_id TEXT NOT NULL REFERENCES customer(id),
        receipt_id TEXT NOT NULL REFERENCES customer_receipt(id),
        event_type TEXT NOT NULL CHECK (event_type IN ('refund', 'reverse_receipt', 'reverse_refund')),
        original_event_id TEXT,
        amount TEXT NOT NULL,
        payment_date TEXT,
        method TEXT CHECK (method IS NULL OR method IN ('cash', 'upi', 'bank_transfer', 'card', 'cheque', 'other')),
        reason TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        UNIQUE (business_id, idempotency_key),
        CHECK (
          (event_type = 'refund' AND original_event_id IS NULL AND amount <> '0' AND payment_date IS NOT NULL AND method IS NOT NULL)
          OR (event_type = 'reverse_receipt' AND original_event_id IS NULL AND amount <> '0' AND payment_date IS NULL AND method IS NULL)
          OR (event_type = 'reverse_refund' AND original_event_id IS NOT NULL AND amount <> '0' AND payment_date IS NULL AND method IS NULL)
        )
      )
    `);
    db.exec("CREATE UNIQUE INDEX payment_adjustment_receipt_reverse_once_idx ON payment_adjustment_event (receipt_id) WHERE event_type = 'reverse_receipt'");
    db.exec("CREATE UNIQUE INDEX payment_adjustment_refund_reverse_once_idx ON payment_adjustment_event (original_event_id) WHERE event_type = 'reverse_refund'");
    db.exec("CREATE INDEX payment_adjustment_customer_idx ON payment_adjustment_event (business_id, customer_id, receipt_id, recorded_at)");
  },
};

export function createPaymentAdjustmentRepository(db: SchemaDatabase): PaymentAdjustmentRepository {
  return {
    getBusinessId() {
      const rows = db.prepare("SELECT id FROM business").all();
      if (rows.length > 1) throw new PaymentAdjustmentError("More than one business profile is stored.");
      return typeof rows[0]?.id === "string" ? rows[0].id as string : null;
    },
    customerExists(customerId, businessId) {
      return Boolean(db.prepare("SELECT id FROM customer WHERE id = ? AND business_id = ?").get(customerId, businessId));
    },
    recordRefund(event) {
      return transaction(db, () => {
        const prior = byKey(db, event.businessId, event.idempotencyKey);
        if (prior) {
          if (prior.eventType !== "refund" || prior.receiptId !== event.receiptId || prior.amount !== event.amount ||
              prior.paymentDate !== event.paymentDate || prior.method !== event.method || prior.reason !== event.reason) {
            throw new PaymentAdjustmentError("This refund request key was already used for different details.");
          }
          return prior;
        }
        const receipt = receiptFor(db, event.businessId, event.receiptId);
        if (!receipt) throw new PaymentAdjustmentError("That receipt was not found for this business.");
        if (event.customerId && event.customerId !== receipt.customerId) throw new PaymentAdjustmentError("The receipt customer does not match.");
        if (receiptReversed(db, event.businessId, event.receiptId)) throw new PaymentAdjustmentError("A reversed receipt cannot be refunded.");
        if (activeAllocation(db, event.businessId, event.receiptId) > 0n) {
          throw new PaymentAdjustmentError("Release the receipt's active invoice allocations before recording a refund.");
        }
        const refundable = paise(receipt.amount) - netRefunded(db, event.businessId, event.receiptId);
        if (paise(event.amount) > refundable) throw new PaymentAdjustmentError("The refund exceeds the receipt's remaining refundable amount.");
        const saved = { ...event, customerId: receipt.customerId };
        insert(db, saved);
        return saved;
      });
    },
    reverseReceipt(event) {
      return transaction(db, () => {
        const prior = byKey(db, event.businessId, event.idempotencyKey);
        if (prior) {
          if (prior.eventType !== "reverse_receipt" || prior.receiptId !== event.receiptId || prior.reason !== event.reason) {
            throw new PaymentAdjustmentError("This receipt-reversal key was already used for different details.");
          }
          return prior;
        }
        const receipt = receiptFor(db, event.businessId, event.receiptId);
        if (!receipt) throw new PaymentAdjustmentError("That receipt was not found for this business.");
        if (activeAllocation(db, event.businessId, event.receiptId) > 0n) {
          throw new PaymentAdjustmentError("Release the receipt's active invoice allocations before reversing it.");
        }
        if (netRefunded(db, event.businessId, event.receiptId) > 0n) {
          throw new PaymentAdjustmentError("Reverse or resolve the receipt's refunds before reversing the receipt.");
        }
        if (receiptReversed(db, event.businessId, event.receiptId)) {
          throw new PaymentAdjustmentError("That receipt has already been reversed.");
        }
        const saved = { ...event, customerId: receipt.customerId, amount: receipt.amount };
        insert(db, saved);
        return saved;
      });
    },
    reverseRefund(event) {
      return transaction(db, () => {
        const prior = byKey(db, event.businessId, event.idempotencyKey);
        if (prior) {
          if (prior.eventType !== "reverse_refund" || prior.originalEventId !== event.originalEventId || prior.reason !== event.reason) {
            throw new PaymentAdjustmentError("This refund-reversal key was already used for different details.");
          }
          return prior;
        }
        const original = db.prepare("SELECT * FROM payment_adjustment_event WHERE id = ? AND business_id = ? AND event_type = 'refund'").get(event.originalEventId, event.businessId);
        if (!original) throw new PaymentAdjustmentError("That original refund was not found for this business.");
        const alreadyReversed = db.prepare("SELECT id FROM payment_adjustment_event WHERE original_event_id = ? AND event_type = 'reverse_refund'").get(event.originalEventId);
        if (alreadyReversed) throw new PaymentAdjustmentError("That refund entry has already been reversed.");
        const saved: PaymentAdjustmentEvent = {
          ...event, customerId: text(original.customer_id), receiptId: text(original.receipt_id),
          amount: text(original.amount),
        };
        insert(db, saved);
        return saved;
      });
    },
    list(receiptId) {
      const businessId = this.getBusinessId();
      if (!businessId) return [];
      return db.prepare("SELECT * FROM payment_adjustment_event WHERE business_id = ? AND receipt_id = ? ORDER BY recorded_at, id")
        .all(businessId, receiptId).map(toEvent);
    },
    totals(customerId): PaymentAdjustmentTotals {
      const businessId = this.getBusinessId();
      if (!businessId) return { refundedAmount: "0", reversedReceiptAmount: "0" };
      const rows = db.prepare("SELECT * FROM payment_adjustment_event WHERE business_id = ? AND customer_id = ?")
        .all(businessId, customerId).map(toEvent);
      let refunds = 0n;
      let reversedReceipts = 0n;
      for (const event of rows) {
        if (event.eventType === "refund" && !rows.some(item => item.eventType === "reverse_refund" && item.originalEventId === event.id)) refunds += paise(event.amount);
        if (event.eventType === "reverse_refund") refunds -= paise(event.amount);
        if (event.eventType === "reverse_receipt") reversedReceipts += paise(event.amount);
      }
      return { refundedAmount: formatPaise(refunds), reversedReceiptAmount: formatPaise(reversedReceipts) };
    },
  };
}

function receiptFor(db: SchemaDatabase, businessId: string, receiptId: string): { customerId: string; amount: string } | null {
  const row = db.prepare("SELECT customer_id, amount FROM customer_receipt WHERE id = ? AND business_id = ?").get(receiptId, businessId);
  return row ? { customerId: text(row.customer_id), amount: text(row.amount) } : null;
}
function activeAllocation(db: SchemaDatabase, businessId: string, receiptId: string): bigint {
  const rows = db.prepare("SELECT event_type, amount FROM payment_allocation_event WHERE business_id = ? AND receipt_id = ?").all(businessId, receiptId);
  return rows.reduce((sum, row) => sum + (row.event_type === "allocate" ? paise(text(row.amount)) : -paise(text(row.amount))), 0n);
}
function receiptReversed(db: SchemaDatabase, businessId: string, receiptId: string): boolean {
  return Boolean(db.prepare("SELECT id FROM payment_adjustment_event WHERE business_id = ? AND receipt_id = ? AND event_type = 'reverse_receipt'").get(businessId, receiptId));
}
function netRefunded(db: SchemaDatabase, businessId: string, receiptId: string): bigint {
  const rows = db.prepare("SELECT id, event_type, original_event_id, amount FROM payment_adjustment_event WHERE business_id = ? AND receipt_id = ?").all(businessId, receiptId);
  let total = 0n;
  for (const row of rows) {
    if (row.event_type === "refund") {
      const reversed = db.prepare("SELECT id FROM payment_adjustment_event WHERE original_event_id = ? AND event_type = 'reverse_refund'").get(text(row.id));
      if (!reversed) total += paise(text(row.amount));
    }
  }
  return total;
}
function insert(db: SchemaDatabase, event: PaymentAdjustmentEvent): void {
  db.prepare(`INSERT INTO payment_adjustment_event (
    id, business_id, customer_id, receipt_id, event_type, original_event_id,
    amount, payment_date, method, reason, idempotency_key, recorded_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    event.id, event.businessId, event.customerId, event.receiptId, event.eventType, event.originalEventId,
    event.amount, event.paymentDate, event.method, event.reason, event.idempotencyKey, event.recordedAt,
  );
}
function byKey(db: SchemaDatabase, businessId: string, key: string): PaymentAdjustmentEvent | null {
  const row = db.prepare("SELECT * FROM payment_adjustment_event WHERE business_id = ? AND idempotency_key = ?").get(businessId, key);
  return row ? toEvent(row) : null;
}
function toEvent(row: Record<string, unknown>): PaymentAdjustmentEvent {
  const eventType = row.event_type;
  if (eventType !== "refund" && eventType !== "reverse_receipt" && eventType !== "reverse_refund") throw new PaymentAdjustmentError("A saved payment adjustment is invalid.");
  const method = row.method;
  if (method !== null && method !== undefined && !["cash", "upi", "bank_transfer", "card", "cheque", "other"].includes(String(method))) throw new PaymentAdjustmentError("A saved refund method is invalid.");
  return {
    id: text(row.id), businessId: text(row.business_id), customerId: text(row.customer_id), receiptId: text(row.receipt_id),
    eventType, originalEventId: nullableText(row.original_event_id), amount: text(row.amount),
    paymentDate: nullableText(row.payment_date), method: method == null ? null : method as PaymentAdjustmentEvent["method"],
    reason: text(row.reason), idempotencyKey: text(row.idempotency_key), recordedAt: text(row.recorded_at),
  };
}
function paise(value: string): bigint {
  if (!/^\\d+(?:\\.\\d{1,2})?$/.test(value)) throw new PaymentAdjustmentError("A saved financial amount is invalid.");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, "0"));
}
function formatPaise(value: bigint): string {
  const whole = value / 100n;
  const fraction = (value % 100n).toString().padStart(2, "0");
  return fraction === "00" ? whole.toString() : `${whole}.${fraction}`;
}
function text(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw new PaymentAdjustmentError("A saved payment adjustment field is invalid.");
  return value;
}
function nullableText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new PaymentAdjustmentError("A saved payment adjustment field is invalid.");
  return value;
}
function transaction<T>(db: SchemaDatabase, work: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try { const result = work(); db.exec("COMMIT"); return result; }
  catch (error) { try { db.exec("ROLLBACK"); } catch { /* already ended */ } throw error; }
}
