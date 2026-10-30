import { describe, expect, it } from "vitest";
import {
  BusinessProfileError,
  gstinCheckCharacter,
  validateBusinessInput,
  type SaveBusinessProfileInput,
} from "./business-profile.js";
import { STATE_UTS } from "./state-ut.js";

const keralaGstin = `32AABCU9603R1Z${gstinCheckCharacter("32AABCU9603R1Z")}`;

function input(overrides: Partial<SaveBusinessProfileInput> = {}): SaveBusinessProfileInput {
  return {
    legalName: "Fledge Traders",
    address: "12 Market Road, Kochi",
    stateId: "IN-KL",
    gstRegistered: false,
    ...overrides,
  };
}

describe("business profile validation", () => {
  it("calculates the published GSTIN check digit", () => {
    expect(gstinCheckCharacter("27AAACR5055K1Z")).toBe("7");
  });

  it("accepts an unregistered business and defaults the display name", () => {
    const profile = validateBusinessInput(
      input({ pinCode: "682001", phone: "+91 98470 12345", email: "accounts@example.com" }),
      STATE_UTS,
    );
    expect(profile).toMatchObject({
      legalName: "Fledge Traders",
      displayName: "Fledge Traders",
      stateId: "IN-KL",
      pinCode: "682001",
      gstRegistered: false,
      gstin: null,
    });
  });

  it("accepts a GSTIN whose state code matches the selected state", () => {
    const profile = validateBusinessInput(
      input({ gstRegistered: true, gstin: ` ${keralaGstin.toLowerCase()} ` }),
      STATE_UTS,
    );
    expect(profile.gstin).toBe(keralaGstin);
    expect(profile.gstRegistered).toBe(true);
  });

  it("keeps GST registration status separate from the GSTIN", () => {
    expect(() => validateBusinessInput(input({ gstRegistered: true }), STATE_UTS)).toThrow(
      BusinessProfileError,
    );
    expect(() =>
      validateBusinessInput(input({ gstRegistered: false, gstin: keralaGstin }), STATE_UTS),
    ).toThrow(/Clear the GSTIN/);
    expect(() =>
      validateBusinessInput(
        input({ gstRegistered: true, gstin: "27AAACR5055K1Z7", stateId: "IN-KL" }),
        STATE_UTS,
      ),
    ).toThrow(/does not match/);
    expect(() =>
      validateBusinessInput(
        input({ gstRegistered: true, gstin: "27AAACR5056K1Z7", stateId: "IN-MH" }),
        STATE_UTS,
      ),
    ).toThrow(/check digit/);
  });

  it("requires an active State or Union Territory and a legal name", () => {
    expect(() => validateBusinessInput(input({ stateId: "IN-DD" }), STATE_UTS)).toThrow(
      /active Indian State/,
    );
    expect(() => validateBusinessInput(input({ stateId: "Kerala" }), STATE_UTS)).toThrow(
      /active Indian State/,
    );
    expect(() => validateBusinessInput(input({ legalName: "  " }), STATE_UTS)).toThrow(
      /legal name/,
    );
    expect(() => validateBusinessInput(input({ pinCode: "012345" }), STATE_UTS)).toThrow(
      /PIN code/,
    );
  });
});
