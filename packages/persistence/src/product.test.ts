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

async function saveBusiness(db: SchemaDatabase): Promise<void> {
  await saveBusinessProfile(
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
  it("requires a business profile before a product can be saved", async () => {
    const db = database();
    expect((await listTaxCategories(productDeps(db))).map((category) => category.id)).toEqual([
      "taxable",
      "exempt",
      "nil-rated",
      "non-gst",
    ]);
    await expect(
      createSavedGstRate({ name: "GST 18", percentage: "18" }, productDeps(db)),
    ).rejects.toThrow(ProductError);
  });

  it("saves a user GST rate and a taxable product without calculating tax", async () => {
    const db = database();
    await saveBusiness(db);
    const deps = productDeps(db);
    const rate = await createSavedGstRate({ name: "GST 18", percentage: "18.00" }, deps);
    const created = await createProduct(
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
    await createProduct(
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
    expect((await listProducts(deps)).map((product) => product.name)).toEqual(["Delivery", "Notebook"]);

    const updated = await updateProduct(
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
    expect((await listProducts(deps)).map((product) => product.name)).toEqual(["Delivery"]);
    expect((await getProduct(created.id, deps))?.active).toBe(false);

    const retired = await updateSavedGstRate(
      rate.id,
      { name: "GST 18", percentage: "18", active: false },
      deps,
    );
    expect(retired.active).toBe(false);
    expect(await listSavedGstRates(deps)).toEqual([]);
    expect((await getProduct(created.id, deps))?.savedGstRate?.active).toBe(false);
  });

  it("leaves the saved product unchanged when the price is rejected", async () => {
    const db = database();
    await saveBusiness(db);
    const deps = productDeps(db);
    const created = await createProduct(
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
    await expect(
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
    ).rejects.toThrow(ProductError);
    expect((await getProduct(created.id, deps))?.defaultPrice).toBe("40");
  });

  it("rejects a saved GST rate owned by a different business at the storage boundary", async () => {
    const db = database();
    await saveBusiness(db);
    const deps = productDeps(db);
    const rate = await createSavedGstRate({ name: "GST 5", percentage: "5" }, deps);
    const foreignRecord = {
      id: "foreign-product",
      businessId: "another-business",
      type: "goods" as const,
      name: "Foreign",
      code: null,
      description: null,
      hsnSac: null,
      unit: "nos",
      defaultPrice: "10",
      defaultDiscount: "0",
      taxCategoryId: "taxable" as const,
      savedGstRateId: rate.id,
      taxInclusive: false,
      active: true,
      createdAt: "2026-10-31T02:00:00.000Z",
      updatedAt: "2026-10-31T02:00:00.000Z",
    };
    await expect(deps.repository.insertProduct(foreignRecord)).rejects.toThrow(ProductError);
    expect(await deps.repository.getProduct("foreign-product")).toBeNull();
  });
});
