import type { CustomerReceipt } from "./customer-receipt.js";
import type { AllocationEvent } from "./allocation.js";
import type { PaymentAdjustmentEvent, PaymentAdjustmentTotals } from "./payment-adjustment.js";

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
  description: string | null;
};
export type CustomerPaymentActivitySnapshot = {
  receipts: CustomerReceipt[];
  allocations: AllocationEvent[];
  adjustments: PaymentAdjustmentEvent[];
  totalReceived: string;
  totalAllocated: string;
  adjustmentTotals: PaymentAdjustmentTotals;
  unallocatedAdvance: string;
};
export type CustomerPaymentActivityRepository = {
  readSnapshot(customerId: string): Promise<CustomerPaymentActivitySnapshot | null>;
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
export type CustomerPaymentActivityDeps = { repository: CustomerPaymentActivityRepository };

export async function getCustomerPaymentActivity(
  customerId: string,
  deps: CustomerPaymentActivityDeps,
): Promise<CustomerPaymentActivity> {
  if (typeof customerId !== "string" || customerId.trim().length === 0) {
    throw new CustomerPaymentActivityError("Choose a valid customer.");
  }
  const normalizedId = customerId.trim();
  const snapshot = await deps.repository.readSnapshot(normalizedId);
  if (!snapshot) {
    throw new CustomerPaymentActivityError("That customer was not found for this business.");
  }

  const entries: CustomerPaymentActivityEntry[] = [
    ...snapshot.receipts.map((receipt) => ({
      id: receipt.id,
      receiptId: receipt.id,
      invoiceId: null,
      type: "receipt" as const,
      effectiveDate: receipt.paymentDate,
      recordedAt: receipt.recordedAt,
      amount: receipt.amount,
      method: receipt.method,
      reference: receipt.reference,
      description: receipt.notes,
    })),
    ...snapshot.allocations.map((event) => ({
      id: event.id,
      receiptId: event.receiptId,
      invoiceId: event.invoiceId,
      type: event.eventType === "allocate" ? ("allocation" as const) : ("allocation_release" as const),
      effectiveDate: event.recordedAt.slice(0, 10),
      recordedAt: event.recordedAt,
      amount: event.amount,
      method: null,
      reference: event.allocationId,
      description: event.reason,
    })),
    ...snapshot.adjustments.map((event) => ({
      id: event.id,
      receiptId: event.receiptId,
      invoiceId: null,
      type:
        event.eventType === "reverse_receipt"
          ? ("receipt_reversal" as const)
          : event.eventType === "reverse_refund"
            ? ("refund_reversal" as const)
            : ("refund" as const),
      effectiveDate: event.paymentDate ?? event.recordedAt.slice(0, 10),
      recordedAt: event.recordedAt,
      amount: event.amount,
      method: event.method,
      reference: event.originalEventId,
      description: event.reason,
    })),
  ];
  entries.sort(
    (left, right) =>
      left.effectiveDate.localeCompare(right.effectiveDate) ||
      left.recordedAt.localeCompare(right.recordedAt) ||
      left.id.localeCompare(right.id),
  );

  return {
    customerId: normalizedId,
    currency: "INR",
    summary: {
      receiptCount: snapshot.receipts.length,
      totalReceived: snapshot.totalReceived,
      totalAllocated: snapshot.totalAllocated,
      totalRefunded: snapshot.adjustmentTotals.refundedAmount,
      totalReversedReceipts: snapshot.adjustmentTotals.reversedReceiptAmount,
      unallocatedAdvance: snapshot.unallocatedAdvance,
    },
    entries,
  };
}

export class CustomerPaymentActivityError extends Error {
  readonly userMessage: string;

  constructor(userMessage: string) {
    super(userMessage);
    this.name = "CustomerPaymentActivityError";
    this.userMessage = userMessage;
  }
}
