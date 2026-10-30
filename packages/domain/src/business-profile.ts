/**
 * Local business profile.
 *
 * GST registration status and GSTIN are separate fields. A registered business
 * must have a GSTIN whose first two digits match the selected State or Union
 * Territory.
 */

import { findStateUtById, type StateUt } from "./state-ut.js";
import { normalizeEmail, normalizePhone, normalizePin, optionalText, requiredText } from "./input.js";
import { assertGstinMatchesState, normalizeGstin } from "./gstin.js";

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

const fail = (message: string): never => {
  throw new BusinessProfileError(message);
};

export function validateBusinessInput(
  input: SaveBusinessProfileInput,
  states: readonly StateUt[],
): NormalizedBusinessInput {
  const legalName = requiredText(input.legalName, "Enter the legal name of the business.", 200, fail);
  const displayName = optionalText(input.displayName, 200, fail) ?? legalName;
  const address = requiredText(input.address, "Enter the business address.", 500, fail);
  const state = findStateUtById(input.stateId, states);
  if (!state || !state.active) {
    throw new BusinessProfileError("Choose an active Indian State or Union Territory.");
  }

  if (typeof input.gstRegistered !== "boolean") {
    throw new BusinessProfileError("Choose whether the business is GST-registered.");
  }

  const gstin = normalizeGstin(input.gstin, fail);
  if (input.gstRegistered) {
    if (!gstin) {
      throw new BusinessProfileError("Enter the GSTIN for a GST-registered business.");
    }
    assertGstinMatchesState(gstin, state, states, fail);
  } else if (gstin) {
    throw new BusinessProfileError("Clear the GSTIN when the business is not GST-registered.");
  }

  return {
    legalName,
    displayName,
    address,
    stateId: state.id,
    pinCode: normalizePin(input.pinCode, fail),
    gstRegistered: input.gstRegistered,
    gstin,
    businessType: optionalText(input.businessType, 80, fail),
    phone: normalizePhone(input.phone, fail),
    email: normalizeEmail(input.email, fail),
    logoReference: optionalText(input.logoReference, 300, fail),
    paymentDetails: optionalText(input.paymentDetails, 2000, fail),
    invoicePreferences: optionalText(input.invoicePreferences, 2000, fail),
  };
}
