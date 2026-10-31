import { BillingError } from "@fledge/domain";
import {
  cancelDocument,
  createCustomer,
  createDocument,
  createProduct,
  finalizeDocument,
  getDocument,
  listDocuments,
  saveBusinessProfile,
  saveNumberSeries,
  updateDocument,
} from "@fledge/application";
import { afterEach, describe, expect, it } from "vitest";
import { createBusinessRepository } from "./business.js";
import { openDatabase, type SchemaDatabase } from "./connection.js";
import { createCustomerRepository } from "./customer.js";
import { createDocumentRepository } from "./document.js";
import { migrate } from "./migrate.js";
import { migrations } from "./migrations.js";
import { createProductRepository } from "./product.js";
import { listStateUts } from "./state-ut.js";

const openDatabases: SchemaDatabase[] = [];

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

function documentDeps(db: SchemaDatabase) {
  let sequence = 0;
  return {
    repository: createDocumentRepository(db),
    states: listStateUts(db),
    now: () => "2026-10-31T03:00:00.000Z",
    createId: () => {
      sequence += 1;
      return `doc-${sequence}`;
    },
  };
}

function prepare(db: SchemaDatabase): void {
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
      now: () => "2026-10-31T01:00:00.000Z",
      createId: () => "biz-1",
    },
  );
  createCustomer(
    {
      name: "Meera",
      billingAddress: "1 Beach Road, Kochi",
      stateId: "IN-KL",
      registrationType: "unregistered",
    },
    {
      repository: createCustomerRepository(db),
      states: listStateUts(db),
      now: () => "2026-10-31T02:00:00.000Z",
      createId: () => "cust-1",
    },
  );
}

const notebook = {
  description: "Notebook",
  quantity: "3",
  unit: "nos",
  rate: "10.10",
  discountType: "percent" as const,
  discountValue: "10",
  taxInclusive: false,
};

describe("billing documents", () => {
  it("requires a business and a customer before a draft can be saved", () => {
    const db = database();
    expect(() =>
      createDocument(
        {
          customerId: "missing",
          documentType: "non_gst_invoice",
          documentDate: "2026-10-31",
          gstEnabled: false,
          lines: [notebook],
        },
        documentDeps(db),
      ),
    ).toThrow(/business profile/);
  });

  it("saves a draft from source values and leaves the number unassigned", () => {
    const db = database();
    prepare(db);
    const deps = documentDeps(db);
    const draft = createDocument(
      {
        customerId: "cust-1",
        documentType: "non_gst_invoice",
        documentDate: "2026-10-31",
        gstEnabled: false,
        lines: [notebook],
      },
      deps,
    );

    expect(draft).toMatchObject({
      status: "draft",
      documentNumber: null,
      financialYear: "2026-27",
      subtotal: "30.3",
      discountTotal: "3.03",
      taxableTotal: "0",
      taxTotal: "0",
      grandTotal: "27.27",
    });
    expect(draft.lines[0]).toMatchObject({ lineAmount: "27.27", taxableValue: "27.27" });
    expect(deps.repository.getNumberSeries("non_gst_invoice", "2026-27")).toBeNull();
    expect(() => db.prepare("SELECT 1 FROM document_tax").all()).toThrow();
  });

  it("recalculates a draft and keeps the previous draft when a line is rejected", () => {
    const db = database();
    prepare(db);
    const deps = documentDeps(db);
    const draft = createDocument(
      {
        customerId: "cust-1",
        documentType: "bill_of_supply",
        documentDate: "2026-10-31",
        gstEnabled: false,
        lines: [{ ...notebook, discountType: "none", discountValue: null }],
      },
      deps,
    );
    const updated = updateDocument(
      draft.id,
      {
        customerId: "cust-1",
        documentType: "bill_of_supply",
        documentDate: "2026-10-31",
        gstEnabled: false,
        lines: [{ ...notebook, quantity: "1", discountType: "none", discountValue: null }],
      },
      deps,
    );
    expect(updated.grandTotal).toBe("10.1");

    expect(() =>
      updateDocument(
        draft.id,
        {
          customerId: "cust-1",
          documentType: "bill_of_supply",
          documentDate: "2026-10-31",
          gstEnabled: false,
          lines: [
            {
              ...notebook,
              discountType: "amount",
              discountValue: "1000",
            },
          ],
        },
        deps,
      ),
    ).toThrow(BillingError);
    expect(getDocument(draft.id, deps)?.grandTotal).toBe("10.1");
  });

  it("assigns the next number only when a draft is finalized", () => {
    const db = database();
    prepare(db);
    const deps = documentDeps(db);
    const first = createDocument(
      {
        customerId: "cust-1",
        documentType: "tax_invoice",
        documentDate: "2026-10-31",
        placeOfSupplyStateId: "IN-KL",
        gstEnabled: true,
        lines: [
          {
            description: "Included",
            quantity: "1",
            unit: "nos",
            rate: "100",
            discountType: "none",
            taxInclusive: true,
            gstRatePercent: "18",
          },
        ],
        charges: [{ description: "Freight", amount: "10", taxable: true }],
      },
      deps,
    );
    const waiting = createDocument(
      {
        customerId: "cust-1",
        documentType: "tax_invoice",
        documentDate: "2026-04-01",
        placeOfSupplyStateId: "IN-KL",
        gstEnabled: true,
        lines: [
          {
            description: "Second",
            quantity: "1",
            unit: "nos",
            rate: "5",
            discountType: "none",
            taxInclusive: false,
            gstRatePercent: "0",
          },
        ],
      },
      deps,
    );
    expect(first.documentNumber).toBeNull();
    expect(waiting.documentNumber).toBeNull();

    const issued = finalizeDocument(first.id, deps);
    expect(issued).toMatchObject({
      status: "finalized",
      documentNumber: "INV/2026-27/0001",
      taxableTotal: "94.75",
      taxTotal: "0",
      grandTotal: "110",
      finalizedAt: "2026-10-31T03:00:00.000Z",
    });
    expect(issued.lines[0]).toMatchObject({ lineAmount: "100", taxableValue: "84.75" });

    const cancelled = cancelDocument(issued.id, deps);
    expect(cancelled).toMatchObject({
      status: "cancelled",
      documentNumber: "INV/2026-27/0001",
    });
    expect(() => updateDocument(issued.id, {
      customerId: "cust-1",
      documentType: "tax_invoice",
      documentDate: "2026-10-31",
      placeOfSupplyStateId: "IN-KL",
      gstEnabled: true,
      lines: [
        {
          description: "Changed",
          quantity: "1",
          unit: "nos",
          rate: "1",
          discountType: "none",
          taxInclusive: false,
          gstRatePercent: "18",
        },
      ],
    }, deps)).toThrow(/cannot be changed/);
    expect(getDocument(issued.id, deps)?.grandTotal).toBe("110");

    const second = finalizeDocument(waiting.id, deps);
    expect(second.documentNumber).toBe("INV/2026-27/0002");

    const quotation = finalizeDocument(
      createDocument(
        {
          customerId: "cust-1",
          documentType: "quotation",
          documentDate: "2026-10-31",
          gstEnabled: false,
          lines: [{ ...notebook, discountType: "none", discountValue: null }],
        },
        deps,
      ).id,
      deps,
    );
    expect(quotation.documentNumber).toBe("QT/2026-27/0001");

    const priorYear = finalizeDocument(
      createDocument(
        {
          customerId: "cust-1",
          documentType: "tax_invoice",
          documentDate: "2026-03-31",
          placeOfSupplyStateId: "IN-KL",
          gstEnabled: true,
          lines: [
            {
              description: "March",
              quantity: "1",
              unit: "nos",
              rate: "2",
              discountType: "none",
              taxInclusive: false,
              gstRatePercent: "5",
            },
          ],
        },
        deps,
      ).id,
      deps,
    );
    expect(priorYear.documentNumber).toBe("INV/2025-26/0001");
    expect(listDocuments(deps).some((document) => document.id === issued.id)).toBe(true);
  });

  it("starts a series at a chosen number and refuses to move backward after issue", () => {
    const db = database();
    prepare(db);
    const deps = documentDeps(db);
    saveNumberSeries(
      {
        documentType: "tax_invoice",
        financialYear: "2026-27",
        prefix: "INV",
        nextNumber: 10,
        padding: 4,
      },
      deps,
    );
    const draft = createDocument(
      {
        customerId: "cust-1",
        documentType: "tax_invoice",
        documentDate: "2026-10-31",
        placeOfSupplyStateId: "IN-KL",
        gstEnabled: true,
        lines: [
          {
            description: "Service",
            hsnSac: "998311",
            productId: createProduct(
              {
                type: "service",
                name: "Support",
                unit: "hrs",
                defaultPrice: "100",
                taxCategoryId: "exempt",
                taxInclusive: false,
              },
              {
                repository: createProductRepository(db),
                now: () => "2026-10-31T02:30:00.000Z",
                createId: () => "item-1",
              },
            ).id,
            quantity: "1",
            unit: "hrs",
            rate: "100",
            discountType: "none",
            taxInclusive: false,
            gstRatePercent: "18",
          },
        ],
      },
      deps,
    );
    expect(finalizeDocument(draft.id, deps).documentNumber).toBe("INV/2026-27/0010");
    expect(getDocument(draft.id, deps)?.lines[0]?.productId).toBe("item-1");
    expect(() =>
      saveNumberSeries(
        {
          documentType: "tax_invoice",
          financialYear: "2026-27",
          prefix: "INV",
          nextNumber: 10,
          padding: 4,
        },
        deps,
      ),
    ).toThrow(/move forward/);
  });
});
