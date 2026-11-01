import { createCustomer, getBusinessProfile, listCustomers, saveBusinessProfile } from "@fledge/application/browser";
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

    const upgrade = factory.open("fledge-billing", 2);
    upgrade.onupgradeneeded = () => {
      upgrade.result.createObjectStore("future", { keyPath: "id" });
    };
    const upgradedDatabase = await requestResult(upgrade);

    expect(() => database.transaction("business", "readonly")).toThrow();
    expect(await requestResult(upgradedDatabase.transaction("business", "readonly")
      .objectStore("business").get("business-1"))).toEqual({ id: "business-1" });
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

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
