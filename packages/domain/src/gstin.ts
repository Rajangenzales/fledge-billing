/**
 * GSTIN structure and the GSTN modulus-36 check digit.
 * Worked example: 27AAACR5055K1Z7.
 */

import { findStateUtByGstStateCode, type StateUt } from "./state-ut.js";
import type { Fail } from "./input.js";

const GSTIN_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export class GstinError extends Error {
  readonly userMessage: string;

  constructor(userMessage: string) {
    super(userMessage);
    this.name = "GstinError";
    this.userMessage = userMessage;
  }
}

export function gstinCheckCharacter(first14: string): string {
  if (!/^[0-9A-Z]{14}$/.test(first14)) {
    throw new GstinError(
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
    throw new GstinError("The GSTIN check digit could not be calculated.");
  }
  return check;
}

export function normalizeGstin(value: unknown, fail: Fail): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw fail("Enter a 15-character GSTIN, with Z before the check digit.");
  }
  const gstin = value.trim().toUpperCase();
  return gstin.length === 0 ? null : gstin;
}

export function assertGstinMatchesState(
  gstin: string,
  state: StateUt,
  states: readonly StateUt[],
  fail: Fail,
): void {
  if (!GSTIN_PATTERN.test(gstin) || gstinCheckCharacter(gstin.slice(0, 14)) !== gstin[14]) {
    if (!GSTIN_PATTERN.test(gstin)) {
      throw fail("Enter a 15-character GSTIN, with Z before the check digit.");
    }
    throw fail("The GSTIN check digit does not match.");
  }
  const gstState = findStateUtByGstStateCode(gstin.slice(0, 2), states);
  if (!gstState?.active) {
    throw fail(
      "The GSTIN starts with a state code that is not an active State or Union Territory.",
    );
  }
  if (gstState.id !== state.id) {
    throw fail("The GSTIN state code does not match the selected State or Union Territory.");
  }
}
