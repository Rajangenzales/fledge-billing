import type {
  AllocationEvent,
  CustomerPaymentActivityRepository,
  CustomerPaymentActivitySnapshot,
  PaymentAdjustmentEvent,
} from "@fledge/application";
import { calculateUnallocatedCustomerAdvance } from "@fledge/application";
import { createAllocationRepository } from "./allocation.js";
import { createCustomerReceiptRepository } from "./customer-receipt.js";
import type { SchemaDatabase } from "./connection.js";
import { withReadSnapshot } from "./connection.js";
import { createPaymentAdjustmentRepository } from "./payment-adjustment.js";

export function createCustomerPaymentActivityRepository(
  db: SchemaDatabase,
): CustomerPaymentActivityRepository {
  const receipts = createCustomerReceiptRepository(db);
  const allocations = createAllocationRepository(db);
  const adjustments = createPaymentAdjustmentRepository(db);

  return {
    async readSnapshot(customerId): Promise<CustomerPaymentActivitySnapshot | null> {
      return withReadSnapshot(db, async () => {
        const businessId = await receipts.getBusinessId();
        if (!businessId || !(await receipts.customerExists(customerId, businessId))) {
          return null;
        }

        const customerReceipts = await receipts.list(customerId);
        const [totalReceived, totalAllocated, adjustmentTotals] = await Promise.all([
          receipts.total(customerId),
          allocations.getCustomerAllocatedTotal(customerId),
          adjustments.totals(customerId),
        ]);
        const allocationEvents: AllocationEvent[] = [];
        const adjustmentEvents: PaymentAdjustmentEvent[] = [];
        for (const receipt of customerReceipts) {
          allocationEvents.push(...(await allocations.listReceiptEvents(receipt.id)));
          adjustmentEvents.push(...(await adjustments.list(receipt.id)));
        }
        return {
          receipts: customerReceipts,
          allocations: allocationEvents,
          adjustments: adjustmentEvents,
          totalReceived,
          totalAllocated,
          adjustmentTotals,
          unallocatedAdvance: calculateUnallocatedCustomerAdvance(
            totalReceived,
            totalAllocated,
            adjustmentTotals,
          ),
        };
      });
    },
  };
}
