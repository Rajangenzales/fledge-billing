/**
 * Local business profile.
 *
 * GST registration status and GSTIN are separate fields. A registered business
 * must have a GSTIN whose first two digits match the selected State or Union
 * Territory. The 15th character is the GSTN modulus-36 check digit.
 *
 * Worked example: 27AAACR5055K1Z7.
 */

import { findStateUtByGstStateCode, findStateUtById, type StateUt } from "./state-ut.js";

const GSTIN_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export class BusinessProfileError extends Error {
  readonly userMessage: string;

  constructor(userMessage: string) {
    super(userMessage);
    this.name = "BusinessProfileError";
    this.userMessage = userMessage;
  }
}

export type SaveBusinessProfileInput = {
  legalName: string;
  displayName?: string | null;
  address: string;
  stateId: string;
  pinCode?: string | null;
  gstRegistered: boolean;
  gstin?: string | null;
  businessType?: string | null;
  phone?: string | null;
  email?: string | null;
  logoReference?: string | null;
  paymentDetails?: string | null;
  invoicePreferences?: string | null;
};

export type NormalizedBusinessInput = {
  legalName: string;
  displayName: string;
  address: string;
  stateId: string;
  pinCode: string | null;
  gstRegistered: boolean;
  gstin: string | null;
  businessType: string | null;
  phone: string | null;
  email: string | null;
  logoReference: string | null;
  paymentDetails: string | null;
  invoicePreferences: string | null;
};

export function gstinCheckCharacter(first14: string): string {
  if (!/^[0-9A-Z]{14}$/.test(first14)) {
    throw new BusinessProfileError(
      "Enter the first 14 characters of a GSTIN before calculating the check digit.",
    );
  }
  let sum = 0;
  for (let index = 0; index < first14.length; index += 1) {
    const character = first14[index] ?? "";
    const value = GSTIN_ALPHABET.indexOf(character);
    const factor = index % 2 === 0 ? 1 : 2;
    const product = value * factor;
    sum += Math.floor(product / 36) + (product % 36);
  }
  const check = GSTIN_ALPHABET[(36 - (sum % 36)) % 36];
  if (!check) {
    throw new BusinessProfileError("The GSTIN check digit could not be calculated.");
  }
  return check;
}

export function validateBusinessInput(
  input: SaveBusinessProfileInput,
  states: readonly StateUt[],
): NormalizedBusinessInput {
  const legalName = requiredText(input.legalName, "Enter the legal name of the business.", 200);
  const displayName = optionalText(input.displayName, 200) ?? legalName;
  const address = requiredText(input.address, "Enter the business address.", 500);
  const state = findStateUtById(input.stateId, states);
  if (!state || !state.active) {
    throw new BusinessProfileError("Choose an active Indian State or Union Territory.");
  }

  if (typeof input.gstRegistered !== "boolean") {
    throw new BusinessProfileError("Choose whether the business is GST-registered.");
  }

  const gstin = normalizeGstin(input.gstin);
  if (input.gstRegistered) {
    if (!gstin) {
      throw new BusinessProfileError("Enter the GSTIN for a GST-registered business.");
    }
    assertGstin(gstin, state, states);
  } else if (gstin) {
    throw new BusinessProfileError(
      "Clear the GSTIN when the business is not GST-registered.",
    );
  }

  return {
    legalName,
    displayName,
    address,
    stateId: state.id,
    pinCode: normalizePin(input.pinCode),
    gstRegistered: input.gstRegistered,
    gstin,
    businessType: optionalText(input.businessType, 80),
    phone: normalizePhone(input.phone),
    email: normalizeEmail(input.email),
    logoReference: optionalText(input.logoReference, 300),
    paymentDetails: optionalText(input.paymentDetails, 2000),
    invoicePreferences: optionalText(input.invoicePreferences, 2000),
  };
}

function assertGstin(gstin: string, state: StateUt, states: readonly StateUt[]): void {
  if (!GSTIN_PATTERN.test(gstin)) {
    throw new BusinessProfileError("Enter a 15-character GSTIN, with Z before the check digit.");
  }
  if (gstinCheckCharacter(gstin.slice(0, 14)) !== gstin[14]) {
    throw new BusinessProfileError("The GSTIN check digit does not match.");
  }
  const gstState = findStateUtByGstStateCode(gstin.slice(0, 2), states);
  if (!gstState?.active) {
    throw new BusinessProfileError(
      "The GSTIN starts with a state code that is not an active State or Union Territory.",
    );
  }
  if (gstState.id !== state.id) {
    throw new BusinessProfileError(
      "The GSTIN state code does not match the selected State or Union Territory.",
    );
  }
}

function normalizeGstin(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new BusinessProfileError("Enter a 15-character GSTIN, with Z before the check digit.");
  }
  const gstin = value.trim().toUpperCase();
  return gstin.length === 0 ? null : gstin;
}

function requiredText(value: string, message: string, maxLength: number): string {
  if (typeof value !== "string") {
    throw new BusinessProfileError(message);
  }
  const text = value.trim();
  if (text.length === 0 || text.length > maxLength || hasControlCharacter(text)) {
    throw new BusinessProfileError(message);
  }
  return text;
}

function optionalText(value: string | null | undefined, maxLength: number): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new BusinessProfileError("Enter text without control characters.");
  }
  const text = value.trim();
  if (text.length === 0) {
    return null;
  }
  if (text.length > maxLength || hasControlCharacter(text)) {
    throw new BusinessProfileError(`Keep this field to ${maxLength} characters.`);
  }
  return text;
}

function normalizePin(value: string | null | undefined): string | null {
  const pin = optionalText(value, 6);
  if (pin === null) {
    return null;
  }
  if (!/^[1-9][0-9]{5}$/.test(pin)) {
    throw new BusinessProfileError("Enter a 6-digit PIN code.");
  }
  return pin;
}

function normalizePhone(value: string | null | undefined): string | null {
  const phone = optionalText(value, 20);
  if (phone === null) {
    return null;
  }
  if (!/^\+?[0-9][0-9\s-]{7,18}$/.test(phone)) {
    throw new BusinessProfileError("Enter a phone number with 8 to 15 digits.");
  }
  const digits = phone.replace(/\D/g, "").length;
  if (digits < 8 || digits > 15) {
    throw new BusinessProfileError("Enter a phone number with 8 to 15 digits.");
  }
  return phone;
}

function normalizeEmail(value: string | null | undefined): string | null {
  const email = optionalText(value, 200);
  if (email === null) {
    return null;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new BusinessProfileError("Enter a valid email address.");
  }
  return email;
}

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code < 32 || code === 127;
  });
}
