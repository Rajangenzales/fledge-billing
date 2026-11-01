import { getCustomerAdvance, listCustomerReceipts, type CustomerReceiptDeps } from "./customer-receipt.js";
import { getCustomerAllocatedTotal, type AllocationDeps } from "./allocation.js";
import { listReceiptAdjustments, type PaymentAdjustmentDeps } from "./payment-adjustment.js";

export type CustomerPaymentActivityType =
  | "receipt"
  | "allocation"
  | "allocation_release"
  | "refund"
  | "receipt_reversal"
  | "refund_reversal";

export type CustomerPaymentActivityEntry = {
  id: string;
  receiptId: string;
  invoiceId: string | null;
  type: CustomerPaymentActivityType;
  effectiveDate: string;
  recordedAt: string;
  amount: string;
  method: string | null;
  reference: string | null;
  reason: string | null;
};

export type CustomerPaymentActivity = {
  customerId: string;
  currency: "INR";
  summary: {
    receiptCount: number;
    totalReceived: string;
    totalAllocated: string;
    totalRefunded: string;
    totalReversedReceipts: string;
    unallocatedAdvance: string;
  };
  entries: CustomerPaymentActivityEntry[];
};

export type CustomerPaymentActivityDeps = {
  receipts: CustomerReceiptDeps;
  allocations: AllocationDeps;
  adjustments: PaymentAdjustmentDeps;
};

/**
 * Read-only customer payment activity. This is not a double-entry accounting ledger
 * and deliberately does not apply credit/debit-note effects or infer tax treatment.
 */
export function getCustomerPaymentActivity(
  customerId: string,
  deps: CustomerPaymentActivityDeps,
): CustomerPaymentActivity {
  const receipts = listCustomerReceipts(customerId, deps.receipts);
  const advance = getCustomerAdvance(customerId, deps.receipts);
  const entries: CustomerPaymentActivityEntry[] = [];

  for (const receipt of receipts) {
    entries.push({
      id: receipt.id,
      receiptId: receipt.id,
      invoiceId: null,
      type: "receipt",
      effectiveDate: receipt.paymentDate,
      recordedAt: receipt.recordedAt,
      amount: receipt.amount,
      method: receipt.method,
      reference: receipt.reference,
      reason: receipt.notes,
    });

    for (const event of deps.allocations.repository.listReceiptEvents(receipt.id)) {
      entries.push({
        id: event.id,
        receiptId: receipt.id,
        invoiceId: event.invoiceId,
        type: event.eventType === "allocate" ? "allocation" : "allocation_release",
        effectiveDate: event.recordedAt.slice(0, 10),
        recordedAt: event.recordedAt,
        amount: event.amount,
        method: null,
        reference: event.allocationId,
        reason: event.reason,
      });
    }

    for (const event of listReceiptAdjustments(receipt.id, deps.adjustments)) {
      entries.push({
        id: event.id,
        receiptId: receipt.id,
        invoiceId: null,
        type: event.eventType === "reverse_receipt"
          ? "receipt_reversal"
          : event.eventType === "reverse_refund" ? "refund_reversal" : "refund",
        effectiveDate: event.paymentDate ?? event.recordedAt.slice(0, 10),
        recordedAt: event.recordedAt,
        amount: event.amount,
        method: event.method,
        reference: event.originalEventId,
        reason: event.reason,
      });
    }
  }

  entries.sort((a, b) =>
    a.effectiveDate.localeCompare(b.effectiveDate) ||
    a.recordedAt.localeCompare(b.recordedAt) ||
    a.id.localeCompare(b.id),
  );

  const adjustments = deps.adjustments.repository.totals(customerId);
  return {
    customerId,
    currency: "INR",
    summary: {
      receiptCount: advance.receiptCount,
      totalReceived: deps.receipts.repository.total(customerId),
      totalAllocated: getCustomerAllocatedTotal(customerId, deps.allocations),
      totalRefunded: adjustments.refundedAmount,
      totalReversedReceipts: adjustments.reversedReceiptAmount,
      unallocatedAdvance: advance.unallocatedAmount,
    },
    entries,
  };
}
