import {
  createCustomer,
  createProduct,
  createSavedGstRate,
  getBusinessProfile,
  getProduct,
  listCustomers,
  listProducts,
  listSavedGstRates,
  saveBusinessProfile,
  updateProduct,
  updateSavedGstRate,
} from "@fledge/application/browser";
import { STATE_UTS } from "@fledge/domain";
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import {
  BrowserStorageError,
  createBrowserRepositories,
  openFledgeDatabase,
} from "./indexed-db.js";

describe("browser IndexedDB repositories", () => {
  it("persists the business profile and customer across database reopen", async () => {
    const factory = new IDBFactory();
    const firstDatabase = await openFledgeDatabase(factory);
    const firstRepositories = createBrowserRepositories(firstDatabase);
    const businessDeps = {
      repository: firstRepositories.businessRepository,
      states: STATE_UTS,
      now: () => "2026-11-01T00:00:00.000Z",
      createId: () => "business-1",
    };
    const customerDeps = {
      repository: firstRepositories.customerRepository,
      states: STATE_UTS,
      now: () => "2026-11-01T00:01:00.000Z",
      createId: () => "customer-1",
    };

    await saveBusinessProfile(
      {
        legalName: "Fledge Traders",
        displayName: "Fledge",
        address: "Market Road",
        stateId: "IN-KL",
        gstRegistered: false,
      },
      businessDeps,
    );
    await createCustomer(
      {
        name: "Harbour Stores",
        billingAddress: "Beach Road",
        stateId: "IN-KL",
        registrationType: "unregistered",
      },
      customerDeps,
    );
    firstDatabase.close();

    const reopenedDatabase = await openFledgeDatabase(factory);
    const reopenedRepositories = createBrowserRepositories(reopenedDatabase);
    const profile = await getBusinessProfile({
      repository: reopenedRepositories.businessRepository,
      states: STATE_UTS,
    });
    const customers = await listCustomers({
      repository: reopenedRepositories.customerRepository,
      states: STATE_UTS,
    });

    expect(profile).toMatchObject({ id: "business-1", displayName: "Fledge", stateId: "IN-KL" });
    expect(customers).toHaveLength(1);
    expect(customers[0]).toMatchObject({
      id: "customer-1",
      businessId: "business-1",
      name: "Harbour Stores",
      stateUt: { name: "Kerala" },
    });
    reopenedDatabase.close();
  });

  it("persists saved rates and products across database reopen", async () => {
    const factory = new IDBFactory();
    const database = await openFledgeDatabase(factory);
    const repositories = createBrowserRepositories(database);
    await repositories.businessRepository.save({ id: "business-1" });
    const deps = productDeps(repositories.productRepository);
    const rate = await createSavedGstRate({ name: "GST 18", percentage: "18" }, deps);
    const product = await createProduct({
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
    }, deps);
    database.close();

    const reopenedDatabase = await openFledgeDatabase(factory);
    const reopenedRepositories = createBrowserRepositories(reopenedDatabase);
    const reopenedDeps = productDeps(reopenedRepositories.productRepository);

    expect(await listSavedGstRates(reopenedDeps)).toMatchObject([
      { id: rate.id, businessId: "business-1", percentage: "18" },
    ]);
    expect(await listProducts(reopenedDeps)).toMatchObject([
      { id: product.id, name: "Notebook", savedGstRate: { id: rate.id } },
    ]);
    expect(await getProduct(product.id, reopenedDeps)).toMatchObject({
      code: "NB-1",
      taxCategory: { id: "taxable" },
    });
    reopenedDatabase.close();
  });

  it("supports updates and activation changes for products and saved rates", async () => {
    const database = await openFledgeDatabase(new IDBFactory());
    const repositories = createBrowserRepositories(database);
    await repositories.businessRepository.save({ id: "business-1" });
    const deps = productDeps(repositories.productRepository);
    const rate = await createSavedGstRate({ name: "GST 18", percentage: "18" }, deps);
    const product = await createProduct({
      type: "goods",
      name: "Notebook",
      unit: "nos",
      defaultPrice: "100",
      taxCategoryId: "taxable",
      savedGstRateId: rate.id,
      taxInclusive: false,
    }, deps);

    const retiredRate = await updateSavedGstRate(
      rate.id,
      { name: "GST 18", percentage: "18", active: false },
      deps,
    );
    const inactiveProduct = await updateProduct(
      product.id,
      {
        type: "goods",
        name: "Notebook updated",
        unit: "nos",
        defaultPrice: "95",
        taxCategoryId: "taxable",
        savedGstRateId: rate.id,
        taxInclusive: false,
        active: false,
      },
      deps,
    );

    expect(retiredRate.active).toBe(false);
    expect(inactiveProduct).toMatchObject({ name: "Notebook updated", active: false });
    await expect(repositories.productRepository.insertProduct({
      ...inactiveProduct,
      id: "new-inactive-rate-product",
      name: "New notebook",
      active: true,
    })).rejects.toThrow(/active saved GST rate/);
    expect(await listProducts(deps)).toEqual([]);
    expect(await listProducts(deps, { includeInactive: true })).toHaveLength(1);
    expect(await listSavedGstRates(deps)).toEqual([]);
    expect(await listSavedGstRates(deps, { includeInactive: true })).toHaveLength(1);
    database.close();
  });

  it("rejects duplicate product codes and saved rate names without partial writes", async () => {
    const database = await openFledgeDatabase(new IDBFactory());
    const repositories = createBrowserRepositories(database);
    await repositories.businessRepository.save({ id: "business-1" });
    const deps = productDeps(repositories.productRepository);
    const rate = await createSavedGstRate({ name: "GST 18", percentage: "18" }, deps);
    const product = await createProduct({
      type: "goods",
      name: "Notebook",
      code: "NB-1",
      unit: "nos",
      defaultPrice: "100",
      taxCategoryId: "taxable",
      savedGstRateId: rate.id,
      taxInclusive: false,
    }, deps);

    await expect(repositories.productRepository.insertProduct({
      ...product,
      id: "duplicate-product",
    })).rejects.toThrow(/code already exists/);
    await expect(repositories.productRepository.insertSavedGstRate({
      ...rate,
      id: "duplicate-rate",
    })).rejects.toThrow(/rate with this name already exists/);

    expect(await listProducts(deps, { includeInactive: true })).toHaveLength(1);
    expect(await listSavedGstRates(deps, { includeInactive: true })).toHaveLength(1);
    database.close();
  });

  it("rejects cross-business product and saved-rate writes", async () => {
    const database = await openFledgeDatabase(new IDBFactory());
    const repositories = createBrowserRepositories(database);
    await repositories.businessRepository.save({ id: "business-1" });
    const deps = productDeps(repositories.productRepository);

    await expect(repositories.productRepository.insertSavedGstRate({
      id: "foreign-rate",
      businessId: "another-business",
      name: "GST 5",
      percentage: "5",
      active: true,
      createdAt: "2026-11-01T00:00:00.000Z",
      updatedAt: "2026-11-01T00:00:00.000Z",
    })).rejects.toThrow(/business profile/);

    const transaction = database.transaction("savedGstRates", "readwrite");
    transaction.objectStore("savedGstRates").add({
      id: "foreign-rate",
      businessId: "another-business",
      name: "Foreign GST 5",
      percentage: "5",
      active: true,
      createdAt: "2026-11-01T00:00:00.000Z",
      updatedAt: "2026-11-01T00:00:00.000Z",
    });
    await transactionDone(transaction);
    await expect(repositories.productRepository.insertProduct({
      id: "foreign-rate-product",
      businessId: "business-1",
      type: "goods",
      name: "Invalid rate reference",
      code: null,
      description: null,
      hsnSac: null,
      unit: "nos",
      defaultPrice: "10",
      defaultDiscount: "0",
      taxCategoryId: "taxable",
      savedGstRateId: "foreign-rate",
      taxInclusive: false,
      active: true,
      createdAt: "2026-11-01T00:00:00.000Z",
      updatedAt: "2026-11-01T00:00:00.000Z",
    })).rejects.toThrow(/saved GST rate/);

    await expect(repositories.productRepository.insertProduct({
      id: "foreign-product",
      businessId: "another-business",
      type: "goods",
      name: "Foreign",
      code: null,
      description: null,
      hsnSac: null,
      unit: "nos",
      defaultPrice: "10",
      defaultDiscount: "0",
      taxCategoryId: "non-gst",
      savedGstRateId: null,
      taxInclusive: false,
      active: true,
      createdAt: "2026-11-01T00:00:00.000Z",
      updatedAt: "2026-11-01T00:00:00.000Z",
    })).rejects.toThrow(/business profile/);
    expect(await getProduct("foreign-product", deps)).toBeNull();
    database.close();
  });

  it("rejects customer writes without an active matching business", async () => {
    const database = await openFledgeDatabase(new IDBFactory());
    const repositories = createBrowserRepositories(database);

    await expect(repositories.customerRepository.insert(customerRecord({
      businessId: "missing-business",
    }))).rejects.toThrow(/business profile/);
    database.close();
  });

  it("rejects stale and cross-business customer updates", async () => {
    const database = await openFledgeDatabase(new IDBFactory());
    const repositories = createBrowserRepositories(database);
    await repositories.businessRepository.save({ id: "business-1" });
    await repositories.customerRepository.insert(customerRecord());

    await expect(repositories.customerRepository.update(customerRecord({
      id: "missing-customer",
    }))).rejects.toThrow(/customer was not found/);
    await expect(repositories.customerRepository.update(customerRecord({
      businessId: "another-business",
    }))).rejects.toThrow(/business profile/);

    expect(await repositories.customerRepository.list()).toHaveLength(1);
    database.close();
  });

  it("aborts a duplicate customer insert without changing stored data", async () => {
    const database = await openFledgeDatabase(new IDBFactory());
    const repositories = createBrowserRepositories(database);
    await repositories.businessRepository.save({ id: "business-1" });
    await repositories.customerRepository.insert(customerRecord());

    await expect(repositories.customerRepository.insert(customerRecord()))
      .rejects.toThrow();

    expect(await repositories.customerRepository.list()).toHaveLength(1);
    database.close();
  });

  it("surfaces quota failures as actionable browser storage errors", async () => {
    const repositories = createBrowserRepositories({
      transaction() {
        throw new DOMException("Storage quota exceeded", "QuotaExceededError");
      },
    });

    await expect(repositories.businessRepository.get()).rejects.toMatchObject({
      name: "BrowserStorageError",
      userMessage: "Storage quota exceeded",
    });
  });

  it("reports when IndexedDB is unavailable", async () => {
    await expect(openFledgeDatabase(null)).rejects.toBeInstanceOf(BrowserStorageError);
  });

  it("closes its connection on version change and preserves existing records", async () => {
    const factory = new IDBFactory();
    const database = await openFledgeDatabase(factory);
    const repositories = createBrowserRepositories(database);
    await repositories.businessRepository.save({ id: "business-1" });

    const upgrade = factory.open("fledge-billing", 3);
    upgrade.onupgradeneeded = () => {
      upgrade.result.createObjectStore("future", { keyPath: "id" });
    };
    const upgradedDatabase = await requestResult(upgrade);

    expect(() => database.transaction("business", "readonly")).toThrow();
    expect(await requestResult(upgradedDatabase.transaction("business", "readonly")
      .objectStore("business").get("business-1"))).toEqual({ id: "business-1" });
    upgradedDatabase.close();
  });

  it("upgrades version 1 customer data to version 2 product stores", async () => {
    const factory = new IDBFactory();
    const legacyRequest = factory.open("fledge-billing", 1);
    legacyRequest.onupgradeneeded = () => {
      const database = legacyRequest.result;
      database.createObjectStore("business", { keyPath: "id" });
      const customers = database.createObjectStore("customers", { keyPath: "id" });
      customers.createIndex("businessId", "businessId", { unique: false });
    };
    const legacyDatabase = await requestResult(legacyRequest);
    const transaction = legacyDatabase.transaction(["business", "customers"], "readwrite");
    transaction.objectStore("business").put({ id: "business-1" });
    transaction.objectStore("customers").put(customerRecord());
    await transactionDone(transaction);
    legacyDatabase.close();

    const upgradedDatabase = await openFledgeDatabase(factory);
    const repositories = createBrowserRepositories(upgradedDatabase);
    expect(await repositories.businessRepository.get()).toEqual({ id: "business-1" });
    expect(await repositories.customerRepository.list()).toHaveLength(1);
    expect(upgradedDatabase.objectStoreNames.contains("products")).toBe(true);
    expect(upgradedDatabase.objectStoreNames.contains("savedGstRates")).toBe(true);
    upgradedDatabase.close();
  });

  it("rejects a blocked database upgrade and closes the late connection", async () => {
    const factory = new IDBFactory();
    const existing = await requestResult(factory.open("fledge-billing", 1));
    let lateRequest;
    const blockingFactory = {
      open(name, version) {
        lateRequest = factory.open(name, version + 1);
        return lateRequest;
      },
    };
    const openPromise = openFledgeDatabase(blockingFactory);

    await expect(openPromise).rejects.toThrow(/Close other Fledge tabs/);
    existing.close();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(() => lateRequest.result.transaction("business", "readonly")).toThrow();
  });
});

function customerRecord(overrides = {}) {
  return {
    id: "customer-1",
    businessId: "business-1",
    name: "Harbour Stores",
    billingAddress: "Beach Road",
    shippingAddress: null,
    stateId: "IN-KL",
    pinCode: null,
    phone: null,
    email: null,
    registrationType: "unregistered",
    gstin: null,
    notes: null,
    active: true,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    ...overrides,
  };
}

function productDeps(repository) {
  let sequence = 0;
  return {
    repository,
    now: () => "2026-11-01T00:00:00.000Z",
    createId: () => `product-record-${++sequence}`,
  };
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onabort = () => reject(transaction.error);
    transaction.onerror = () => reject(transaction.error);
  });
}
