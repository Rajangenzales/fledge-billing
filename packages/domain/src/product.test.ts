import { describe, expect, it } from "vitest";
import { ProductError, validateProductInput, validateSavedGstRate } from "./product.js";

const gst18 = { id: "rate-18", active: true };

describe("product validation", () => {
  it("accepts taxable goods with a saved GST rate and an exact rupee price", () => {
    const product = validateProductInput(
      {
        type: "goods",
        name: "Notebook",
        code: "NB-1",
        hsnSac: "482010",
        unit: "nos",
        defaultPrice: "100.50",
        defaultDiscount: "0.50",
        taxCategoryId: "taxable",
        savedGstRateId: "rate-18",
        taxInclusive: false,
      },
      gst18,
    );
    expect(product).toMatchObject({
      type: "goods",
      defaultPrice: "100.5",
      defaultDiscount: "0.5",
      hsnSac: "482010",
      taxCategoryId: "taxable",
      savedGstRateId: "rate-18",
      taxInclusive: false,
    });
  });

  it("stores a saved GST percentage as user configuration", () => {
    expect(validateSavedGstRate({ name: "GST 18", percentage: "18" })).toEqual({
      name: "GST 18",
      percentage: "18",
    });
    expect(validateSavedGstRate({ name: "Quarter", percentage: "0.25" }).percentage).toBe("0.25");
    expect(() => validateSavedGstRate({ name: "Too fine", percentage: "18.125" })).toThrow(
      ProductError,
    );
    expect(() => validateSavedGstRate({ name: "Over", percentage: "100.01" })).toThrow(
      ProductError,
    );
  });

  it("keeps exempt and non-GST items free of a saved rate and inclusive pricing", () => {
    const exempt = validateProductInput(
      {
        type: "service",
        name: "Consulting",
        unit: "hrs",
        defaultPrice: "1500",
        taxCategoryId: "exempt",
        taxInclusive: false,
      },
      null,
    );
    expect(exempt.savedGstRateId).toBeNull();
    expect(exempt.taxInclusive).toBe(false);
    expect(() =>
      validateProductInput(
        {
          type: "goods",
          name: "Rice",
          unit: "kg",
          defaultPrice: "40",
          taxCategoryId: "nil-rated",
          savedGstRateId: "rate-18",
          taxInclusive: false,
        },
        gst18,
      ),
    ).toThrow(/only to taxable/);
    expect(() =>
      validateProductInput(
        {
          type: "goods",
          name: "Notebook",
          unit: "nos",
          defaultPrice: "10",
          taxCategoryId: "taxable",
          taxInclusive: true,
        },
        null,
      ),
    ).toThrow(/saved GST rate/);
  });

  it("rejects a discount above the price and a price finer than paise", () => {
    expect(() =>
      validateProductInput(
        {
          type: "goods",
          name: "Notebook",
          unit: "nos",
          defaultPrice: "10",
          defaultDiscount: "10.01",
          taxCategoryId: "exempt",
          taxInclusive: false,
        },
        null,
      ),
    ).toThrow(/discount/);
    expect(() =>
      validateProductInput(
        {
          type: "goods",
          name: "Notebook",
          unit: "nos",
          defaultPrice: "10.555",
          taxCategoryId: "exempt",
          taxInclusive: false,
        },
        null,
      ),
    ).toThrow(ProductError);
    expect(() =>
      validateProductInput(
        {
          type: "goods",
          name: "Notebook",
          hsnSac: "12345",
          unit: "nos",
          defaultPrice: "10",
          taxCategoryId: "exempt",
          taxInclusive: false,
        },
        null,
      ),
    ).toThrow(/HSN or SAC/);
  });
});
