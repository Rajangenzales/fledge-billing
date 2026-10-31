import { createBusinessRepository } from "./business.js";
import { createCustomerRepository } from "./customer.js";
import { openDatabase, type SchemaDatabase } from "./connection.js";
import { migrate, readSchemaVersion } from "./migrate.js";
import { migrations } from "./migrations.js";
import { createCustomerReceiptRepository } from "./customer-receipt.js";
import { saveBusinessProfile, createCustomer, recordCustomerReceipt, getCustomerAdvance } from "@fledge/application";
import { listStateUts } from "./state-ut.js";
import { afterEach, describe, expect, it } from "vitest";

const dbs: SchemaDatabase[] = [];
afterEach(() => { for (const db of dbs.splice(0)) db.close(); });

function setup() {
  const db = openDatabase(":memory:");
  dbs.push(db);
  migrate(db, migrations);
  const states = listStateUts(db);
  saveBusinessProfile({
    legalName: "Fledge Traders", address: "Market Road, Kochi", stateId: "IN-KL", gstRegistered: false,
  }, { repository: createBusinessRepository(db), states, now: () => "2026-10-31T08:00:00.000Z", createId: () => "biz-1" });
  const customer = createCustomer({
    name: "Harbour Stores", billingAddress: "Beach Road, Kochi", stateId: "IN-KL", registrationType: "unregistered",
  }, { repository: createCustomerRepository(db), states, now: () => "2026-10-31T08:01:00.000Z", createId: () => "cust-1" });
  let ids = 0;
  const deps = {
    repository: createCustomerReceiptRepository(db),
    now: () => "2026-10-31T08:02:00.000Z",
    createId: () => `receipt-${++ids}`,
  };
  return { db, customer, deps };
}

describe("customer receipts", () => {
  it("upgrades a version-8 database through the current additive migration chain", () => {
    const db = openDatabase(":memory:");
    dbs.push(db);
    migrate(db, migrations.slice(0, 8));
    expect(readSchemaVersion(db)).toBe(8);
    expect(migrate(db, migrations)).toEqual({ fromVersion: 8, toVersion: 12, appliedVersions: [9, 10, 11, 12] });
    expect(db.prepare("SELECT name FROM schema_migration WHERE version = 8").get()).toEqual({ name: "custom-field" });
    expect(db.prepare("SELECT name FROM schema_migration WHERE version = 9").get()).toEqual({ name: "customer-receipt" });
    expect(db.prepare("SELECT name FROM schema_migration WHERE version = 12").get()).toEqual({ name: "receipt-identity-snapshot" });
  });

  it("returns zero advance before any receipt", () => {
    const { customer, deps } = setup();
    expect(getCustomerAdvance(customer.id, deps).unallocatedAmount).toBe("0");
  });

  it("records a customer receipt before any invoice exists and derives advance balance", () => {
    const { customer, deps } = setup();
    const receipt = recordCustomerReceipt({
      customerId: customer.id, amount: "1250.50", paymentDate: "2026-10-30",
      method: "upi", reference: "UPI-REF-1", idempotencyKey: "req-001",
    }, deps);
    expect(receipt).toMatchObject({
      amount: "1250.5", customerId: "cust-1", currency: "INR",
      identitySnapshot: {
        business: { legalName: "Fledge Traders", stateName: "Kerala", gstRegistered: false },
        customer: { name: "Harbour Stores", stateName: "Kerala", registrationType: "unregistered" },
      },
    });
    expect(getCustomerAdvance(customer.id, deps)).toEqual({
      customerId: "cust-1", currency: "INR", receiptCount: 1, unallocatedAmount: "1250.5",
    });
  });

  it("makes retries idempotent and rejects reuse of a key for different details", () => {
    const { customer, deps } = setup();
    const input = {
      customerId: customer.id, amount: "100", paymentDate: "2026-10-30",
      method: "cash" as const, idempotencyKey: "retry-1",
    };
    const first = recordCustomerReceipt(input, deps);
    const retry = recordCustomerReceipt(input, deps);
    expect(retry.id).toBe(first.id);
    expect(getCustomerAdvance(customer.id, deps).unallocatedAmount).toBe("100");
    expect(() => recordCustomerReceipt({ ...input, amount: "101" }, deps)).toThrow();
  });

  it("keeps receipt identity unchanged when business and customer masters later change", () => {
    const { db, customer, deps } = setup();
    const input = {
      customerId: customer.id, amount: "450", paymentDate: "2026-10-30",
      method: "upi" as const, idempotencyKey: "snapshot-retry",
    };
    const first = recordCustomerReceipt(input, deps);
    db.prepare("UPDATE business SET legal_name = ?, display_name = ? WHERE id = ?").run("Renamed Traders", "Renamed", "biz-1");
    db.prepare("UPDATE customer SET name = ? WHERE id = ?").run("New Customer Name", "cust-1");
    const retry = recordCustomerReceipt(input, deps);
    expect(retry.identitySnapshot).toEqual(first.identitySnapshot);
    expect(retry.identitySnapshot?.business.legalName).toBe("Fledge Traders");
    expect(retry.identitySnapshot?.customer.name).toBe("Harbour Stores");
  });

  it("rejects invalid dates, zero amounts, and fractions of a paisa", () => {
    const { customer, deps } = setup();
    const base = { customerId: customer.id, method: "cash" as const, idempotencyKey: "invalid" };
    expect(() => recordCustomerReceipt({ ...base, amount: "0", paymentDate: "2026-10-31" }, deps)).toThrow();
    expect(() => recordCustomerReceipt({ ...base, amount: "1.001", paymentDate: "2026-10-31" }, deps)).toThrow();
    expect(() => recordCustomerReceipt({ ...base, amount: "1", paymentDate: "2026-02-30" }, deps)).toThrow();
  });
});
