import {
  allocateReceiptToInvoice,
  createCustomer,
  createDocument,
  finalizeDocument,
  getCustomerAllocatedTotal,
  getInvoiceSettlement,
  recordCustomerReceipt,
  releaseReceiptAllocation,
  saveBusinessProfile,
} from "@fledge/application";
import { afterEach, describe, expect, it } from "vitest";
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
  saveBusinessProfile({
    legalName: "Fledge Traders", address: "Market Road, Kochi", stateId: "IN-KL", gstRegistered: false,
  }, { repository: createBusinessRepository(db), states, now: () => "2026-10-31T08:00:00.000Z", createId: () => "biz-1" });
  const customer = createCustomer({
    name: "Harbour Stores", billingAddress: "Beach Road, Kochi", stateId: "IN-KL", registrationType: "unregistered",
  }, { repository: createCustomerRepository(db), states, now: () => "2026-10-31T08:01:00.000Z", createId: () => "cust-1" });
  const receiptDeps = {
    repository: createCustomerReceiptRepository(db),
    now: () => "2026-10-31T08:02:00.000Z",
    createId: () => "receipt-1",
  };
  const receipt = recordCustomerReceipt({
    customerId: customer.id, amount: "150", paymentDate: "2026-10-30",
    method: "upi", idempotencyKey: "receipt-request-1",
  }, receiptDeps);
  let documentSequence = 0;
  const documentDeps = {
    repository: createDocumentRepository(db), states,
    now: () => "2026-10-31T08:03:00.000Z",
    createId: () => `doc-${++documentSequence}`,
  };
  const draft = createDocument({
    customerId: customer.id, documentType: "non_gst_invoice", documentDate: "2026-10-31",
    gstEnabled: false, reverseCharge: false,
    lines: [{ description: "Services", quantity: "1", unit: "nos", rate: "100",
      discountType: "none", taxInclusive: false, taxCategoryId: "non-gst" }],
  }, documentDeps);
  const invoice = finalizeDocument(draft.id, documentDeps);
  const allocationDeps = {
    repository: createAllocationRepository(db),
    now: () => "2026-10-31T08:04:00.000Z",
    createId: (() => { let sequence = 0; return () => `allocation-${++sequence}`; })(),
  };
  return { db, customer, receipt, invoice, receiptDeps, documentDeps, allocationDeps };
}

describe("payment allocations", () => {
  it("allocates receipts to finalized invoices and derives outstanding and advance balances", () => {
    const { receipt, invoice, allocationDeps } = setup();
    const first = allocateReceiptToInvoice({
      receiptId: receipt.id, invoiceId: invoice.id, amount: "60", idempotencyKey: "alloc-1",
    }, allocationDeps);
    allocateReceiptToInvoice({
      receiptId: receipt.id, invoiceId: invoice.id, amount: "40", idempotencyKey: "alloc-2",
    }, allocationDeps);

    expect(first).toMatchObject({ eventType: "allocate", amount: "60", receiptId: receipt.id });
    expect(getInvoiceSettlement(invoice.id, allocationDeps)).toEqual({
      invoiceId: invoice.id, currency: "INR", invoiceTotal: "100",
      allocatedAmount: "100", outstandingAmount: "0", paymentStatus: "paid",
    });
    expect(getCustomerAllocatedTotal("cust-1", allocationDeps)).toBe("100");
  });

  it("releases an allocation as a compensating event without deleting history", () => {
    const { receipt, invoice, allocationDeps } = setup();
    const allocation = allocateReceiptToInvoice({
      receiptId: receipt.id, invoiceId: invoice.id, amount: "60", idempotencyKey: "alloc-release-1",
    }, allocationDeps);
    const release = releaseReceiptAllocation({
      allocationId: allocation.id, reason: "Allocated to the wrong invoice",
      idempotencyKey: "release-1",
    }, allocationDeps);

    expect(release).toMatchObject({ eventType: "release", allocationId: allocation.id, amount: "60" });
    expect(getInvoiceSettlement(invoice.id, allocationDeps)).toMatchObject({
      allocatedAmount: "0", outstandingAmount: "100", paymentStatus: "unpaid",
    });
    expect(getCustomerAllocatedTotal("cust-1", allocationDeps)).toBe("0");
    expect(allocationDeps.repository.listReceiptEvents(receipt.id)).toHaveLength(2);
  });

  it("rejects draft invoices and over-allocation", () => {
    const { receipt, customer, documentDeps, allocationDeps } = setup();
    const draft = createDocument({
      customerId: customer.id, documentType: "non_gst_invoice", documentDate: "2026-10-31",
      gstEnabled: false, reverseCharge: false,
      lines: [{ description: "Goods", quantity: "1", unit: "nos", rate: "100",
        discountType: "none", taxInclusive: false, taxCategoryId: "non-gst" }],
    }, documentDeps);
    expect(() => allocateReceiptToInvoice({
      receiptId: receipt.id, invoiceId: draft.id, amount: "10", idempotencyKey: "draft-alloc",
    }, allocationDeps)).toThrow(/finalized/);

    const invoice = finalizeDocument(draft.id, documentDeps);
    allocateReceiptToInvoice({
      receiptId: receipt.id, invoiceId: invoice.id, amount: "100", idempotencyKey: "full-alloc",
    }, allocationDeps);
    expect(() => allocateReceiptToInvoice({
      receiptId: receipt.id, invoiceId: invoice.id, amount: "1", idempotencyKey: "too-much",
    }, allocationDeps)).toThrow(/available balance|outstanding amount/);
  });
});
