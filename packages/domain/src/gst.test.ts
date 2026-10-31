/**
 * Expected amounts are computed from the sourced rules, not copied from
 * intermediate implementation output.
 *
 * IGST Act sections 7 and 8: compare supplier location with place of supply.
 * UTGST Act section 2(8): Chandigarh is UTGST; Delhi is not.
 * CGST Act section 15(3): invoice discount reduces the value before tax.
 * CGST Act section 31(3)(c): exempt-only supply uses a bill of supply.
 * Half-up paise rounding. CGST Act section 170 nearest-rupee rounding is not
 * applied, so 10.05 at 18% intra-state stays 0.90 + 0.90, not 1 rupee or 2.
 */

import { describe, expect, it } from "vitest";
import { gstinCheckCharacter } from "./gstin.js";
import {
  GST_RULE_VERSIONS,
  GstError,
  calculateGstDocument,
  selectGstRuleVersion,
  type GstDocumentInput,
  type GstRuleVersion,
} from "./gst.js";
import { STATE_UTS } from "./state-ut.js";
import { BillingError } from "./billing.js";

const keralaGstin = `32AABCU9603R1Z${gstinCheckCharacter("32AABCU9603R1Z")}`;
const delhiGstin = `07AABCU9603R1Z${gstinCheckCharacter("07AABCU9603R1Z")}`;
const chandigarhGstin = `04AABCU9603R1Z${gstinCheckCharacter("04AABCU9603R1Z")}`;

function input(overrides: Partial<GstDocumentInput> = {}): GstDocumentInput {
  return {
    documentType: "tax_invoice",
    documentDate: "2026-10-31",
    gstEnabled: true,
    reverseCharge: false,
    placeOfSupplyStateId: "IN-KL",
    supplier: { stateId: "IN-KL", gstRegistered: true, gstin: keralaGstin },
    recipient: { stateId: "IN-KL", registrationType: "unregistered" },
    lines: [
      {
        description: "Service",
        quantity: "1",
        unit: "nos",
        rate: "1000",
        discountType: "none",
        taxInclusive: false,
        gstRatePercent: "18",
        taxCategoryId: "taxable",
        supplyNature: "service",
      },
    ],
    rules: GST_RULE_VERSIONS,
    states: STATE_UTS,
    ...overrides,
  };
}

describe("GST rule selection", () => {
  it("uses the 1 July 2017 structure and rejects the day before", () => {
    expect(selectGstRuleVersion("2017-07-01", GST_RULE_VERSIONS).id).toBe("gst-structure-2017-07-01");
    expect(selectGstRuleVersion("2026-03-31", GST_RULE_VERSIONS).id).toBe("gst-structure-2017-07-01");
    expect(selectGstRuleVersion("2026-04-01", GST_RULE_VERSIONS).id).toBe("gst-structure-2017-07-01");
    expect(() => selectGstRuleVersion("2017-06-30", GST_RULE_VERSIONS)).toThrow(GstError);
  });

  it("refuses overlapping active rules", () => {
    const overlap: GstRuleVersion = {
      ...GST_RULE_VERSIONS[0]!,
      id: "other",
      effectiveFrom: "2026-01-01",
    };
    expect(() => selectGstRuleVersion("2026-10-31", [...GST_RULE_VERSIONS, overlap])).toThrow(
      /More than one GST rule/,
    );
  });
});

describe("GST components", () => {
  it("charges CGST and SGST for an intra-state supply in Kerala", () => {
    const result = calculateGstDocument(input());
    expect(result.taxes.map((tax) => [tax.taxType, tax.rate, tax.amount])).toEqual([
      ["CGST", "9", "90"],
      ["SGST", "9", "90"],
    ]);
    expect(result.taxTotal).toBe("180");
    expect(result.grandTotal).toBe("1180");
    expect(result.cessTotal).toBe("0");
    expect(result.roundingResidual).toBe("0");
    expect(result.taxes.every((tax) => tax.jurisdictionStateId === "IN-KL")).toBe(true);
  });

  it("charges IGST when the place of supply differs, even if the customer is in the supplier state", () => {
    const result = calculateGstDocument(
      input({
        placeOfSupplyStateId: "IN-MH",
        recipient: { stateId: "IN-KL", registrationType: "unregistered" },
      }),
    );
    expect(result.taxes.map((tax) => tax.taxType)).toEqual(["IGST"]);
    expect(result.taxes[0]).toMatchObject({ rate: "18", amount: "180", jurisdictionStateId: "IN-MH" });
    expect(result.grandTotal).toBe("1180");
    expect(result.recipientStateId).toBe("IN-KL");
  });

  it("does not change the split for an unregistered recipient when the locations match", () => {
    const registered = calculateGstDocument(
      input({
        recipient: {
          stateId: "IN-MH",
          registrationType: "registered",
          gstin: "27AAACR5055K1Z7",
        },
        placeOfSupplyStateId: "IN-MH",
      }),
    );
    const unregistered = calculateGstDocument(
      input({
        recipient: { stateId: "IN-MH", registrationType: "unregistered" },
        placeOfSupplyStateId: "IN-MH",
      }),
    );
    expect(registered.taxes).toEqual(unregistered.taxes);
  });

  it("uses UTGST in Chandigarh and SGST in Delhi", () => {
    const chandigarh = calculateGstDocument(
      input({
        placeOfSupplyStateId: "IN-CH",
        supplier: { stateId: "IN-CH", gstRegistered: true, gstin: chandigarhGstin },
        recipient: { stateId: "IN-CH", registrationType: "unregistered" },
      }),
    );
    expect(chandigarh.taxes.map((tax) => tax.taxType)).toEqual(["CGST", "UTGST"]);

    const delhi = calculateGstDocument(
      input({
        placeOfSupplyStateId: "IN-DL",
        supplier: { stateId: "IN-DL", gstRegistered: true, gstin: delhiGstin },
        recipient: { stateId: "IN-DL", registrationType: "unregistered" },
      }),
    );
    expect(delhi.taxes.map((tax) => tax.taxType)).toEqual(["CGST", "SGST"]);
  });

  it("keeps the same components for goods and services when place of supply is explicit", () => {
    const goods = calculateGstDocument(
      input({
        lines: [
          {
            description: "Goods",
            quantity: "1",
            unit: "nos",
            rate: "1000",
            discountType: "none",
            taxInclusive: false,
            gstRatePercent: "18",
            taxCategoryId: "taxable",
            supplyNature: "goods",
          },
        ],
      }),
    );
    const service = calculateGstDocument(input());
    expect(goods.taxes.map((tax) => [tax.taxType, tax.amount])).toEqual(
      service.taxes.map((tax) => [tax.taxType, tax.amount]),
    );
  });

  it("rounds each intra-state component to paise and does not hide the one-paise IGST difference", () => {
    const line = {
      description: "Odd",
      quantity: "1",
      unit: "nos",
      rate: "10.05",
      discountType: "none" as const,
      taxInclusive: false,
      gstRatePercent: "18",
      taxCategoryId: "taxable" as const,
    };
    const intra = calculateGstDocument(input({ lines: [line] }));
    expect(intra.taxes.map((tax) => tax.amount)).toEqual(["0.9", "0.9"]);
    expect(intra.taxTotal).toBe("1.8");
    expect(intra.grandTotal).toBe("11.85");

    const inter = calculateGstDocument(input({ lines: [line], placeOfSupplyStateId: "IN-MH" }));
    expect(inter.taxes.map((tax) => tax.amount)).toEqual(["1.81"]);
    expect(inter.grandTotal).toBe("11.86");
  });

  it("extracts inclusive tax without adding it again", () => {
    const exact = calculateGstDocument(
      input({
        lines: [
          {
            description: "Included",
            quantity: "1",
            unit: "nos",
            rate: "118",
            discountType: "none",
            taxInclusive: true,
            gstRatePercent: "18",
            taxCategoryId: "taxable",
          },
        ],
      }),
    );
    expect(exact.lines[0]).toMatchObject({ taxableValue: "100", lineAmount: "118" });
    expect(exact.taxes.map((tax) => tax.amount)).toEqual(["9", "9"]);
    expect(exact.roundingResidual).toBe("0");
    expect(exact.grandTotal).toBe("118");

    const residual = calculateGstDocument(
      input({
        lines: [
          {
            description: "Included",
            quantity: "1",
            unit: "nos",
            rate: "100",
            discountType: "none",
            taxInclusive: true,
            gstRatePercent: "18",
            taxCategoryId: "taxable",
          },
        ],
      }),
    );
    expect(residual.lines[0]?.taxableValue).toBe("84.75");
    expect(residual.taxes.map((tax) => tax.amount)).toEqual(["7.63", "7.63"]);
    expect(residual.roundingResidual).toBe("-0.01");
    expect(residual.grandTotal).toBe("100");
  });

  it("taxes the discounted value and keeps a saved-rate mismatch visible", () => {
    const result = calculateGstDocument(
      input({
        lines: [
          {
            description: "Discounted",
            productId: "item-1",
            quantity: "1",
            unit: "nos",
            rate: "100",
            discountType: "percent",
            discountValue: "10",
            taxInclusive: false,
            gstRatePercent: "18",
            taxCategoryId: "taxable",
          },
        ],
        productRates: { "item-1": "12" },
      }),
    );
    expect(result.lines[0]).toMatchObject({ discountAmount: "10", taxableValue: "90" });
    expect(result.taxes.map((tax) => tax.amount)).toEqual(["8.1", "8.1"]);
    expect(result.taxTotal).toBe("16.2");
    expect(result.grandTotal).toBe("106.2");
    expect(result.notices.join(" ")).toMatch(/saved GST rate 12/);
    expect(result.taxes[0]?.rate).toBe("9");
  });

  it("sums more than one rate and taxes a taxable charge", () => {
    const result = calculateGstDocument(
      input({
        lines: [
          {
            description: "Five",
            quantity: "1",
            unit: "nos",
            rate: "100",
            discountType: "none",
            taxInclusive: false,
            gstRatePercent: "5",
            taxCategoryId: "taxable",
          },
          {
            description: "Eighteen",
            quantity: "1",
            unit: "nos",
            rate: "100",
            discountType: "none",
            taxInclusive: false,
            gstRatePercent: "18",
            taxCategoryId: "taxable",
          },
        ],
        charges: [
          {
            description: "Freight",
            amount: "10",
            taxable: true,
            taxCategoryId: "taxable",
            gstRatePercent: "18",
          },
        ],
      }),
    );
    expect(result.taxes.map((tax) => [tax.taxType, tax.amount])).toEqual([
      ["CGST", "2.5"],
      ["SGST", "2.5"],
      ["CGST", "9"],
      ["SGST", "9"],
      ["CGST", "0.9"],
      ["SGST", "0.9"],
    ]);
    expect(result.taxTotal).toBe("24.8");
    expect(result.grandTotal).toBe("234.8");
    expect(result.taxableTotal).toBe("210");
  });

  it("separates exempt, nil-rated and non-GST amounts", () => {
    const result = calculateGstDocument(
      input({
        lines: [
          {
            description: "Taxable",
            quantity: "1",
            unit: "nos",
            rate: "100",
            discountType: "none",
            taxInclusive: false,
            gstRatePercent: "18",
            taxCategoryId: "taxable",
          },
          {
            description: "Exempt",
            quantity: "1",
            unit: "nos",
            rate: "40",
            discountType: "none",
            taxInclusive: false,
            taxCategoryId: "exempt",
          },
          {
            description: "Nil",
            quantity: "1",
            unit: "nos",
            rate: "25",
            discountType: "none",
            taxInclusive: false,
            gstRatePercent: "0",
            taxCategoryId: "nil-rated",
          },
          {
            description: "Outside",
            quantity: "1",
            unit: "nos",
            rate: "5",
            discountType: "none",
            taxInclusive: false,
            taxCategoryId: "non-gst",
          },
        ],
      }),
    );
    expect(result.taxableTotal).toBe("125");
    expect(result.exemptTotal).toBe("40");
    expect(result.nonGstTotal).toBe("5");
    expect(result.taxTotal).toBe("18");
    expect(result.grandTotal).toBe("188");
    expect(result.taxes.filter((tax) => tax.taxableValue === "25").every((tax) => tax.amount === "0")).toBe(
      true,
    );
  });

  it("shows reverse-charge tax without adding it to the amount payable", () => {
    const result = calculateGstDocument(input({ reverseCharge: true }));
    expect(result.taxTotal).toBe("180");
    expect(result.grandTotal).toBe("1000");
    expect(result.taxes.every((tax) => tax.reverseCharge)).toBe(true);
    expect(() =>
      calculateGstDocument(
        input({
          reverseCharge: true,
          lines: [
            {
              description: "Included",
              quantity: "1",
              unit: "nos",
              rate: "118",
              discountType: "none",
              taxInclusive: true,
              gstRatePercent: "18",
              taxCategoryId: "taxable",
            },
          ],
        }),
      ),
    ).toThrow(/reverse charge/);
    expect(() => calculateGstDocument(input({ reverseChargeCategory: "goods transport" }))).toThrow(
      /not verified/,
    );
  });

  it("rejects cess, a missing place of supply, and an unregistered tax invoice", () => {
    expect(() =>
      calculateGstDocument(
        input({
          lines: [
            {
              description: "Cess",
              quantity: "1",
              unit: "nos",
              rate: "100",
              discountType: "none",
              taxInclusive: false,
              gstRatePercent: "28",
              taxCategoryId: "taxable",
              cessRatePercent: "12",
            },
          ],
        }),
      ),
    ).toThrow(/cess/i);
    expect(() => calculateGstDocument(input({ placeOfSupplyStateId: null }))).toThrow(/place of supply/);
    expect(() =>
      calculateGstDocument(
        input({ supplier: { stateId: "IN-KL", gstRegistered: false, gstin: null } }),
      ),
    ).toThrow(/GST-registered/);
    expect(() => calculateGstDocument(input({ lines: [{ ...input().lines[0]!, rate: "-1" }] }))).toThrow(
      BillingError,
    );
  });
});

describe("documents outside tax", () => {
  it("keeps a non-GST invoice and a bill of supply free of tax rows", () => {
    const nonGst = calculateGstDocument(
      input({
        documentType: "non_gst_invoice",
        gstEnabled: false,
        reverseCharge: false,
        placeOfSupplyStateId: null,
        supplier: { stateId: "IN-KL", gstRegistered: false, gstin: null },
        lines: [
          {
            description: "Notebook",
            quantity: "3",
            unit: "nos",
            rate: "10.10",
            discountType: "percent",
            discountValue: "10",
            taxInclusive: false,
            taxCategoryId: "non-gst",
          },
        ],
      }),
    );
    expect(nonGst.taxes).toEqual([]);
    expect(nonGst.taxTotal).toBe("0");
    expect(nonGst.grandTotal).toBe("27.27");
    expect(nonGst.ruleVersionId).toBeNull();

    const bill = calculateGstDocument(
      input({
        documentType: "bill_of_supply",
        gstEnabled: false,
        placeOfSupplyStateId: null,
        lines: [
          {
            description: "Rice",
            quantity: "1",
            unit: "kg",
            rate: "40",
            discountType: "none",
            taxInclusive: false,
            taxCategoryId: "exempt",
          },
        ],
      }),
    );
    expect(bill.taxes).toEqual([]);
    expect(bill.exemptTotal).toBe("40");
    expect(bill.grandTotal).toBe("40");
    expect(() =>
      calculateGstDocument(
        input({
          documentType: "bill_of_supply",
          gstEnabled: false,
          placeOfSupplyStateId: null,
          lines: [
            {
              description: "Taxable",
              quantity: "1",
              unit: "nos",
              rate: "10",
              discountType: "none",
              taxInclusive: false,
              gstRatePercent: "18",
              taxCategoryId: "taxable",
            },
          ],
        }),
      ),
    ).toThrow(/bill of supply/);
  });
});
