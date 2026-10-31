import { ProductError } from "@fledge/domain";
import {
  createProduct,
  createSavedGstRate,
  getProduct,
  listProducts,
  listSavedGstRates,
  listTaxCategories,
  saveBusinessProfile,
  updateProduct,
  updateSavedGstRate,
} from "@fledge/application";
import { afterEach, describe, expect, it } from "vitest";
import { createBusinessRepository } from "./business.js";
import { openDatabase, type SchemaDatabase } from "./connection.js";
import { migrate } from "./migrate.js";
import { migrations } from "./migrations.js";
import { createProductRepository } from "./product.js";
import { listStateUts } from "./state-ut.js";

const openDatabases: SchemaDatabase[] = [];

afterEach(() => {
  for (const db of openDatabases.splice(0)) {
    db.close();
  }
});

function database(): SchemaDatabase {
  const db = openDatabase(":memory:");
  openDatabases.push(db);
  migrate(db, migrations);
  return db;
}

function productDeps(db: SchemaDatabase) {
  let sequence = 0;
  return {
    repository: createProductRepository(db),
    now: () => "2026-10-31T02:00:00.000Z",
    createId: () => {
      sequence += 1;
      return `item-${sequence}`;
    },
  };
}

function saveBusiness(db: SchemaDatabase): void {
  saveBusinessProfile(
    {
      legalName: "Fledge Traders",
      address: "12 Market Road, Kochi",
      stateId: "IN-KL",
      gstRegistered: false,
    },
    {
      repository: createBusinessRepository(db),
      states: listStateUts(db),
      now: () => "2026-10-31T01:00:00.000Z",
      createId: () => "biz-1",
    },
  );
}

describe("products and services", () => {
  it("requires a business profile before a product can be saved", () => {
    const db = database();
    expect(listTaxCategories(productDeps(db)).map((category) => category.id)).toEqual([
      "taxable",
      "exempt",
      "nil-rated",
      "non-gst",
    ]);
    expect(() =>
      createSavedGstRate({ name: "GST 18", percentage: "18" }, productDeps(db)),
    ).toThrow(ProductError);
  });

  it("saves a user GST rate and a taxable product without calculating tax", () => {
    const db = database();
    saveBusiness(db);
    const deps = productDeps(db);
    const rate = createSavedGstRate({ name: "GST 18", percentage: "18.00" }, deps);
    const created = createProduct(
      {
        type: "goods",
        name: "Notebook",
        code: "NB-1",
        hsnSac: "482010",
        unit: "nos",
        defaultPrice: "100.50",
        defaultDiscount: "0",
        taxCategoryId: "taxable",
        savedGstRateId: rate.id,
        taxInclusive: true,
      },
      deps,
    );
    createProduct(
      {
        type: "service",
        name: "Delivery",
        unit: "hrs",
        defaultPrice: "50",
        taxCategoryId: "non-gst",
        taxInclusive: false,
      },
      deps,
    );

    expect(rate).toMatchObject({ name: "GST 18", percentage: "18", businessId: "biz-1" });
    expect(created).toMatchObject({
      id: "item-2",
      defaultPrice: "100.5",
      taxInclusive: true,
      hsnSac: "482010",
    });
    expect(created.savedGstRate?.percentage).toBe("18");
    expect(created.taxCategory.id).toBe("taxable");
    expect(listProducts(deps).map((product) => product.name)).toEqual(["Delivery", "Notebook"]);

    const updated = updateProduct(
      created.id,
      {
        type: "goods",
        name: "Notebook A5",
        code: "NB-1",
        hsnSac: "482010",
        unit: "nos",
        defaultPrice: "90",
        taxCategoryId: "taxable",
        savedGstRateId: rate.id,
        taxInclusive: false,
        active: false,
      },
      { ...deps, now: () => "2026-10-31T03:00:00.000Z" },
    );
    expect(updated).toMatchObject({
      name: "Notebook A5",
      active: false,
      createdAt: created.createdAt,
      updatedAt: "2026-10-31T03:00:00.000Z",
    });
    expect(listProducts(deps).map((product) => product.name)).toEqual(["Delivery"]);
    expect(getProduct(created.id, deps)?.active).toBe(false);

    const retired = updateSavedGstRate(
      rate.id,
      { name: "GST 18", percentage: "18", active: false },
      deps,
    );
    expect(retired.active).toBe(false);
    expect(listSavedGstRates(deps)).toEqual([]);
    expect(getProduct(created.id, deps)?.savedGstRate?.active).toBe(false);
  });

  it("leaves the saved product unchanged when the price is rejected", () => {
    const db = database();
    saveBusiness(db);
    const deps = productDeps(db);
    const created = createProduct(
      {
        type: "goods",
        name: "Rice",
        unit: "kg",
        defaultPrice: "40",
        taxCategoryId: "nil-rated",
        taxInclusive: false,
      },
      deps,
    );
    expect(() =>
      updateProduct(
        created.id,
        {
          type: "goods",
          name: "Rice",
          unit: "kg",
          defaultPrice: "40.555",
          taxCategoryId: "nil-rated",
          taxInclusive: false,
        },
        deps,
      ),
    ).toThrow(ProductError);
    expect(getProduct(created.id, deps)?.defaultPrice).toBe("40");
  });
});
