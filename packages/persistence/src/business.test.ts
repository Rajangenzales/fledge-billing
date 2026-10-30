import { BusinessProfileError, gstinCheckCharacter } from "@fledge/domain";
import {
  getBusinessProfile,
  saveBusinessProfile,
  type BusinessProfileDeps,
} from "@fledge/application";
import { afterEach, describe, expect, it } from "vitest";
import { createBusinessRepository } from "./business.js";
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

function setup(): BusinessProfileDeps & { db: SchemaDatabase } {
  const db = openDatabase(":memory:");
  openDatabases.push(db);
  migrate(db, migrations);
  return {
    db,
    repository: createBusinessRepository(db),
    states: listStateUts(db),
    now: () => "2026-10-30T15:00:00.000Z",
    createId: () => "biz-1",
  };
}

describe("business profile repository", () => {
  it("saves and updates the local business without changing its id", () => {
    const deps = setup();
    expect(getBusinessProfile(deps)).toBeNull();

    const created = saveBusinessProfile(
      {
        legalName: "Fledge Traders",
        address: "12 Market Road, Kochi",
        stateId: "IN-KL",
        pinCode: "682001",
        gstRegistered: true,
        gstin: keralaGstin,
        paymentDetails: "UPI: fledge@upi",
        invoicePreferences: "Show HSN",
      },
      { ...deps, now: () => "2026-10-30T15:00:00.000Z" },
    );
    const updated = saveBusinessProfile(
      {
        legalName: "Fledge Traders LLP",
        displayName: "Fledge",
        address: "14 Market Road, Kochi",
        stateId: "IN-KL",
        gstRegistered: false,
        paymentDetails: null,
        invoicePreferences: "Show HSN",
      },
      { ...deps, now: () => "2026-10-30T16:00:00.000Z" },
    );

    expect(created.id).toBe("biz-1");
    expect(updated).toMatchObject({
      id: "biz-1",
      legalName: "Fledge Traders LLP",
      displayName: "Fledge",
      gstRegistered: false,
      gstin: null,
      paymentDetails: null,
      invoicePreferences: "Show HSN",
      createdAt: "2026-10-30T15:00:00.000Z",
      updatedAt: "2026-10-30T16:00:00.000Z",
    });
    expect(updated.stateUt).toMatchObject({ id: "IN-KL", gstStateCode: "32" });
    expect(getBusinessProfile(deps)).toEqual(updated);
  });

  it("rejects an invalid GSTIN without replacing the saved profile", () => {
    const deps = setup();
    saveBusinessProfile(
      {
        legalName: "Fledge Traders",
        address: "12 Market Road, Kochi",
        stateId: "IN-KL",
        gstRegistered: false,
      },
      deps,
    );

    expect(() =>
      saveBusinessProfile(
        {
          legalName: "Renamed",
          address: "12 Market Road, Kochi",
          stateId: "IN-KL",
          gstRegistered: true,
          gstin: "27AAACR5055K1Z7",
        },
        deps,
      ),
    ).toThrow(BusinessProfileError);
    expect(getBusinessProfile(deps)?.legalName).toBe("Fledge Traders");
  });

  it("rejects a state that is not in the master", () => {
    const deps = setup();
    expect(() =>
      deps.repository.save({
        id: "biz-x",
        legalName: "Fledge Traders",
        displayName: "Fledge Traders",
        address: "12 Market Road",
        stateId: "IN-NOPE",
        pinCode: null,
        gstRegistered: false,
        gstin: null,
        businessType: null,
        phone: null,
        email: null,
        logoReference: null,
        paymentDetails: null,
        invoicePreferences: null,
        createdAt: "2026-10-30T15:00:00.000Z",
        updatedAt: "2026-10-30T15:00:00.000Z",
      }),
    ).toThrow();
    expect(getBusinessProfile(deps)).toBeNull();
  });
});
