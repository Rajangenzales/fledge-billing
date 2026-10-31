export type PaymentAdjustmentType = "refund" | "reverse_receipt" | "reverse_refund";

export type PaymentAdjustmentEvent = {
  id: string;
  businessId: string;
  customerId: string;
  receiptId: string;
  eventType: PaymentAdjustmentType;
  originalEventId: string | null;
  amount: string;
  paymentDate: string | null;
  method: "cash" | "upi" | "bank_transfer" | "card" | "cheque" | "other" | null;
  reason: string;
  idempotencyKey: string;
  recordedAt: string;
};

export type PaymentAdjustmentTotals = {
  refundedAmount: string;
  reversedReceiptAmount: string;
};

export type PaymentAdjustmentRepository = {
  getBusinessId(): string | null;
  customerExists(customerId: string, businessId: string): boolean;
  recordRefund(event: PaymentAdjustmentEvent): PaymentAdjustmentEvent;
  reverseReceipt(event: PaymentAdjustmentEvent): PaymentAdjustmentEvent;
  reverseRefund(event: PaymentAdjustmentEvent): PaymentAdjustmentEvent;
  list(receiptId: string): PaymentAdjustmentEvent[];
  totals(customerId: string): PaymentAdjustmentTotals;
};

export type PaymentAdjustmentDeps = {
  repository: PaymentAdjustmentRepository;
  now: () => string;
  createId: () => string;
};

export class PaymentAdjustmentError extends Error {
  readonly userMessage: string;
  constructor(message: string) {
    super(message);
    this.name = "PaymentAdjustmentError";
    this.userMessage = message;
  }
}

export function recordCustomerRefund(
  input: { receiptId: string; amount: string; paymentDate: string; method: PaymentAdjustmentEvent["method"]; reason: string; idempotencyKey: string },
  deps: PaymentAdjustmentDeps,
): PaymentAdjustmentEvent {
  const businessId = requireBusiness(deps);
  if (!isDate(input.paymentDate)) throw new PaymentAdjustmentError("Enter a valid refund date.");
  if (!input.method || !["cash", "upi", "bank_transfer", "card", "cheque", "other"].includes(input.method)) {
    throw new PaymentAdjustmentError("Choose a valid refund method.");
  }
  return deps.repository.recordRefund({
    id: deps.createId(), businessId, customerId: "", receiptId: required(input.receiptId, "Choose the original customer receipt.", 120),
    eventType: "refund", originalEventId: null, amount: positiveAmount(input.amount),
    paymentDate: input.paymentDate, method: input.method, reason: required(input.reason, "Enter a refund reason.", 1000),
    idempotencyKey: required(input.idempotencyKey, "A refund request key is required.", 120), recordedAt: deps.now(),
  });
}

export function reverseCustomerReceipt(
  input: { receiptId: string; reason: string; idempotencyKey: string },
  deps: PaymentAdjustmentDeps,
): PaymentAdjustmentEvent {
  const businessId = requireBusiness(deps);
  return deps.repository.reverseReceipt({
    id: deps.createId(), businessId, customerId: "", receiptId: required(input.receiptId, "Choose the receipt to reverse.", 120),
    eventType: "reverse_receipt", originalEventId: null, amount: "0", paymentDate: null, method: null,
    reason: required(input.reason, "Enter why this receipt is being reversed.", 1000),
    idempotencyKey: required(input.idempotencyKey, "A reversal request key is required.", 120), recordedAt: deps.now(),
  });
}

export function reverseCustomerRefund(
  input: { refundEventId: string; reason: string; idempotencyKey: string },
  deps: PaymentAdjustmentDeps,
): PaymentAdjustmentEvent {
  const businessId = requireBusiness(deps);
  return deps.repository.reverseRefund({
    id: deps.createId(), businessId, customerId: "", receiptId: "", eventType: "reverse_refund",
    originalEventId: required(input.refundEventId, "Choose the refund entry to reverse.", 120), amount: "0",
    paymentDate: null, method: null, reason: required(input.reason, "Enter why this refund entry is being reversed.", 1000),
    idempotencyKey: required(input.idempotencyKey, "A refund reversal request key is required.", 120), recordedAt: deps.now(),
  });
}

export function listReceiptAdjustments(receiptId: string, deps: PaymentAdjustmentDeps): PaymentAdjustmentEvent[] {
  requireBusiness(deps);
  return deps.repository.list(required(receiptId, "Choose a customer receipt.", 120));
}

function requireBusiness(deps: PaymentAdjustmentDeps): string {
  const id = deps.repository.getBusinessId();
  if (!id) throw new PaymentAdjustmentError("Save the business profile before recording a refund or reversal.");
  return id;
}
function positiveAmount(value: string): string {
  if (!/^\\d+(?:\\.\\d{1,2})?$/.test(value)) throw new PaymentAdjustmentError("Enter a positive amount with up to two decimal places.");
  const [whole, fraction = ""] = value.split(".");
  const paise = BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (paise <= 0n) throw new PaymentAdjustmentError("Refund amount must be greater than zero.");
  return formatPaise(paise);
}
function formatPaise(value: bigint): string {
  const whole = value / 100n;
  const fraction = (value % 100n).toString().padStart(2, "0");
  return fraction === "00" ? whole.toString() : `${whole}.${fraction}`;
}
function required(value: string, message: string, max: number): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.trim().length > max) throw new PaymentAdjustmentError(message);
  return value.trim();
}
function isDate(value: string): boolean {
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
