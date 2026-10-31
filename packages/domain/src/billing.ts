/**
 * Commercial document math: quantities, discounts, charges, and totals.
 * Tax component splits (CGST, SGST, UTGST, IGST) belong to the GST engine.
 * Until that engine supplies them, tax total stays zero. An exclusive
 * document total is therefore the pre-tax amount.
 */

import { INR_MINOR_SCALE, Money, Ratio, roundHalfUp } from "./money.js";

export const DOCUMENT_TYPES = [
  "tax_invoice",
  "non_gst_invoice",
  "bill_of_supply",
  "quotation",
  "receipt",
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];
export type DiscountType = "none" | "amount" | "percent";

export class BillingError extends Error {
  readonly userMessage: string;

  constructor(userMessage: string) {
    super(userMessage);
    this.name = "BillingError";
    this.userMessage = userMessage;
  }
}

export type LineInput = {
  productId?: string | null;
  description: string;
  hsnSac?: string | null;
  quantity: string;
  unit: string;
  rate: string;
  discountType: DiscountType;
  discountValue?: string | null;
  taxInclusive: boolean;
  gstRatePercent?: string | null;
};

export type ChargeInput = {
  description: string;
  amount: string;
  taxable: boolean;
};

export type DocumentCalculationInput = {
  gstEnabled: boolean;
  lines: readonly LineInput[];
  charges?: readonly ChargeInput[];
};

export type CalculatedLine = {
  productId: string | null;
  description: string;
  hsnSac: string | null;
  quantity: string;
  unit: string;
  rate: string;
  discountType: DiscountType;
  discountValue: string;
  discountAmount: string;
  lineAmount: string;
  taxableValue: string;
  gstRatePercent: string | null;
  taxInclusive: boolean;
  sortOrder: number;
};

export type CalculatedCharge = {
  description: string;
  amount: string;
  taxable: boolean;
  sortOrder: number;
};

export type DocumentCalculation = {
  lines: CalculatedLine[];
  charges: CalculatedCharge[];
  subtotal: string;
  discountTotal: string;
  taxableTotal: string;
  taxTotal: string;
  grandTotal: string;
};

export function defaultDocumentPrefix(type: DocumentType): string {
  switch (type) {
    case "tax_invoice":
      return "INV";
    case "non_gst_invoice":
      return "NG";
    case "bill_of_supply":
      return "BOS";
    case "quotation":
      return "QT";
    case "receipt":
      return "RCT";
  }
}

export function formatDocumentNumber(
  prefix: string,
  financialYear: string,
  sequence: number,
  padding: number,
): string {
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new BillingError("The next document number must be a whole number of at least 1.");
  }
  if (!Number.isInteger(padding) || padding < 3 || padding > 6) {
    throw new BillingError("Number padding must be from 3 to 6 digits.");
  }
  return `${prefix}/${financialYear}/${String(sequence).padStart(padding, "0")}`;
}

export function normalizeSeriesPrefix(prefix: string): string {
  if (typeof prefix !== "string") {
    throw new BillingError("Enter a number prefix such as INV.");
  }
  const value = prefix.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9-]{0,11}$/.test(value)) {
    throw new BillingError("Enter a number prefix such as INV.");
  }
  return value;
}

export function assertDocumentGstMode(type: DocumentType, gstEnabled: boolean): void {
  if (!isDocumentType(type)) {
    throw new BillingError("Choose a document type.");
  }
  if (type === "tax_invoice" && !gstEnabled) {
    throw new BillingError("A tax invoice has GST enabled.");
  }
  if ((type === "non_gst_invoice" || type === "bill_of_supply" || type === "receipt") && gstEnabled) {
    throw new BillingError("This document type is not a tax invoice.");
  }
}

/** Indian financial year label, such as 2026-27. */
export function assertFinancialYearLabel(value: string): string {
  if (typeof value !== "string") {
    throw new BillingError("Enter the financial year as YYYY-YY.");
  }
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) {
    throw new BillingError("Enter the financial year as YYYY-YY.");
  }
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (end !== (start + 1) % 100) {
    throw new BillingError("Enter the financial year as YYYY-YY.");
  }
  return value;
}

/** Indian financial year, April through March, labeled 2026-27. */
export function financialYearOf(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) {
    throw new BillingError("Enter the document date as YYYY-MM-DD.");
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new BillingError("Enter a real document date.");
  }
  const start = month >= 4 ? year : year - 1;
  const end = String((start + 1) % 100).padStart(2, "0");
  return `${start}-${end}`;
}

export function calculateDocument(input: DocumentCalculationInput): DocumentCalculation {
  if (input.lines.length === 0) {
    throw new BillingError("Add at least one line.");
  }
  const lines = input.lines.map((line, index) => calculateLine(line, input.gstEnabled, index));
  const charges = (input.charges ?? []).map((charge, index) =>
    calculateCharge(charge, input.gstEnabled, index),
  );

  const subtotal = sum(
    lines.map((line) => Money.parse(line.lineAmount).add(Money.parse(line.discountAmount))),
  );
  const discountTotal = sum(lines.map((line) => Money.parse(line.discountAmount)));
  const chargeTotal = sum(charges.map((charge) => Money.parse(charge.amount)));
  const grandTotal = sum(lines.map((line) => Money.parse(line.lineAmount))).add(chargeTotal);
  const taxableLines = input.gstEnabled
    ? sum(lines.map((line) => Money.parse(line.taxableValue)))
    : Money.zero();
  const taxableCharges = input.gstEnabled
    ? sum(
        charges.filter((charge) => charge.taxable).map((charge) => Money.parse(charge.amount)),
      )
    : Money.zero();

  return {
    lines,
    charges,
    subtotal: subtotal.toDecimalString(),
    discountTotal: discountTotal.toDecimalString(),
    taxableTotal: taxableLines.add(taxableCharges).toDecimalString(),
    taxTotal: "0",
    grandTotal: grandTotal.toDecimalString(),
  };
}

function calculateLine(input: LineInput, gstEnabled: boolean, sortOrder: number): CalculatedLine {
  const description = requiredText(input.description, "Enter a line description.", 200);
  const quantity = parseQuantity(input.quantity);
  const rate = parseRupees(input.rate, "Enter the rate in rupees and paise, such as \"100.50\".");
  const exactGross = rate.times(quantity);
  if (input.discountType !== "none" && input.discountType !== "amount" && input.discountType !== "percent") {
    throw new BillingError("Choose a discount of none, amount, or percent.");
  }
  const exactDiscount = discountAmount(exactGross, input.discountType, input.discountValue);
  if (exactDiscount.compare(exactGross) > 0) {
    throw new BillingError("The discount cannot be more than the line amount.");
  }
  const exactNet = exactGross.subtract(exactDiscount);
  const gstRatePercent = resolveGstRate(input, gstEnabled);
  const taxableExact =
    gstEnabled && input.taxInclusive
      ? exactNet
          .times(Ratio.parse("100"))
          .dividedBy(Money.parse("100").add(Money.parse(gstRatePercent ?? "0")))
      : exactNet;

  return {
    productId: blankToNull(input.productId),
    description,
    hsnSac: normalizeHsn(input.hsnSac),
    quantity: Money.parse("1").times(quantity).toDecimalString(),
    unit: normalizeUnit(input.unit),
    rate: rate.toDecimalString(),
    discountType: input.discountType,
    discountValue: normalizeDiscountValue(input.discountType, input.discountValue),
    discountAmount: roundHalfUp(exactDiscount, INR_MINOR_SCALE).toDecimalString(),
    lineAmount: roundHalfUp(exactNet, INR_MINOR_SCALE).toDecimalString(),
    taxableValue: roundHalfUp(taxableExact, INR_MINOR_SCALE).toDecimalString(),
    gstRatePercent,
    taxInclusive: gstEnabled ? input.taxInclusive === true : false,
    sortOrder,
  };
}

function calculateCharge(input: ChargeInput, gstEnabled: boolean, sortOrder: number): CalculatedCharge {
  if (typeof input.taxable !== "boolean") {
    throw new BillingError("Choose whether the charge is taxable.");
  }
  if (input.taxable && !gstEnabled) {
    throw new BillingError("A taxable charge requires GST to be enabled.");
  }
  const amount = parseRupees(input.amount, "Enter the charge in rupees and paise.");
  if (amount.isZero()) {
    throw new BillingError("Enter the charge in rupees and paise.");
  }
  return {
    description: requiredText(input.description, "Enter a charge description.", 200),
    amount: amount.toDecimalString(),
    taxable: input.taxable,
    sortOrder,
  };
}

function resolveGstRate(input: LineInput, gstEnabled: boolean): string | null {
  if (!gstEnabled) {
    if (input.taxInclusive) {
      throw new BillingError("Tax-inclusive pricing requires GST to be enabled.");
    }
    if (present(input.gstRatePercent)) {
      throw new BillingError("Clear the GST rate when GST is off.");
    }
    return null;
  }
  if (typeof input.taxInclusive !== "boolean") {
    throw new BillingError("Choose whether the line price includes tax.");
  }
  return parsePercentage(input.gstRatePercent, "Enter the GST percentage for this line.");
}

function discountAmount(gross: Money, type: DiscountType, value: string | null | undefined): Money {
  if (type === "none") {
    return Money.zero();
  }
  if (type === "amount") {
    return parseRupees(value, "Enter the discount in rupees and paise.");
  }
  const percent = parsePercentage(value, "Enter the discount percent from 0 to 100.");
  return gross.times(Ratio.percent(percent));
}

function parseQuantity(value: unknown): Ratio {
  if (typeof value !== "string") {
    throw new BillingError("Enter a quantity greater than zero.");
  }
  let amount: Money;
  try {
    amount = Money.parse(value.trim());
  } catch {
    throw new BillingError("Enter a quantity greater than zero.");
  }
  if (amount.isNegative() || amount.isZero()) {
    throw new BillingError("Enter a quantity greater than zero.");
  }
  const fraction = amount.toDecimalString().split(".")[1] ?? "";
  if (fraction.length > 3) {
    throw new BillingError("Enter a quantity with at most 3 decimal places.");
  }
  return Ratio.parse(amount.toDecimalString());
}

function parseRupees(value: unknown, message: string): Money {
  if (typeof value !== "string") {
    throw new BillingError(message);
  }
  let amount: Money;
  try {
    amount = Money.parse(value.trim());
  } catch {
    throw new BillingError(message);
  }
  if (amount.isNegative() || !roundHalfUp(amount, INR_MINOR_SCALE).equals(amount)) {
    throw new BillingError(message);
  }
  return amount;
}

function parsePercentage(value: unknown, message: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new BillingError(message);
  }
  let amount: Money;
  try {
    amount = Money.parse(value.trim());
  } catch {
    throw new BillingError(message);
  }
  if (amount.isNegative() || amount.compare(Money.parse("100")) > 0) {
    throw new BillingError(message);
  }
  const fraction = amount.toDecimalString().split(".")[1] ?? "";
  if (fraction.length > 2) {
    throw new BillingError(message);
  }
  return amount.toDecimalString();
}

function normalizeDiscountValue(type: DiscountType, value: string | null | undefined): string {
  if (type === "none") {
    return "0";
  }
  if (type === "percent") {
    return parsePercentage(value, "Enter the discount percent from 0 to 100.");
  }
  return parseRupees(value, "Enter the discount in rupees and paise.").toDecimalString();
}

function normalizeHsn(value: unknown): string | null {
  if (!present(value)) {
    return null;
  }
  if (typeof value !== "string" || !/^(?:\d{4}|\d{6}|\d{8})$/.test(value.trim())) {
    throw new BillingError("Enter an HSN or SAC of 4, 6, or 8 digits.");
  }
  return value.trim();
}

function normalizeUnit(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z][A-Za-z0-9 ./-]{0,15}$/.test(value.trim())) {
    throw new BillingError("Enter the unit, such as nos or hrs.");
  }
  return value.trim();
}

function requiredText(value: unknown, message: string, maxLength: number): string {
  if (typeof value !== "string") {
    throw new BillingError(message);
  }
  const text = value.trim();
  if (text.length === 0 || text.length > maxLength) {
    throw new BillingError(message);
  }
  return text;
}

function blankToNull(value: string | null | undefined): string | null {
  if (!present(value) || typeof value !== "string") {
    return null;
  }
  return value.trim();
}

function present(value: unknown): boolean {
  return typeof value === "string" ? value.trim().length > 0 : value !== undefined && value !== null;
}

function sum(amounts: Money[]): Money {
  return amounts.reduce((total, amount) => total.add(amount), Money.zero());
}

function isDocumentType(value: unknown): value is DocumentType {
  return (DOCUMENT_TYPES as readonly string[]).includes(String(value));
}
