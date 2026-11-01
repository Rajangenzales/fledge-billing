import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createCustomer,
  getCustomerPaymentActivity,
  recordCustomerReceipt,
  saveBusinessProfile,
} from "@fledge/application";
import { afterEach, describe, expect, it } from "vitest";
import { createBusinessRepository } from "./business.js";
import { createCustomerRepository } from "./customer.js";
import { createCustomerPaymentActivityRepository } from "./customer-payment-activity.js";
import { openDatabase, withReadSnapshot, type SchemaDatabase } from "./connection.js";
import { migrate } from "./migrate.js";
import { migrations } from "./migrations.js";
import { createCustomerReceiptRepository } from "./customer-receipt.js";
import { listStateUts } from "./state-ut.js";

const databases: SchemaDatabase[] = [];
const tempDirectories: string[] = [];

afterEach(() => {
  for (const db of databases.splice(0)) db.close();
  for (const directory of tempDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("customer payment activity snapshot", () => {
  it("reads customer events and summary totals through one committed snapshot", async () => {
    const db = openDatabase(":memory:");
    databases.push(db);
    migrate(db, migrations);
    const states = listStateUts(db);
    await saveBusinessProfile(
      {
        legalName: "Fledge Traders",
        address: "Market Road, Kochi",
        stateId: "IN-KL",
        gstRegistered: false,
      },
      {
        repository: createBusinessRepository(db),
        states,
        now: () => "2026-10-31T08:00:00.000Z",
        createId: () => "biz-1",
      },
    );
    const customer = await createCustomer(
      {
        name: "Harbour Stores",
        billingAddress: "Beach Road, Kochi",
        stateId: "IN-KL",
        registrationType: "unregistered",
      },
      {
        repository: createCustomerRepository(db),
        states,
        now: () => "2026-10-31T08:01:00.000Z",
        createId: () => "cust-1",
      },
    );
    await recordCustomerReceipt(
      {
        customerId: customer.id,
        amount: "1250.50",
        paymentDate: "2026-10-30",
        method: "upi",
        idempotencyKey: "activity-receipt",
      },
      {
        repository: createCustomerReceiptRepository(db),
        now: () => "2026-10-31T08:02:00.000Z",
        createId: () => "receipt-1",
      },
    );

    const activity = await getCustomerPaymentActivity(customer.id, {
      repository: createCustomerPaymentActivityRepository(db),
    });

    expect(activity.summary).toEqual({
      receiptCount: 1,
      totalReceived: "1250.50",
      totalAllocated: "0",
      totalRefunded: "0",
      totalReversedReceipts: "0",
      unallocatedAdvance: "1250.5",
    });
    expect(activity.entries.map((entry) => entry.type)).toEqual(["receipt"]);
    expect(() => db.exec("BEGIN")).not.toThrow();
    db.exec("ROLLBACK");
  });

  it("does not return an empty snapshot for a customer outside the business", async () => {
    const db = openDatabase(":memory:");
    databases.push(db);
    migrate(db, migrations);
    await expect(
      getCustomerPaymentActivity("missing", {
        repository: createCustomerPaymentActivityRepository(db),
      }),
    ).rejects.toThrow(/customer was not found/);
  });

  it("keeps all reads on the same SQLite snapshot while another connection commits", async () => {
    const directory = mkdtempSync(join(tmpdir(), "fledge-activity-snapshot-"));
    tempDirectories.push(directory);
    const first = openDatabase(join(directory, "billing.db"));
    const second = openDatabase(join(directory, "billing.db"));
    databases.push(first, second);
    first.exec("PRAGMA journal_mode = WAL");
    first.exec("CREATE TABLE snapshot_probe (value INTEGER NOT NULL)");
    first.prepare("INSERT INTO snapshot_probe (value) VALUES (1)").run();

    let markReadStarted: () => void = () => {};
    let releaseRead: () => void = () => {};
    const readStarted = new Promise<void>((resolve) => {
      markReadStarted = resolve;
    });
    const waitForWrite = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    const snapshot = withReadSnapshot(first, async () => {
      const before = first.prepare("SELECT value FROM snapshot_probe").get()?.value;
      markReadStarted();
      await waitForWrite;
      const after = first.prepare("SELECT value FROM snapshot_probe").get()?.value;
      return { before, after };
    });

    await readStarted;
    try {
      second.prepare("UPDATE snapshot_probe SET value = 2").run();
    } finally {
      releaseRead();
    }

    await expect(snapshot).resolves.toEqual({ before: 1, after: 1 });
    expect(second.prepare("SELECT value FROM snapshot_probe").get()).toEqual({ value: 2 });
  });
});
