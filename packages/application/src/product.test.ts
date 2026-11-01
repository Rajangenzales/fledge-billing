import { describe, expect, it } from "vitest";
import {
  createProduct,
  listProducts,
  type ProductDeps,
  type StoredProduct,
  type TaxCategory,
} from "./product.js";

const categories: TaxCategory[] = [
  { id: "taxable", name: "Taxable", code: "TAX" },
  { id: "exempt", name: "Exempt", code: "EXM" },
  { id: "nil-rated", name: "Nil-rated", code: "NIL" },
  { id: "non-gst", name: "Non-GST", code: "NGS" },
];

function deps(overrides: Partial<ProductDeps["repository"]> = {}): ProductDeps {
  const stored: StoredProduct[] = [];
  const repository: ProductDeps["repository"] = {
    getBusinessId: async () => "business-1",
    listTaxCategories: async () => categories,
    listSavedGstRates: async () => [],
    getSavedGstRate: async () => null,
    insertSavedGstRate: async () => undefined,
    updateSavedGstRate: async () => undefined,
    listProducts: async () => stored,
    getProduct: async (id) => stored.find((product) => product.id === id) ?? null,
    insertProduct: async (record) => { stored.push(record); },
    updateProduct: async (record) => {
      const index = stored.findIndex((product) => product.id === record.id);
      if (index >= 0) stored[index] = record;
    },
  };
  Object.assign(repository, overrides);
  return {
    repository,
    now: () => "2026-10-31T02:00:00.000Z",
    createId: () => "product-1",
  };
}

const riceInput = {
  type: "goods" as const,
  name: "Rice",
  unit: "kg",
  defaultPrice: "40",
  taxCategoryId: "non-gst" as const,
  taxInclusive: false,
};

describe("async product application workflows", () => {
  it("waits for a delayed product write before resolving", async () => {
    let releaseWrite!: () => void;
    let writeCompleted = false;
    const writeGate = new Promise<void>((resolve) => { releaseWrite = resolve; });
    const productDeps = deps({
      insertProduct: async () => {
        await writeGate;
        writeCompleted = true;
      },
    });

    let resolved = false;
    const result = createProduct(riceInput, productDeps).then((product) => {
      resolved = true;
      return product;
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(resolved).toBe(false);
    expect(writeCompleted).toBe(false);

    releaseWrite();
    await expect(result).resolves.toMatchObject({ name: "Rice" });
    expect(writeCompleted).toBe(true);
  });

  it("propagates repository read failures instead of returning an empty list", async () => {
    const failure = new Error("product storage unavailable");
    const productDeps = deps({
      listProducts: async () => { throw failure; },
    });

    await expect(listProducts(productDeps)).rejects.toBe(failure);
  });

  it("propagates repository write failures instead of reporting a created product", async () => {
    const failure = new Error("product write failed");
    const productDeps = deps({
      insertProduct: async () => { throw failure; },
    });

    await expect(createProduct(riceInput, productDeps)).rejects.toBe(failure);
  });
});
