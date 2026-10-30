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
      now: () => "2026-10-30T15:00:00.000Z",
      createId: () => "biz-1",
    },
  );
}

describe("customers", () => {
  it("requires a business profile before a customer can be saved", () => {
    const db = database();
    expect(() =>
      createCustomer(
        {
          name: "Harbour Stores",
          billingAddress: "8 Beach Road, Kochi",
          stateId: "IN-KL",
          registrationType: "unregistered",
        },
        customerDeps(db),
      ),
    ).toThrow(CustomerError);
    expect(listCustomers(customerDeps(db))).toEqual([]);
  });

  it("creates, lists, and deactivates customers for the business", () => {
    const db = database();
    saveBusiness(db);
    const deps = customerDeps(db);

    const harbour = createCustomer(
      {
        name: "Harbour Stores",
        billingAddress: "8 Beach Road, Kochi",
        shippingAddress: "Warehouse 2, Kochi",
        stateId: "IN-KL",
        registrationType: "registered",
        gstin: keralaGstin,
        notes: "Pays weekly",
      },
      deps,
    );
    createCustomer(
      {
        name: "Alpha Traders",
        billingAddress: "1 Hill Road, Kochi",
        stateId: "IN-KL",
        registrationType: "unregistered",
      },
      deps,
    );

    expect(listCustomers(deps).map((customer) => customer.name)).toEqual([
      "Alpha Traders",
      "Harbour Stores",
    ]);
    expect(harbour).toMatchObject({
      id: "cust-1",
      businessId: "biz-1",
      gstin: keralaGstin,
      registrationType: "registered",
      active: true,
    });
    expect(harbour.stateUt.gstStateCode).toBe("32");

    const hidden = updateCustomer(
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
    expect(listCustomers(deps).map((customer) => customer.name)).toEqual(["Alpha Traders"]);
    expect(listCustomers(deps, { includeInactive: true })).toHaveLength(2);
    expect(getCustomer(harbour.id, deps)?.active).toBe(false);
  });

  it("leaves the saved customer unchanged when a GSTIN is rejected", () => {
    const db = database();
    saveBusiness(db);
    const deps = customerDeps(db);
    const created = createCustomer(
      {
        name: "Harbour Stores",
        billingAddress: "8 Beach Road, Kochi",
        stateId: "IN-KL",
        registrationType: "unregistered",
      },
      deps,
    );

    expect(() =>
      updateCustomer(
        created.id,
        {
          name: "Renamed",
          billingAddress: "8 Beach Road, Kochi",
          stateId: "IN-KL",
          registrationType: "registered",
          gstin: "27AAACR5055K1Z7",
        },
        deps,
      ),
    ).toThrow(CustomerError);
    expect(getCustomer(created.id, deps)?.name).toBe("Harbour Stores");
  });
});
