import { BillingError, gstinCheckCharacter } from "@fledge/domain";
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

const keralaGstin = `32AABCU9603R1Z${gstinCheckCharacter("32AABCU9603R1Z")}`;
const chandigarhGstin = `04AABCU9603R1Z${gstinCheckCharacter("04AABCU9603R1Z")}`;

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
      gstRegistered: true,
      gstin: keralaGstin,
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
  taxCategoryId: "non-gst" as const,
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
          gstEnabled: false, reverseCharge: false,
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
        gstEnabled: false, reverseCharge: false,
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
    expect(db.prepare("SELECT COUNT(*) AS count FROM document_tax").get()).toMatchObject({ count: 0 });
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
        gstEnabled: false, reverseCharge: false,
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
        gstEnabled: false, reverseCharge: false,
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
          gstEnabled: false, reverseCharge: false,
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
        gstEnabled: true, reverseCharge: false,
        lines: [
          {
            description: "Included",
            quantity: "1",
            unit: "nos",
            rate: "100",
            discountType: "none",
            taxInclusive: true,
            gstRatePercent: "18",
            taxCategoryId: "taxable",
          },
        ],
        charges: [
          {
            description: "Freight",
            amount: "10",
            taxable: true,
            taxCategoryId: "taxable",
            gstRatePercent: "18",
          },
        ],
      },
      deps,
    );
    const waiting = createDocument(
      {
        customerId: "cust-1",
        documentType: "tax_invoice",
        documentDate: "2026-04-01",
        placeOfSupplyStateId: "IN-KL",
        gstEnabled: true, reverseCharge: false,
        lines: [
          {
            description: "Second",
            quantity: "1",
            unit: "nos",
            rate: "5",
            discountType: "none",
            taxInclusive: false,
            gstRatePercent: "0",
            taxCategoryId: "taxable",
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
      taxTotal: "17.06",
      roundingResidual: "-0.01",
      grandTotal: "111.8",
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
      gstEnabled: true, reverseCharge: false,
      lines: [
        {
          description: "Changed",
          quantity: "1",
          unit: "nos",
          rate: "1",
          discountType: "none",
          taxInclusive: false,
          gstRatePercent: "18",
          taxCategoryId: "taxable",
        },
      ],
    }, deps)).toThrow(/cannot be changed/);
    expect(getDocument(issued.id, deps)?.grandTotal).toBe("111.8");
    expect(getDocument(issued.id, deps)?.taxes.map((tax) => tax.taxType)).toEqual([
      "CGST",
      "SGST",
      "CGST",
      "SGST",
    ]);

    const second = finalizeDocument(waiting.id, deps);
    expect(second.documentNumber).toBe("INV/2026-27/0002");

    const quotation = finalizeDocument(
      createDocument(
        {
          customerId: "cust-1",
          documentType: "quotation",
          documentDate: "2026-10-31",
          gstEnabled: false, reverseCharge: false,
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
          gstEnabled: true, reverseCharge: false,
          lines: [
            {
              description: "March",
              quantity: "1",
              unit: "nos",
              rate: "2",
              discountType: "none",
              taxInclusive: false,
              gstRatePercent: "5",
              taxCategoryId: "taxable",
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
        gstEnabled: true, reverseCharge: false,
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
            taxCategoryId: "taxable",
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

  it("stores IGST when the place of supply is in another state", () => {
    const db = database();
    prepare(db);
    const deps = documentDeps(db);
    const issued = finalizeDocument(
      createDocument(
        {
          customerId: "cust-1",
          documentType: "tax_invoice",
          documentDate: "2026-10-31",
          placeOfSupplyStateId: "IN-MH",
          gstEnabled: true,
          reverseCharge: false,
          lines: [
            {
              description: "Interstate",
              quantity: "1",
              unit: "nos",
              rate: "1000",
              discountType: "none",
              taxInclusive: false,
              gstRatePercent: "18",
              taxCategoryId: "taxable",
            },
          ],
        },
        deps,
      ).id,
      deps,
    );
    expect(issued.recipientStateId).toBe("IN-KL");
    expect(issued.taxes.map((tax) => [tax.taxType, tax.amount, tax.jurisdictionStateId])).toEqual([
      ["IGST", "180", "IN-MH"],
    ]);
    expect(issued.grandTotal).toBe("1180");
  });

  it("stores UTGST for an intra-Union Territory supply in Chandigarh", () => {
    const db = database();
    saveBusinessProfile(
      {
        legalName: "Chandigarh Supplies",
        address: "1 Sector 17",
        stateId: "IN-CH",
        gstRegistered: true,
        gstin: chandigarhGstin,
      },
      {
        repository: createBusinessRepository(db),
        states: listStateUts(db),
        now: () => "2026-10-31T01:00:00.000Z",
        createId: () => "biz-ch",
      },
    );
    createCustomer(
      {
        name: "Local buyer",
        billingAddress: "2 Sector 17",
        stateId: "IN-CH",
        registrationType: "unregistered",
      },
      {
        repository: createCustomerRepository(db),
        states: listStateUts(db),
        now: () => "2026-10-31T02:00:00.000Z",
        createId: () => "cust-ch",
      },
    );
    const issued = finalizeDocument(
      createDocument(
        {
          customerId: "cust-ch",
          documentType: "tax_invoice",
          documentDate: "2026-10-31",
          placeOfSupplyStateId: "IN-CH",
          gstEnabled: true,
          reverseCharge: true,
          lines: [
            {
              description: "Local",
              quantity: "1",
              unit: "nos",
              rate: "1000",
              discountType: "none",
              taxInclusive: false,
              gstRatePercent: "18",
              taxCategoryId: "taxable",
            },
          ],
        },
        documentDeps(db),
      ).id,
      documentDeps(db),
    );
    expect(issued.taxes.map((tax) => tax.taxType)).toEqual(["CGST", "UTGST"]);
    expect(issued.taxTotal).toBe("180");
    expect(issued.grandTotal).toBe("1000");
  });

  it("keeps a finalized tax snapshot when a later rule version becomes effective", () => {
    const db = database();
    prepare(db);
    const deps = documentDeps(db);
    const issued = finalizeDocument(
      createDocument(
        {
          customerId: "cust-1",
          documentType: "tax_invoice",
          documentDate: "2026-10-31",
          placeOfSupplyStateId: "IN-KL",
          gstEnabled: true,
          reverseCharge: false,
          lines: [
            {
              description: "Frozen",
              quantity: "1",
              unit: "nos",
              rate: "1000",
              discountType: "none",
              taxInclusive: false,
              gstRatePercent: "18",
              taxCategoryId: "taxable",
            },
          ],
        },
        deps,
      ).id,
      deps,
    );
    db.prepare(
      `UPDATE gst_rule_version
       SET status = 'superseded', effective_to = '2026-10-30'
       WHERE id = 'gst-structure-2017-07-01'`,
    ).run();
    db.prepare(
      `INSERT INTO gst_rule_version (
        id, version, effective_from, effective_to, source_reference, status, notes
      ) VALUES ('gst-structure-test', 'test', '2026-10-31', NULL, 'test source', 'active', 'test')`,
    ).run();
    db.prepare(
      `INSERT INTO gst_rule_utgst_territory (rule_version_id, gst_state_code)
       SELECT 'gst-structure-test', gst_state_code
       FROM gst_rule_utgst_territory
       WHERE rule_version_id = 'gst-structure-2017-07-01'`,
    ).run();

    const stored = getDocument(issued.id, deps);
    expect(stored?.ruleVersionId).toBe("gst-structure-2017-07-01");
    expect(stored?.grandTotal).toBe("1180");
    expect(stored?.taxTotal).toBe("180");

    const later = createDocument(
      {
        customerId: "cust-1",
        documentType: "tax_invoice",
        documentDate: "2026-10-31",
        placeOfSupplyStateId: "IN-KL",
        gstEnabled: true,
        reverseCharge: false,
        lines: [
          {
            description: "Later",
            quantity: "1",
            unit: "nos",
            rate: "1000",
            discountType: "none",
            taxInclusive: false,
            gstRatePercent: "18",
            taxCategoryId: "taxable",
          },
        ],
      },
      deps,
    );
    expect(later.ruleVersionId).toBe("gst-structure-test");
    expect(getDocument(issued.id, deps)?.ruleVersionId).toBe("gst-structure-2017-07-01");
  });
});

describe("GST migration", () => {
  it("leaves an already finalized M4 document untaxed", () => {
    const db = openDatabase(":memory:");
    openDatabases.push(db);
    migrate(db, migrations.slice(0, 5));
    saveBusinessProfile(
      {
        legalName: "Fledge Traders",
        address: "12 Market Road, Kochi",
        stateId: "IN-KL",
        gstRegistered: true,
        gstin: keralaGstin,
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
    db.prepare(
      `INSERT INTO document (
        id, business_id, customer_id, document_type, status, document_number, financial_year,
        document_date, place_of_supply_state_id, gst_enabled, gst_rule_version_id, template_id,
        subtotal, discount_total, taxable_total, tax_total, grand_total, created_at, finalized_at, updated_at
      ) VALUES (
        'old-doc', 'biz-1', 'cust-1', 'tax_invoice', 'finalized', 'INV/2026-27/0001', '2026-27',
        '2026-10-31', 'IN-KL', 1, NULL, NULL,
        '100', '0', '100', '0', '100', '2026-10-31T01:00:00.000Z', '2026-10-31T01:00:00.000Z', '2026-10-31T01:00:00.000Z'
      )`,
    ).run();
    migrate(db, migrations);
    const row = db
      .prepare(
        `SELECT grand_total, tax_total, supplier_state_id
         FROM document WHERE id = 'old-doc'`,
      )
      .get();
    expect(row).toMatchObject({
      grand_total: "100",
      tax_total: "0",
      supplier_state_id: "IN-KL",
    });
    const taxRows = db.prepare("SELECT id FROM document_tax WHERE document_id = 'old-doc'").all();
    expect(taxRows).toEqual([]);
  });
});
