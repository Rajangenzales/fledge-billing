import {
  allocateReceiptToInvoice, createCustomer, createDocument, finalizeDocument, getCustomerAdvance,
  recordCustomerReceipt, recordCustomerRefund, releaseReceiptAllocation, reverseCustomerReceipt,
  reverseCustomerRefund, saveBusinessProfile,
} from "@fledge/application";
import { afterEach, describe, expect, it } from "vitest";
import { createPaymentAdjustmentRepository } from "./payment-adjustment.js";
import { createAllocationRepository } from "./allocation.js";
import { createBusinessRepository } from "./business.js";
import { createCustomerRepository } from "./customer.js";
import { createDocumentRepository } from "./document.js";
import { openDatabase, type SchemaDatabase } from "./connection.js";
import { migrate } from "./migrate.js";
import { migrations } from "./migrations.js";
import { createCustomerReceiptRepository } from "./customer-receipt.js";
import { listStateUts } from "./state-ut.js";

const databases: SchemaDatabase[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });

function setup() {
  const db = openDatabase(":memory:");
  databases.push(db);
  migrate(db, migrations);
  const states = listStateUts(db);
  saveBusinessProfile({ legalName: "Fledge Traders", address: "Market Road, Kochi", stateId: "IN-KL", gstRegistered: false },
    { repository: createBusinessRepository(db), states, now: () => "2026-10-31T08:00:00.000Z", createId: () => "biz-1" });
  const customer = createCustomer({ name: "Harbour Stores", billingAddress: "Beach Road, Kochi", stateId: "IN-KL", registrationType: "unregistered" },
    { repository: createCustomerRepository(db), states, now: () => "2026-10-31T08:01:00.000Z", createId: () => "cust-1" });
  const receiptDeps = { repository: createCustomerReceiptRepository(db), now: () => "2026-10-31T08:02:00.000Z", createId: () => "receipt-1" };
  const receipt = recordCustomerReceipt({ customerId: customer.id, amount: "150", paymentDate: "2026-10-30", method: "upi", idempotencyKey: "receipt-1" }, receiptDeps);
  const documentDeps = { repository: createDocumentRepository(db), states, now: () => "2026-10-31T08:03:00.000Z", createId: () => "invoice-1" };
  const draft = createDocument({ customerId: customer.id, documentType: "non_gst_invoice", documentDate: "2026-10-31", gstEnabled: false, reverseCharge: false,
    lines: [{ description: "Goods", quantity: "1", unit: "nos", rate: "100", discountType: "none", taxInclusive: false, taxCategoryId: "non-gst" }] }, documentDeps);
  const invoice = finalizeDocument(draft.id, documentDeps);
  let id = 0;
  const adjustmentDeps = { repository: createPaymentAdjustmentRepository(db), now: () => "2026-10-31T08:05:00.000Z", createId: () => `adjustment-${++id}` };
  let allocationId = 0;
  const allocationDeps = { repository: createAllocationRepository(db), now: () => "2026-10-31T08:04:00.000Z", createId: () => `allocation-${++allocationId}` };
  return { db, customer, receipt, invoice, receiptDeps, adjustmentDeps, allocationDeps };
}

describe("customer refunds and receipt reversals", () => {
  it("upgrades schema version 10 with migration 11 only", () => {
    const db = openDatabase(":memory:");
    databases.push(db);
    migrate(db, migrations.slice(0, 10));
    expect(migrate(db, migrations)).toMatchObject({ fromVersion: 10, toVersion: 11, appliedVersions: [11] });
    expect(db.prepare("SELECT name FROM schema_migration WHERE version = 11").get()).toEqual({ name: "payment-refund-reversal-events" });
  });

  it("records partial refunds and reduces the customer advance", () => {
    const { customer, receipt, receiptDeps, adjustmentDeps } = setup();
    const refund = recordCustomerRefund({ receiptId: receipt.id, amount: "50", paymentDate: "2026-10-31", method: "bank_transfer", reason: "Order cancelled", idempotencyKey: "refund-1" }, adjustmentDeps);
    expect(refund).toMatchObject({ eventType: "refund", amount: "50", receiptId: receipt.id, paymentDate: "2026-10-31" });
    const retry = recordCustomerRefund({ receiptId: receipt.id, amount: "50", paymentDate: "2026-10-31", method: "bank_transfer", reason: "Order cancelled", idempotencyKey: "refund-1" }, adjustmentDeps);
    expect(retry.id).toBe(refund.id);
    expect(getCustomerAdvance(customer.id, receiptDeps).unallocatedAmount).toBe("100");
    expect(() => recordCustomerRefund({ receiptId: receipt.id, amount: "101", paymentDate: "2026-10-31", method: "cash", reason: "Excess", idempotencyKey: "refund-too-much" }, adjustmentDeps)).toThrow(/remaining refundable/);
  });

  it("requires active allocations to be released before a refund", () => {
    const { customer, receipt, invoice, receiptDeps, adjustmentDeps, allocationDeps } = setup();
    const allocation = allocateReceiptToInvoice({ receiptId: receipt.id, invoiceId: invoice.id, amount: "60", idempotencyKey: "alloc-1" }, allocationDeps);
    expect(() => recordCustomerRefund({ receiptId: receipt.id, amount: "20", paymentDate: "2026-10-31", method: "cash", reason: "Return", idempotencyKey: "refund-blocked" }, adjustmentDeps)).toThrow(/Release.*allocations/);
    releaseReceiptAllocation({ allocationId: allocation.id, reason: "Customer requested refund", idempotencyKey: "release-1" }, allocationDeps);
    recordCustomerRefund({ receiptId: receipt.id, amount: "50", paymentDate: "2026-10-31", method: "cash", reason: "Return", idempotencyKey: "refund-after-release" }, adjustmentDeps);
    expect(getCustomerAdvance(customer.id, receiptDeps).unallocatedAmount).toBe("100");
  });

  it("reverses a refund entry without pretending money was returned, and supports receipt reversal", () => {
    const { customer, receipt, receiptDeps, adjustmentDeps } = setup();
    const refund = recordCustomerRefund({ receiptId: receipt.id, amount: "50", paymentDate: "2026-10-31", method: "upi", reason: "Duplicate refund entry", idempotencyKey: "refund-1" }, adjustmentDeps);
    expect(getCustomerAdvance(customer.id, receiptDeps).unallocatedAmount).toBe("100");
    const reversal = reverseCustomerRefund({ refundEventId: refund.id, reason: "Refund was entered in error", idempotencyKey: "refund-reversal-1" }, adjustmentDeps);
    expect(reversal).toMatchObject({ eventType: "reverse_refund", amount: "50", originalEventId: refund.id });
    expect(getCustomerAdvance(customer.id, receiptDeps).unallocatedAmount).toBe("150");
    expect(() => reverseCustomerRefund({ refundEventId: refund.id, reason: "Again", idempotencyKey: "refund-reversal-2" }, adjustmentDeps)).toThrow(/already been reversed/);
    const receiptReversal = reverseCustomerReceipt({ receiptId: receipt.id, reason: "Receipt was recorded in error", idempotencyKey: "receipt-reversal-1" }, adjustmentDeps);
    expect(receiptReversal).toMatchObject({ eventType: "reverse_receipt", amount: "150" });
    expect(getCustomerAdvance(customer.id, receiptDeps).unallocatedAmount).toBe("0");
  });

  it("limits later allocations to the unrefunded receipt balance", () => {
    const { receipt, invoice, adjustmentDeps, allocationDeps } = setup();
    recordCustomerRefund({ receiptId: receipt.id, amount: "50", paymentDate: "2026-10-31", method: "cash", reason: "Partial return", idempotencyKey: "refund-1" }, adjustmentDeps);
    allocateReceiptToInvoice({ receiptId: receipt.id, invoiceId: invoice.id, amount: "100", idempotencyKey: "alloc-after-refund" }, allocationDeps);
    expect(() => allocateReceiptToInvoice({ receiptId: receipt.id, invoiceId: invoice.id, amount: "1", idempotencyKey: "alloc-over-refund" }, allocationDeps)).toThrow(/available balance|outstanding amount/);
  });

  it("rejects receipt reversal while allocations or net refunds remain", () => {
    const { receipt, invoice, adjustmentDeps, allocationDeps } = setup();
    const allocation = allocateReceiptToInvoice({ receiptId: receipt.id, invoiceId: invoice.id, amount: "20", idempotencyKey: "alloc-1" }, allocationDeps);
    expect(() => reverseCustomerReceipt({ receiptId: receipt.id, reason: "Wrong receipt", idempotencyKey: "reverse-blocked-1" }, adjustmentDeps)).toThrow(/Release.*allocations/);
    releaseReceiptAllocation({ allocationId: allocation.id, reason: "Clear before reversal", idempotencyKey: "release-1" }, allocationDeps);
    recordCustomerRefund({ receiptId: receipt.id, amount: "10", paymentDate: "2026-10-31", method: "cash", reason: "Partial return", idempotencyKey: "refund-1" }, adjustmentDeps);
    expect(() => reverseCustomerReceipt({ receiptId: receipt.id, reason: "Wrong receipt", idempotencyKey: "reverse-blocked-2" }, adjustmentDeps)).toThrow(/refunds/);
  });
});
