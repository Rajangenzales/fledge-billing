import { Money, MoneyError, roundHalfUp } from "@fledge/domain";

export const PAYMENT_METHODS = ["cash", "upi", "bank_transfer", "card", "cheque", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type CustomerReceipt = {
  id: string;
  businessId: string;
  customerId: string;
  amount: string;
  currency: "INR";
  paymentDate: string;
  method: PaymentMethod;
  reference: string | null;
  notes: string | null;
  idempotencyKey: string;
  recordedAt: string;
};

export type RecordCustomerReceiptInput = {
  customerId: string;
  amount: string;
  paymentDate: string;
  method: PaymentMethod;
  reference?: string | null;
  notes?: string | null;
  idempotencyKey: string;
};

export type CustomerReceiptRepository = {
  getBusinessId(): string | null;
  customerExists(customerId: string, businessId: string): boolean;
  insert(record: CustomerReceipt): CustomerReceipt;
  list(customerId: string): CustomerReceipt[];
  total(customerId: string): string;
  allocatedTotal(customerId: string): string;
};

export type CustomerReceiptDeps = {
  repository: CustomerReceiptRepository;
  now: () => string;
  createId: () => string;
};

export class CustomerReceiptError extends Error {
  readonly userMessage: string;
  constructor(message: string) {
    super(message);
    this.name = "CustomerReceiptError";
    this.userMessage = message;
  }
}

export function recordCustomerReceipt(
  input: RecordCustomerReceiptInput,
  deps: CustomerReceiptDeps,
): CustomerReceipt {
  const businessId = deps.repository.getBusinessId();
  if (!businessId) throw new CustomerReceiptError("Save the business profile before recording a receipt.");
  if (!deps.repository.customerExists(input.customerId, businessId)) {
    throw new CustomerReceiptError("Choose a customer belonging to this business.");
  }
  const amount = normalizeAmount(input.amount);
  if (!isDate(input.paymentDate)) throw new CustomerReceiptError("Enter a valid payment date.");
  if (!PAYMENT_METHODS.includes(input.method)) throw new CustomerReceiptError("Choose a valid payment method.");
  const idempotencyKey = required(input.idempotencyKey, "A receipt request key is required.", 120);
  const reference = optional(input.reference, 200);
  const notes = optional(input.notes, 2000);
  const recordedAt = deps.now();
  return deps.repository.insert({
    id: deps.createId(),
    businessId,
    customerId: input.customerId,
    amount,
    currency: "INR",
    paymentDate: input.paymentDate,
    method: input.method,
    reference,
    notes,
    idempotencyKey,
    recordedAt,
  });
}

export function listCustomerReceipts(customerId: string, deps: CustomerReceiptDeps): CustomerReceipt[] {
  assertCustomer(customerId, deps);
  return deps.repository.list(customerId);
}

export function getCustomerAdvance(customerId: string, deps: CustomerReceiptDeps): {
  customerId: string;
  currency: "INR";
  receiptCount: number;
  unallocatedAmount: string;
} {
  assertCustomer(customerId, deps);
  return {
    customerId,
    currency: "INR",
    receiptCount: deps.repository.list(customerId).length,
    unallocatedAmount: subtractAmounts(deps.repository.total(customerId), deps.repository.allocatedTotal(customerId)),
  };
}

function assertCustomer(customerId: string, deps: CustomerReceiptDeps): void {
  const businessId = deps.repository.getBusinessId();
  if (!businessId || !deps.repository.customerExists(customerId, businessId)) {
    throw new CustomerReceiptError("That customer was not found for this business.");
  }
}

function normalizeAmount(value: string): string {
  try {
    const amount = Money.parse(value);
    if (amount.compare(Money.zero()) <= 0) throw new CustomerReceiptError("Receipt amount must be greater than zero.");
    const rounded = roundHalfUp(amount, 2);
    if (!rounded.equals(amount)) throw new CustomerReceiptError("Receipt amount cannot include fractions of a paisa.");
    return rounded.toDecimalString();
  } catch (error) {
    if (error instanceof CustomerReceiptError) throw error;
    if (error instanceof MoneyError) throw new CustomerReceiptError(error.userMessage);
    throw error;
  }
}

function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function required(value: string, message: string, max: number): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.trim().length > max) {
    throw new CustomerReceiptError(message);
  }
  return value.trim();
}

function optional(value: string | null | undefined, max: number): string | null {
  if (value === null || value === undefined || value.trim() === "") return null;
  if (value.trim().length > max) throw new CustomerReceiptError("A receipt text field is too long.");
  return value.trim();
}

function subtractAmounts(total: string, allocated: string): string {
  try {
    const remaining = Money.parse(total).subtract(Money.parse(allocated));
    if (remaining.compare(Money.zero()) < 0) throw new CustomerReceiptError("Customer allocations exceed the available receipts.");
    return roundHalfUp(remaining, 2).toDecimalString();
  } catch (error) {
    if (error instanceof CustomerReceiptError) throw error;
    if (error instanceof MoneyError) throw new CustomerReceiptError("A saved customer balance is invalid.");
    throw error;
  }
}
