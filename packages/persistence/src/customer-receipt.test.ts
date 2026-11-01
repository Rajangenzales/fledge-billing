import { createBusinessRepository } from "./business.js";
import { createCustomerRepository } from "./customer.js";
import { openDatabase, type SchemaDatabase } from "./connection.js";
import { migrate, readSchemaVersion } from "./migrate.js";
import { migrations } from "./migrations.js";
import { createCustomerReceiptRepository } from "./customer-receipt.js";
import { saveBusinessProfile, createCustomer, recordCustomerReceipt, getCustomerAdvance, printCustomerReceipt } from "@fledge/application";
import { listStateUts } from "./state-ut.js";
import { afterEach, describe, expect, it } from "vitest";

const dbs: SchemaDatabase[] = [];
afterEach(() => { for (const db of dbs.splice(0)) db.close(); });

async function setup(migrationCount = migrations.length) {
  const db = openDatabase(":memory:");
  dbs.push(db);
  migrate(db, migrations.slice(0, migrationCount));
  const states = listStateUts(db);
  await saveBusinessProfile({
    legalName: "Fledge Traders", address: "Market Road, Kochi", stateId: "IN-KL", gstRegistered: false,
  }, { repository: createBusinessRepository(db), states, now: () => "2026-10-31T08:00:00.000Z", createId: () => "biz-1" });
  const customer = await createCustomer({
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
  it("upgrades a version-8 database through the current additive migration chain", async () => {
    const db = openDatabase(":memory:");
    dbs.push(db);
    migrate(db, migrations.slice(0, 8));
    expect(readSchemaVersion(db)).toBe(8);
    expect(migrate(db, migrations)).toEqual({ fromVersion: 8, toVersion: 17, appliedVersions: [9, 10, 11, 12, 13, 14, 15, 16, 17] });
    expect(db.prepare("SELECT name FROM schema_migration WHERE version = 8").get()).toEqual({ name: "custom-field" });
    expect(db.prepare("SELECT name FROM schema_migration WHERE version = 9").get()).toEqual({ name: "customer-receipt" });
    expect(db.prepare("SELECT name FROM schema_migration WHERE version = 12").get()).toEqual({ name: "receipt-identity-snapshot" });
    expect(db.prepare("SELECT name FROM schema_migration WHERE version = 13").get()).toEqual({ name: "document-due-date" });
    expect(db.prepare("SELECT name FROM schema_migration WHERE version = 14").get()).toEqual({ name: "document-party-snapshot" });
  });

  it("returns zero advance before any receipt", async () => {
    const { customer, deps } = await setup();
    expect((await getCustomerAdvance(customer.id, deps)).unallocatedAmount).toBe("0");
  });

  it("records a customer receipt before any invoice exists and derives advance balance", async () => {
    const { customer, deps } = await setup();
    const receipt = await recordCustomerReceipt({
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
    expect(await getCustomerAdvance(customer.id, deps)).toEqual({
      customerId: "cust-1", currency: "INR", receiptCount: 1, unallocatedAmount: "1250.5",
    });
  });

  it("makes retries idempotent and rejects reuse of a key for different details", async () => {
    const { customer, deps } = await setup();
    const input = {
      customerId: customer.id, amount: "100", paymentDate: "2026-10-30",
      method: "cash" as const, idempotencyKey: "retry-1",
    };
    const first = await recordCustomerReceipt(input, deps);
    const retry = await recordCustomerReceipt(input, deps);
    expect(retry.id).toBe(first.id);
    expect((await getCustomerAdvance(customer.id, deps)).unallocatedAmount).toBe("100");
    await expect(recordCustomerReceipt({ ...input, amount: "101" }, deps)).rejects.toThrow();
  });

  it("keeps receipt identity unchanged when business and customer masters later change", async () => {
    const { db, customer, deps } = await setup();
    const input = {
      customerId: customer.id, amount: "450", paymentDate: "2026-10-30",
      method: "upi" as const, idempotencyKey: "snapshot-retry",
    };
    const first = await recordCustomerReceipt(input, deps);
    db.prepare("UPDATE business SET legal_name = ?, display_name = ? WHERE id = ?").run("Renamed Traders", "Renamed", "biz-1");
    db.prepare("UPDATE customer SET name = ? WHERE id = ?").run("New Customer Name", "cust-1");
    const retry = await recordCustomerReceipt(input, deps);
    expect(retry.identitySnapshot).toEqual(first.identitySnapshot);
    expect(retry.identitySnapshot?.business.legalName).toBe("Fledge Traders");
    expect(retry.identitySnapshot?.customer.name).toBe("Harbour Stores");
  });

  it("prints a payment acknowledgement from the saved identity snapshot and original payment date", async () => {
    const { customer, deps } = await setup();
    const receipt = await recordCustomerReceipt({
      customerId: customer.id, amount: "1250.50", paymentDate: "2026-10-30",
      method: "upi", reference: "UPI-REF-1", notes: "Advance for order", idempotencyKey: "print-001",
    }, deps);
    const printed = await printCustomerReceipt(receipt.id, deps);
    expect(printed).toContain("PAYMENT RECEIPT");
    expect(printed).toContain("Receipt reference (internal): " + receipt.id);
    expect(printed).toContain("Payment date: 2026-10-30");
    expect(printed).toContain("Amount received: INR 1,250.50");
    expect(printed).toContain("UPI-REF-1");
    expect(printed).toContain("not a tax invoice or statutory GST receipt voucher");
  });

  it("blocks formal printing of legacy receipts without receipt-time identity", async () => {
    const { db, customer, deps } = await setup(11);
    db.prepare(`
      INSERT INTO customer_receipt (
        id, business_id, customer_id, amount, currency, payment_date, method,
        reference, notes, idempotency_key, recorded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run("legacy-no-snapshot", "biz-1", customer.id, "50", "INR", "2026-10-30", "cash", null, null, "legacy-print-key", "2026-10-31T08:02:00.000Z");
    migrate(db, migrations);
    await expect(printCustomerReceipt("legacy-no-snapshot", deps)).rejects.toThrow(/no receipt-time identity snapshot/)
  });

  it("rejects invalid dates, zero amounts, and fractions of a paisa", async () => {
    const { customer, deps } = await setup();
    const base = { customerId: customer.id, method: "cash" as const, idempotencyKey: "invalid" };
    await expect(recordCustomerReceipt({ ...base, amount: "0", paymentDate: "2026-10-31" }, deps)).rejects.toThrow();
    await expect(recordCustomerReceipt({ ...base, amount: "1.001", paymentDate: "2026-10-31" }, deps)).rejects.toThrow();
    await expect(recordCustomerReceipt({ ...base, amount: "1", paymentDate: "2026-02-30" }, deps)).rejects.toThrow();
  });
});
