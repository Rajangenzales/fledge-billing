import { createCustomer, getBusinessProfile, listCustomers, saveBusinessProfile } from "@fledge/application/browser";
import { STATE_UTS } from "@fledge/domain";
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { createBrowserRepositories, openFledgeDatabase } from "./indexed-db.js";

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

    await expect(repositories.customerRepository.insert({
      id: "customer-1",
      businessId: "missing-business",
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
    })).rejects.toThrow(/business profile/);
    database.close();
  });
});
