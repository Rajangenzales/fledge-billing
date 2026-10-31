import { describe, expect, it } from "vitest";
import {
  BillingError,
  calculateDocument,
  financialYearOf,
  formatDocumentNumber,
} from "./billing.js";

describe("billing calculations", () => {
  it("labels the Indian financial year from April", () => {
    expect(financialYearOf("2026-03-31")).toBe("2025-26");
    expect(financialYearOf("2026-04-01")).toBe("2026-27");
    expect(financialYearOf("2026-10-31")).toBe("2026-27");
    expect(() => financialYearOf("2026-02-31")).toThrow(BillingError);
  });

  it("rounds a line net to paise from the unrounded quantity and rate", () => {
    const result = calculateDocument({
      gstEnabled: false,
      lines: [
        {
          description: "Notebook",
          quantity: "3",
          unit: "nos",
          rate: "10.10",
          discountType: "percent",
          discountValue: "10",
          taxInclusive: false,
        },
      ],
    });
    expect(result.lines[0]).toMatchObject({
      discountAmount: "3.03",
      lineAmount: "27.27",
      taxableValue: "27.27",
    });
    expect(result.taxTotal).toBe("0");
    expect(result.grandTotal).toBe("27.27");
  });

  it("extracts an inclusive taxable value without adding tax again", () => {
    const result = calculateDocument({
      gstEnabled: true,
      lines: [
        {
          description: "Included",
          quantity: "1",
          unit: "nos",
          rate: "100",
          discountType: "none",
          taxInclusive: true,
          gstRatePercent: "18",
        },
      ],
      charges: [{ description: "Freight", amount: "10", taxable: true }],
    });
    expect(result.lines[0]).toMatchObject({
      lineAmount: "100",
      taxableValue: "84.75",
    });
    expect(result.taxableTotal).toBe("94.75");
    expect(result.taxTotal).toBe("0");
    expect(result.grandTotal).toBe("110");
  });

  it("keeps a bill of supply out of GST pricing", () => {
    expect(() =>
      calculateDocument({
        gstEnabled: false,
        lines: [
          {
            description: "Rice",
            quantity: "1",
            unit: "kg",
            rate: "40",
            discountType: "none",
            taxInclusive: true,
          },
        ],
      }),
    ).toThrow(/GST to be enabled/);
  });
});

describe("document numbers", () => {
  it("pads the sequence inside the financial year", () => {
    expect(formatDocumentNumber("INV", "2026-27", 1, 4)).toBe("INV/2026-27/0001");
    expect(formatDocumentNumber("QT", "2026-27", 10000, 4)).toBe("QT/2026-27/10000");
  });
});
