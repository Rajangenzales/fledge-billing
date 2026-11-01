import { describe, expect, it } from "vitest";
import { getCustomerPaymentActivity, type CustomerPaymentActivityDeps } from "./customer-payment-activity.js";

describe("customer payment activity", () => {
  it("combines receipt, allocation and adjustment history without mutating events", async () => {
    const deps = {
      receipts: {
        repository: {
          getBusinessId: async () => "biz-1",
          customerExists: async () => true,
          list: async () => [{
            id: "receipt-1", businessId: "biz-1", customerId: "cust-1", amount: "500",
            currency: "INR", paymentDate: "2026-10-01", method: "upi", reference: "UPI-1",
            notes: null, idempotencyKey: "r1", recordedAt: "2026-10-01T10:00:00Z", identitySnapshot: null,
          }],
          total: async () => "500",
          allocatedTotal: async () => "200",
          adjustmentTotals: async () => ({ refundedAmount: "50", reversedReceiptAmount: "0" }),
        },
      },
      allocations: {
        repository: {
          getBusinessId: async () => "biz-1",
          listReceiptEvents: async () => [{
            id: "alloc-1", businessId: "biz-1", customerId: "cust-1", receiptId: "receipt-1",
            invoiceId: "invoice-1", eventType: "allocate", allocationId: null, amount: "200",
            reason: null, idempotencyKey: "a1", recordedAt: "2026-10-02T10:00:00Z",
          }],
          getCustomerAllocatedTotal: async () => "200",
        },
      },
      adjustments: {
        repository: {
          getBusinessId: async () => "biz-1",
          customerExists: async () => true,
          list: async () => [{
            id: "refund-1", businessId: "biz-1", customerId: "cust-1", receiptId: "receipt-1",
            eventType: "refund", originalEventId: null, amount: "50", paymentDate: "2026-10-03",
            method: "cash", reason: "Returned goods", idempotencyKey: "f1", recordedAt: "2026-10-03T10:00:00Z",
          }],
          totals: async () => ({ refundedAmount: "50", reversedReceiptAmount: "0" }),
        },
      },
    } as unknown as CustomerPaymentActivityDeps;

    const result = await getCustomerPaymentActivity("cust-1", deps);
    expect(result.summary).toEqual({
      receiptCount: 1, totalReceived: "500", totalAllocated: "200",
      totalRefunded: "50", totalReversedReceipts: "0", unallocatedAdvance: "250",
    });
    expect(result.entries.map(entry => entry.type)).toEqual(["receipt", "allocation", "refund"]);
    expect(result.entries[1]?.invoiceId).toBe("invoice-1");
  });
});
