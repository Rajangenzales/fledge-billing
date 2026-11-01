import { CustomerError, gstinCheckCharacter } from "@fledge/domain";
import {
  createCustomer,
  getCustomer,
  listCustomers,
  saveBusinessProfile,
  updateCustomer,
} from "@fledge/application";
import { afterEach, describe, expect, it } from "vitest";
import { createBusinessRepository } from "./business.js";
import { createCustomerRepository } from "./customer.js";
import { openDatabase, type SchemaDatabase } from "./connection.js";
import { migrate } from "./migrate.js";
import { migrations } from "./migrations.js";
import { listStateUts } from "./state-ut.js";

const openDatabases: SchemaDatabase[] = [];
const keralaGstin = `32AABCU9603R1Z${gstinCheckCharacter("32AABCU9603R1Z")}`;

afterEach(() => {
  for (const db of openDatabases.splice(0)) db.close();
});

function database(): SchemaDatabase {
  const db = openDatabase(":memory:");
  openDatabases.push(db);
  migrate(db, migrations);
  return db;
}

function customerDeps(db: SchemaDatabase) {
  const states = listStateUts(db);
  let sequence = 0;
  return {
    repository: createCustomerRepository(db),
    states,
    now: () => "2026-10-30T16:00:00.000Z",
    createId: () => {
      sequence += 1;
      return `cust-${sequence}`;
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
      now: () => "2026-10-30T15:00:00.000Z",
      createId: () => "biz-1",
    },
  );
}

describe("customers", () => {
  it("requires a business profile before a customer can be saved", async () => {
    const db = database();
    await expect(createCustomer(
      {
        name: "Harbour Stores",
        billingAddress: "8 Beach Road, Kochi",
        stateId: "IN-KL",
        registrationType: "unregistered",
      },
      customerDeps(db),
    )).rejects.toBeInstanceOf(CustomerError);
    await expect(listCustomers(customerDeps(db))).resolves.toEqual([]);
  });

  it("creates, lists, and deactivates customers for the business", async () => {
    const db = database();
    await saveBusiness(db);
    const deps = customerDeps(db);

    const harbour = await createCustomer(
      {
        name: "Harbour Stores",
        billingAddress: "8 Beach Road, Kochi",
        shippingAddress: "Warehouse 2, Kochi",
        stateId: "IN-KL",
        registrationType: "registered",
        gstin: keralaGstin,
        notes: "Pays weekly",
        creditDays: 30,
      },
      deps,
    );
    await createCustomer(
      {
        name: "Alpha Traders",
        billingAddress: "1 Hill Road, Kochi",
        stateId: "IN-KL",
        registrationType: "unregistered",
      },
      deps,
    );

    await expect(listCustomers(deps)).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Alpha Traders" }),
      expect.objectContaining({ name: "Harbour Stores" }),
    ]));
    expect(harbour).toMatchObject({
      id: "cust-1",
      businessId: "biz-1",
      gstin: keralaGstin,
      registrationType: "registered",
      active: true,
      creditDays: 30,
    });
    expect(harbour.stateUt.gstStateCode).toBe("32");

    const hidden = await updateCustomer(
      harbour.id,
      {
        name: "Harbour Stores",
        billingAddress: "8 Beach Road, Kochi",
        stateId: "IN-KL",
        registrationType: "unregistered",
        active: false,
      },
      { ...deps, now: () => "2026-10-30T17:00:00.000Z" },
    );
    expect(hidden.active).toBe(false);
    expect(hidden.gstin).toBeNull();
    expect(hidden.createdAt).toBe("2026-10-30T16:00:00.000Z");
    await expect(listCustomers(deps)).resolves.toEqual([
      expect.objectContaining({ name: "Alpha Traders" }),
    ]);
    await expect(listCustomers(deps, { includeInactive: true })).resolves.toHaveLength(2);
    await expect(getCustomer(harbour.id, deps)).resolves.toMatchObject({ active: false });
  });

  it("leaves the saved customer unchanged when a GSTIN is rejected", async () => {
    const db = database();
    await saveBusiness(db);
    const deps = customerDeps(db);
    const created = await createCustomer(
      {
        name: "Harbour Stores",
        billingAddress: "8 Beach Road, Kochi",
        stateId: "IN-KL",
        registrationType: "unregistered",
      },
      deps,
    );

    await expect(updateCustomer(
      created.id,
      {
        name: "Renamed",
        billingAddress: "8 Beach Road, Kochi",
        stateId: "IN-KL",
        registrationType: "registered",
        gstin: "27AAACR5055K1Z7",
      },
      deps,
    )).rejects.toBeInstanceOf(CustomerError);
    await expect(getCustomer(created.id, deps)).resolves.toMatchObject({ name: "Harbour Stores" });
  });

  it("waits for asynchronous customer repositories and propagates write failures", async () => {
    const db = database();
    await saveBusiness(db);
    const deps = customerDeps(db);
    const customer = await createCustomer({
      name: "Harbour Stores",
      billingAddress: "8 Beach Road, Kochi",
      stateId: "IN-KL",
      registrationType: "unregistered",
    }, deps);
    let listCompleted = false;
    const delayed = {
      ...deps,
      repository: {
        ...deps.repository,
        async list() {
          await Promise.resolve();
          listCompleted = true;
          return [customer];
        },
        async update() {
          await Promise.resolve();
          throw new Error("storage unavailable");
        },
      },
    };
    await expect(listCustomers(delayed)).resolves.toHaveLength(1);
    expect(listCompleted).toBe(true);
    await expect(updateCustomer(customer.id, {
      name: "Renamed",
      billingAddress: "8 Beach Road, Kochi",
      stateId: "IN-KL",
      registrationType: "unregistered",
    }, delayed)).rejects.toThrow("storage unavailable");
  });
});
