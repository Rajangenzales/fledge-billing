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
  const business = saveBusinessProfile({
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
  return { db, customer, deps, business };
}

describe("customer receipts", () => {
  it("adds migration 9 without changing existing migration history", () => {
    const { db } = setup();
    expect(readSchemaVersion(db)).toBe(9);
    expect(db.prepare("SELECT name FROM schema_migration WHERE version = 8").get()).toEqual({ name: "custom-field" });
  });

  it("records a customer receipt before any invoice exists and derives advance balance", () => {
    const { customer, deps } = setup();
    const receipt = recordCustomerReceipt({
      customerId: customer.id, amount: "1250.50", paymentDate: "2026-10-30",
      method: "upi", reference: "UPI-REF-1", idempotencyKey: "req-001",
    }, deps);
    expect(receipt).toMatchObject({ amount: "1250.5", customerId: "cust-1", currency: "INR" });
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

  it("rejects invalid dates, zero amounts, and fractions of a paisa", () => {
    const { customer, deps } = setup();
    const base = { customerId: customer.id, method: "cash" as const, idempotencyKey: "invalid" };
    expect(() => recordCustomerReceipt({ ...base, amount: "0", paymentDate: "2026-10-31" }, deps)).toThrow();
    expect(() => recordCustomerReceipt({ ...base, amount: "1.001", paymentDate: "2026-10-31" }, deps)).toThrow();
    expect(() => recordCustomerReceipt({ ...base, amount: "1", paymentDate: "2026-02-30" }, deps)).toThrow();
  });
});
