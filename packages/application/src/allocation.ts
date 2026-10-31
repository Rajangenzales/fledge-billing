export type AllocationEvent = {
  id: string;
  businessId: string;
  customerId: string;
  receiptId: string;
  invoiceId: string;
  eventType: "allocate" | "release";
  allocationId: string | null;
  amount: string;
  reason: string | null;
  idempotencyKey: string;
  recordedAt: string;
};

export type InvoiceSettlement = {
  invoiceId: string;
  currency: "INR";
  invoiceTotal: string;
  allocatedAmount: string;
  outstandingAmount: string;
  paymentStatus: "unpaid" | "partially_paid" | "paid";
};

export type AllocationRepository = {
  getBusinessId(): string | null;
  allocate(event: AllocationEvent): AllocationEvent;
  release(event: AllocationEvent): AllocationEvent;
  listReceiptEvents(receiptId: string): AllocationEvent[];
  getInvoiceSettlement(invoiceId: string): InvoiceSettlement | null;
  getCustomerAllocatedTotal(customerId: string): string;
};

export type AllocationDeps = {
  repository: AllocationRepository;
  now: () => string;
  createId: () => string;
};

export class AllocationError extends Error {
  readonly userMessage: string;
  constructor(message: string) {
    super(message);
    this.name = "AllocationError";
    this.userMessage = message;
  }
}

export function allocateReceiptToInvoice(
  input: { receiptId: string; invoiceId: string; amount: string; idempotencyKey: string },
  deps: AllocationDeps,
): AllocationEvent {
  const businessId = requireBusiness(deps);
  const amount = positiveAmount(input.amount);
  const key = required(input.idempotencyKey, "An allocation request key is required.", 120);
  return deps.repository.allocate({
    id: deps.createId(), businessId, customerId: "",
    receiptId: required(input.receiptId, "Choose a customer receipt.", 120),
    invoiceId: required(input.invoiceId, "Choose an invoice.", 120),
    eventType: "allocate", allocationId: null, amount, reason: null,
    idempotencyKey: key, recordedAt: deps.now(),
  });
}

export function releaseReceiptAllocation(
  input: { allocationId: string; reason: string; idempotencyKey: string },
  deps: AllocationDeps,
): AllocationEvent {
  const businessId = requireBusiness(deps);
  return deps.repository.release({
    id: deps.createId(), businessId, customerId: "",
    receiptId: "", invoiceId: "", eventType: "release",
    allocationId: required(input.allocationId, "Choose an allocation to release.", 120),
    amount: "0", reason: required(input.reason, "Enter why this allocation is being released.", 1000),
    idempotencyKey: required(input.idempotencyKey, "A release request key is required.", 120),
    recordedAt: deps.now(),
  });
}

export function getInvoiceSettlement(invoiceId: string, deps: AllocationDeps): InvoiceSettlement {
  requireBusiness(deps);
  const result = deps.repository.getInvoiceSettlement(required(invoiceId, "Choose an invoice.", 120));
  if (!result) throw new AllocationError("That invoice was not found for this business.");
  return result;
}

export function getCustomerAllocatedTotal(customerId: string, deps: AllocationDeps): string {
  requireBusiness(deps);
  return deps.repository.getCustomerAllocatedTotal(required(customerId, "Choose a customer.", 120));
}

function requireBusiness(deps: AllocationDeps): string {
  const id = deps.repository.getBusinessId();
  if (!id) throw new AllocationError("Save the business profile before allocating receipts.");
  return id;
}

function positiveAmount(value: string): string {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) throw new AllocationError("Enter a positive amount with up to two decimal places.");
  const [whole, fraction = ""] = value.split(".");
  const paise = BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (paise <= 0n) throw new AllocationError("Allocation amount must be greater than zero.");
  return formatPaise(paise);
}
function required(value: string, message: string, max: number): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.trim().length > max) {
    throw new AllocationError(message);
  }
  return value.trim();
}
function formatPaise(value: bigint): string {
  const whole = value / 100n;
  const fraction = (value % 100n).toString().padStart(2, "0");
  return fraction === "00" ? whole.toString() : `${whole}.${fraction}`;
}
