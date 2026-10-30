import { describe, expect, it } from "vitest";
import { gstinCheckCharacter } from "./gstin.js";
import { STATE_UTS } from "./state-ut.js";
import { CustomerError, validateCustomerInput, type SaveCustomerInput } from "./customer.js";

const keralaGstin = `32AABCU9603R1Z${gstinCheckCharacter("32AABCU9603R1Z")}`;

function input(overrides: Partial<SaveCustomerInput> = {}): SaveCustomerInput {
  return {
    name: "Harbour Stores",
    billingAddress: "8 Beach Road, Kochi",
    stateId: "IN-KL",
    registrationType: "unregistered",
    ...overrides,
  };
}

describe("customer validation", () => {
  it("accepts an unregistered customer and an optional shipping address", () => {
    const customer = validateCustomerInput(
      input({ shippingAddress: "Warehouse 2, Kochi", pinCode: "682001", notes: "Pays weekly" }),
      STATE_UTS,
    );
    expect(customer).toMatchObject({
      name: "Harbour Stores",
      stateId: "IN-KL",
      registrationType: "unregistered",
      gstin: null,
      shippingAddress: "Warehouse 2, Kochi",
      notes: "Pays weekly",
    });
  });

  it("accepts a GSTIN that matches the customer state", () => {
    const customer = validateCustomerInput(
      input({ registrationType: "registered", gstin: ` ${keralaGstin.toLowerCase()} ` }),
      STATE_UTS,
    );
    expect(customer.gstin).toBe(keralaGstin);
    expect(customer.registrationType).toBe("registered");
  });

  it("keeps registration type separate from the GSTIN", () => {
    expect(() => validateCustomerInput(input({ registrationType: "registered" }), STATE_UTS)).toThrow(
      CustomerError,
    );
    expect(() =>
      validateCustomerInput(input({ registrationType: "unregistered", gstin: keralaGstin }), STATE_UTS),
    ).toThrow(/Clear the GSTIN/);
    expect(() =>
      validateCustomerInput(
        input({ registrationType: "registered", gstin: "27AAACR5055K1Z7", stateId: "IN-KL" }),
        STATE_UTS,
      ),
    ).toThrow(/does not match/);
    expect(() =>
      validateCustomerInput(
        input({ registrationType: "registered", gstin: "27AAACR5056K1Z7", stateId: "IN-MH" }),
        STATE_UTS,
      ),
    ).toThrow(/check digit/);
  });

  it("requires an active State or Union Territory", () => {
    expect(() => validateCustomerInput(input({ stateId: "IN-DD" }), STATE_UTS)).toThrow(CustomerError);
    expect(() => validateCustomerInput(input({ name: " " }), STATE_UTS)).toThrow(/customer name/);
  });
});
