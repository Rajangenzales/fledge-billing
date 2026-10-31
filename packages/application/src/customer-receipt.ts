import { Money, MoneyError, roundHalfUp } from "@fledge/domain";

export const PAYMENT_METHODS = ["cash", "upi", "bank_transfer", "card", "cheque", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type ReceiptIdentitySnapshot = {
  business: {
    legalName: string;
    displayName: string;
    address: string;
    stateId: string;
    stateName: string;
    pinCode: string | null;
    gstRegistered: boolean;
    gstin: string | null;
    businessType: string | null;
    phone: string | null;
    email: string | null;
  };
  customer: {
    name: string;
    phone: string | null;
    email: string | null;
    gstin: string | null;
    registrationType: "registered" | "unregistered";
    billingAddress: string;
    shippingAddress: string | null;
    stateId: string;
    stateName: string;
    pinCode: string | null;
  };
};

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
  identitySnapshot: ReceiptIdentitySnapshot | null;
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
  getById(receiptId: string, businessId: string): CustomerReceipt | null;
  total(customerId: string): string;
  allocatedTotal(customerId: string): string;
  adjustmentTotals(customerId: string): { refundedAmount: string; reversedReceiptAmount: string };
};

export type PrintableCustomerReceipt = {
  receiptId: string;
  paymentDate: string;
  amount: string;
  method: string;
  externalReference: string | null;
  notes: string | null;
  businessName: string;
  businessAddress: string;
  businessPhone: string | null;
  businessEmail: string | null;
  businessGstin: string | null;
  customerName: string;
  customerAddress: string;
  customerPhone: string | null;
  customerEmail: string | null;
  customerGstin: string | null;
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
    identitySnapshot: null,
  });
}


export function renderCustomerReceipt(receiptId: string, deps: CustomerReceiptDeps): PrintableCustomerReceipt {
  const businessId = deps.repository.getBusinessId();
  if (!businessId) throw new CustomerReceiptError("Save the business profile before viewing receipts.");
  const id = required(receiptId, "Choose a valid receipt.", 120);
  const receipt = deps.repository.getById(id, businessId);
  if (!receipt) throw new CustomerReceiptError("That receipt was not found for this business.");
  const snapshot = receipt.identitySnapshot;
  if (!snapshot) throw new CustomerReceiptError("This legacy receipt has no receipt-time identity snapshot and cannot be formally printed.");
  return {
    receiptId: receipt.id,
    paymentDate: receipt.paymentDate,
    amount: receipt.amount,
    method: receipt.method.replace(/_/g, " "),
    externalReference: receipt.reference,
    notes: receipt.notes,
    businessName: snapshot.business.displayName || snapshot.business.legalName,
    businessAddress: [snapshot.business.address, snapshot.business.stateName, snapshot.business.pinCode].filter(Boolean).join(", "),
    businessPhone: snapshot.business.phone,
    businessEmail: snapshot.business.email,
    businessGstin: snapshot.business.gstRegistered ? snapshot.business.gstin : null,
    customerName: snapshot.customer.name,
    customerAddress: [snapshot.customer.billingAddress, snapshot.customer.stateName, snapshot.customer.pinCode].filter(Boolean).join(", "),
    customerPhone: snapshot.customer.phone,
    customerEmail: snapshot.customer.email,
    customerGstin: snapshot.customer.gstin,
  };
}

export function customerReceiptPrintLines(receipt: PrintableCustomerReceipt): string[] {
  return [
    "PAYMENT RECEIPT",
    receipt.businessName,
    receipt.businessAddress,
    ...(receipt.businessPhone ? ["Phone: " + receipt.businessPhone] : []),
    ...(receipt.businessEmail ? ["Email: " + receipt.businessEmail] : []),
    ...(receipt.businessGstin ? ["GSTIN: " + receipt.businessGstin] : []),
    "",
    "Receipt reference (internal): " + receipt.receiptId,
    "Payment date: " + receipt.paymentDate,
    "",
    "RECEIVED FROM",
    receipt.customerName,
    receipt.customerAddress,
    ...(receipt.customerPhone ? ["Phone: " + receipt.customerPhone] : []),
    ...(receipt.customerEmail ? ["Email: " + receipt.customerEmail] : []),
    ...(receipt.customerGstin ? ["GSTIN: " + receipt.customerGstin] : []),
    "",
    "Amount received: INR " + formatReceiptAmount(receipt.amount),
    "Payment method: " + receipt.method,
    ...(receipt.externalReference ? ["Transaction reference: " + receipt.externalReference] : []),
    ...(receipt.notes ? ["Notes:", receipt.notes] : []),
    "",
    "This document acknowledges receipt of payment. It is not a tax invoice or statutory GST receipt voucher.",
  ];
}

export function printCustomerReceipt(receiptId: string, deps: CustomerReceiptDeps): string {
  return customerReceiptPrintLines(renderCustomerReceipt(receiptId, deps)).join("\n");
}

function formatReceiptAmount(value: string): string {
  try {
    const amount = Money.parse(value).toDecimalString();
    const parts = amount.split(".");
    return (parts[0] ?? "0") + "." + (parts[1] ?? "00").padEnd(2, "0");
  } catch {
    throw new CustomerReceiptError("The saved receipt amount is invalid.");
  }
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
    unallocatedAmount: subtractAmounts(deps.repository.total(customerId), deps.repository.allocatedTotal(customerId), deps.repository.adjustmentTotals(customerId)),
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

function subtractAmounts(total: string, allocated: string, adjustments: { refundedAmount: string; reversedReceiptAmount: string }): string {
  try {
    const remaining = Money.parse(total).subtract(Money.parse(allocated)).subtract(Money.parse(adjustments.refundedAmount)).subtract(Money.parse(adjustments.reversedReceiptAmount));
    if (remaining.compare(Money.zero()) < 0) throw new CustomerReceiptError("Customer allocations exceed the available receipts.");
    return roundHalfUp(remaining, 2).toDecimalString();
  } catch (error) {
    if (error instanceof CustomerReceiptError) throw error;
    if (error instanceof MoneyError) throw new CustomerReceiptError("A saved customer balance is invalid.");
    throw error;
  }
}
