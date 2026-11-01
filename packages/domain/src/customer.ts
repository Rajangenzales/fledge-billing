/**
 * Customer records for the local business.
 * Registration type and GSTIN are separate. The GSTIN uses the same check as
 * the business profile and must match the customer's State or Union Territory.
 */

import { findStateUtById, type StateUt } from "./state-ut.js";
import { normalizeEmail, normalizePhone, normalizePin, optionalText, requiredText } from "./input.js";
import { assertGstinMatchesState, normalizeGstin } from "./gstin.js";

export const CUSTOMER_REGISTRATION_TYPES = ["registered", "unregistered"] as const;

export type CustomerRegistrationType = (typeof CUSTOMER_REGISTRATION_TYPES)[number];

export class CustomerError extends Error {
  readonly userMessage: string;

  constructor(userMessage: string) {
    super(userMessage);
    this.name = "CustomerError";
    this.userMessage = userMessage;
  }
}

export type SaveCustomerInput = {
  name: string;
  billingAddress: string;
  shippingAddress?: string | null;
  stateId: string;
  pinCode?: string | null;
  phone?: string | null;
  email?: string | null;
  registrationType: CustomerRegistrationType;
  gstin?: string | null;
  notes?: string | null;
  creditDays?: number;
};

export type NormalizedCustomerInput = {
  name: string;
  billingAddress: string;
  shippingAddress: string | null;
  stateId: string;
  pinCode: string | null;
  phone: string | null;
  email: string | null;
  registrationType: CustomerRegistrationType;
  gstin: string | null;
  notes: string | null;
  creditDays: number;
};

const fail = (message: string): never => {
  throw new CustomerError(message);
};

export function validateCustomerInput(
  input: SaveCustomerInput,
  states: readonly StateUt[],
): NormalizedCustomerInput {
  const name = requiredText(input.name, "Enter the customer name.", 200, fail);
  const billingAddress = requiredText(input.billingAddress, "Enter the billing address.", 500, fail);
  const state = findStateUtById(input.stateId, states);
  if (!state || !state.active) {
    throw new CustomerError("Choose an active Indian State or Union Territory.");
  }
  if (!isRegistrationType(input.registrationType)) {
    throw new CustomerError("Choose whether the customer is GST-registered.");
  }

  const creditDays = input.creditDays ?? 0;
  if (!Number.isInteger(creditDays) || creditDays < 0 || creditDays > 365) {
    throw new CustomerError("Credit period must be a whole number from 0 to 365 days.");
  }

  const gstin = normalizeGstin(input.gstin, fail);
  if (input.registrationType === "registered") {
    if (!gstin) {
      throw new CustomerError("Enter the GSTIN for a GST-registered customer.");
    }
    assertGstinMatchesState(gstin, state, states, fail);
  } else if (gstin) {
    throw new CustomerError("Clear the GSTIN when the customer is not GST-registered.");
  }

  return {
    name,
    billingAddress,
    shippingAddress: optionalText(input.shippingAddress, 500, fail),
    stateId: state.id,
    pinCode: normalizePin(input.pinCode, fail),
    phone: normalizePhone(input.phone, fail),
    email: normalizeEmail(input.email, fail),
    registrationType: input.registrationType,
    gstin,
    notes: optionalText(input.notes, 2000, fail),
    creditDays,
  };
}

function isRegistrationType(value: unknown): value is CustomerRegistrationType {
  return value === "registered" || value === "unregistered";
}
