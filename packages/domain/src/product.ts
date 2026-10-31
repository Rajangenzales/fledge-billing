/**
 * Products and services.
 *
 * The saved GST percentage is user configuration. It is not a versioned tax
 * rule. Tax calculation stays in the GST engine.
 */

import { Money, roundHalfUp, INR_MINOR_SCALE } from "./money.js";
import { optionalText, requiredText } from "./input.js";

export const PRODUCT_TYPES = ["goods", "service"] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

export const TAX_CATEGORIES = [
  { id: "taxable", name: "Taxable", code: "taxable" },
  { id: "exempt", name: "Exempt", code: "exempt" },
  { id: "nil-rated", name: "Nil rated", code: "nil-rated" },
  { id: "non-gst", name: "Non-GST", code: "non-gst" },
] as const;

export type TaxCategoryId = (typeof TAX_CATEGORIES)[number]["id"];

export class ProductError extends Error {
  readonly userMessage: string;

  constructor(userMessage: string) {
    super(userMessage);
    this.name = "ProductError";
    this.userMessage = userMessage;
  }
}

const fail = (message: string): never => {
  throw new ProductError(message);
};

export type SaveSavedGstRateInput = {
  name: string;
  percentage: string;
};

export type NormalizedSavedGstRate = {
  name: string;
  percentage: string;
};

export type SaveProductInput = {
  type: ProductType;
  name: string;
  code?: string | null;
  description?: string | null;
  hsnSac?: string | null;
  unit: string;
  defaultPrice: string;
  defaultDiscount?: string | null;
  taxCategoryId: string;
  savedGstRateId?: string | null;
  taxInclusive: boolean;
};

export type NormalizedProductInput = {
  type: ProductType;
  name: string;
  code: string | null;
  description: string | null;
  hsnSac: string | null;
  unit: string;
  defaultPrice: string;
  defaultDiscount: string;
  taxCategoryId: TaxCategoryId;
  savedGstRateId: string | null;
  taxInclusive: boolean;
};

export function validateSavedGstRate(input: SaveSavedGstRateInput): NormalizedSavedGstRate {
  return {
    name: requiredText(input.name, "Enter a name for the saved GST rate.", 80, fail),
    percentage: parsePercentage(input.percentage),
  };
}

export function validateProductInput(
  input: SaveProductInput,
  savedRate: { id: string; active: boolean } | null,
  options: { allowInactiveSavedRate?: boolean } = {},
): NormalizedProductInput {
  if (!isProductType(input.type)) {
    throw new ProductError("Choose goods or service.");
  }
  const category = TAX_CATEGORIES.find((item) => item.id === input.taxCategoryId);
  if (!category) {
    throw new ProductError("Choose a tax category.");
  }
  if (typeof input.taxInclusive !== "boolean") {
    throw new ProductError("Choose whether the price includes tax.");
  }

  const price = parseRupees(input.defaultPrice, "Enter the price in rupees and paise, such as \"100.50\".");
  const discount = parseRupees(
    input.defaultDiscount ?? "0",
    "Enter the discount in rupees and paise, such as \"10.00\".",
  );
  if (Money.parse(discount).compare(Money.parse(price)) > 0) {
    throw new ProductError("The discount cannot be more than the price.");
  }

  const taxable = category.id === "taxable";
  if (taxable) {
    if (!savedRate || savedRate.id !== input.savedGstRateId) {
      throw new ProductError("Choose a saved GST rate for a taxable item.");
    }
    if (!savedRate.active && !options.allowInactiveSavedRate) {
      throw new ProductError("Choose an active saved GST rate.");
    }
  } else if (input.savedGstRateId) {
    throw new ProductError("A saved GST rate applies only to taxable items.");
  } else if (input.taxInclusive) {
    throw new ProductError("Tax-inclusive pricing applies only to taxable items.");
  }

  return {
    type: input.type,
    name: requiredText(input.name, "Enter the product name.", 200, fail),
    code: normalizeCode(input.code),
    description: optionalText(input.description, 2000, fail),
    hsnSac: normalizeHsnSac(input.hsnSac),
    unit: normalizeUnit(input.unit),
    defaultPrice: price,
    defaultDiscount: discount,
    taxCategoryId: category.id,
    savedGstRateId: taxable ? savedRate?.id ?? null : null,
    taxInclusive: taxable ? input.taxInclusive : false,
  };
}

function parsePercentage(value: unknown): string {
  const amount = parseDecimalAmount(
    value,
    "Enter the GST percentage from 0 to 100, with at most 2 decimal places.",
  );
  if (amount.isNegative() || amount.compare(Money.parse("100")) > 0) {
    throw new ProductError("Enter the GST percentage from 0 to 100, with at most 2 decimal places.");
  }
  const canonical = amount.toDecimalString();
  const fraction = canonical.split(".")[1] ?? "";
  if (fraction.length > 2) {
    throw new ProductError("Enter the GST percentage from 0 to 100, with at most 2 decimal places.");
  }
  return canonical;
}

function parseRupees(value: unknown, message: string): string {
  const amount = parseDecimalAmount(value, message);
  if (amount.isNegative() || !roundHalfUp(amount, INR_MINOR_SCALE).equals(amount)) {
    throw new ProductError(message);
  }
  return amount.toDecimalString();
}

function parseDecimalAmount(value: unknown, message: string): Money {
  if (typeof value !== "string") {
    throw new ProductError(message);
  }
  try {
    return Money.parse(value.trim());
  } catch {
    throw new ProductError(message);
  }
}

function normalizeCode(value: unknown): string | null {
  const code = optionalText(value, 40, fail);
  if (code === null) {
    return null;
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(code)) {
    throw new ProductError("Enter a code using letters, digits, and . _ / -.");
  }
  return code;
}

function normalizeHsnSac(value: unknown): string | null {
  const code = optionalText(value, 8, fail);
  if (code === null) {
    return null;
  }
  if (!/^(?:\d{4}|\d{6}|\d{8})$/.test(code)) {
    throw new ProductError("Enter an HSN or SAC of 4, 6, or 8 digits.");
  }
  return code;
}

function normalizeUnit(value: unknown): string {
  const unit = requiredText(value, "Enter the unit, such as nos or hrs.", 16, fail);
  if (!/^[A-Za-z][A-Za-z0-9 ./-]*$/.test(unit)) {
    throw new ProductError("Enter the unit, such as nos or hrs.");
  }
  return unit;
}

function isProductType(value: unknown): value is ProductType {
  return value === "goods" || value === "service";
}
