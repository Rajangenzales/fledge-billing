import { gstinCheckCharacter } from "@fledge/domain";
import {
  createCustomer,
  createDocument,
  finalizeDocument,
  getDocument,
  getTemplate,
  listTemplates,
  previewTemplate,
  restoreTemplate,
  reviseTemplate,
  saveBusinessProfile,
  setDefaultTemplate,
  updateDocument,
} from "@fledge/application";
import { TemplateError } from "@fledge/domain";
import { afterEach, describe, expect, it } from "vitest";
import { createBusinessRepository } from "./business.js";
import { openDatabase, type SchemaDatabase } from "./connection.js";
import { createCustomerRepository } from "./customer.js";
import { createDocumentRepository } from "./document.js";
import { migrate } from "./migrate.js";
import { migrations } from "./migrations.js";
import { listStateUts } from "./state-ut.js";
import { createTemplateRepository } from "./template.js";

const keralaGstin = `32AABCU9603R1Z${gstinCheckCharacter("32AABCU9603R1Z")}`;
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

function deps(db: SchemaDatabase) {
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

function templateDeps(db: SchemaDatabase) {
  return {
    repository: createTemplateRepository(db),
    now: () => "2026-10-31T03:00:00.000Z",
  };
}

const line = {
  description: "Service",
  quantity: "1",
  unit: "nos",
  rate: "1000",
  discountType: "none" as const,
  taxInclusive: false,
  gstRatePercent: "18",
  taxCategoryId: "taxable" as const,
};

describe("invoice templates", () => {
  it("installs a default GST template without changing the invoice total", () => {
    const db = database();
    prepare(db);
    const templates = listTemplates(templateDeps(db));
    expect(templates.some((template) => template.key === "gst:tax_invoice" && template.isDefault)).toBe(true);
    expect(templates.some((template) => template.key === "bill-of-supply:bill_of_supply")).toBe(true);

    const documentDeps = deps(db);
    const draft = createDocument(
      {
        customerId: "cust-1",
        documentType: "tax_invoice",
        documentDate: "2026-10-31",
        placeOfSupplyStateId: "IN-KL",
        gstEnabled: true,
        reverseCharge: false,
        lines: [line],
      },
      documentDeps,
    );
    expect(draft.templateId).toBe("tpl:biz-1:gst:tax_invoice:1");
    expect(draft.grandTotal).toBe("1180");

    expect(() =>
      createDocument(
        {
          customerId: "cust-1",
          documentType: "tax_invoice",
          documentDate: "2026-10-31",
          placeOfSupplyStateId: "IN-KL",
          gstEnabled: true,
          reverseCharge: false,
          templateId: "tpl:biz-1:quotation:quotation:1",
          lines: [line],
        },
        documentDeps,
      ),
    ).toThrow(TemplateError);

    const issued = finalizeDocument(draft.id, documentDeps);
    const standard = templates.find((template) => template.key === "standard:tax_invoice");
    expect(standard).toBeDefined();
    setDefaultTemplate(standard!.id, templateDeps(db));
    const stored = getDocument(issued.id, documentDeps);
    expect(stored?.templateId).toBe("tpl:biz-1:gst:tax_invoice:1");
    expect(stored?.grandTotal).toBe("1180");
    expect(stored?.taxTotal).toBe("180");

    const next = createDocument(
      {
        customerId: "cust-1",
        documentType: "tax_invoice",
        documentDate: "2026-10-31",
        placeOfSupplyStateId: "IN-KL",
        gstEnabled: true,
        reverseCharge: false,
        lines: [line],
      },
      documentDeps,
    );
    expect(next.templateId).toBe(standard!.id);
    expect(getDocument(issued.id, documentDeps)?.templateId).toBe("tpl:biz-1:gst:tax_invoice:1");
  });

  it("saves a label change as a new version and leaves an issued document on the old one", () => {
    const db = database();
    prepare(db);
    const documentDeps = deps(db);
    const templates = templateDeps(db);
    const input = {
      customerId: "cust-1",
      documentType: "tax_invoice" as const,
      documentDate: "2026-10-31",
      placeOfSupplyStateId: "IN-KL",
      gstEnabled: true,
      reverseCharge: false,
      lines: [line],
    };
    const draft = createDocument(input, documentDeps);
    const issued = finalizeDocument(draft.id, documentDeps);
    expect(issued.templateId).toBe("tpl:biz-1:gst:tax_invoice:1");
    expect(issued.grandTotal).toBe("1180");

    const openDraft = createDocument(input, documentDeps);
    const revised = reviseTemplate(
      "tpl:biz-1:gst:tax_invoice:1",
      {
        sections: [{ key: "customer", label: "Buyer" }, { key: "payment", visible: false }],
        fields: [
          { key: "customer_name", label: "Client" },
          { key: "customer_phone", visible: false },
        ],
      },
      templates,
    );
    expect(revised.id).toBe("tpl:biz-1:gst:tax_invoice:2");
    expect(revised.version).toBe(2);
    expect(revised.isDefault).toBe(true);
    expect(revised.fields.find((field) => field.key === "customer_name")?.label).toBe("Client");
    expect(revised.fields.find((field) => field.key === "customer_phone")?.visible).toBe(false);
    expect(revised.sections.find((section) => section.key === "payment")?.visible).toBe(false);

    const original = getTemplate("tpl:biz-1:gst:tax_invoice:1", templates);
    expect(original?.fields.find((field) => field.key === "customer_name")?.label).toBe("Customer");
    expect(original?.fields.find((field) => field.key === "customer_phone")?.visible).toBe(true);
    expect(original?.isDefault).toBe(false);

    const stored = getDocument(issued.id, documentDeps);
    expect(stored?.templateId).toBe("tpl:biz-1:gst:tax_invoice:1");
    expect(stored?.grandTotal).toBe("1180");
    expect(stored?.taxTotal).toBe("180");

    const kept = updateDocument(openDraft.id, input, documentDeps);
    expect(kept.templateId).toBe("tpl:biz-1:gst:tax_invoice:1");

    const next = createDocument(input, documentDeps);
    expect(next.templateId).toBe("tpl:biz-1:gst:tax_invoice:2");
    expect(next.grandTotal).toBe("1180");

    expect(() =>
      reviseTemplate("tpl:biz-1:gst:tax_invoice:1", { fields: [{ key: "notes", label: "Remarks" }] }, templates),
    ).toThrow(/current version/);
    expect(() =>
      reviseTemplate(revised.id, { fields: [{ key: "supplier_gstin", visible: false }] }, templates),
    ).toThrow(TemplateError);
    expect(getTemplate(revised.id, templates)?.version).toBe(2);
    expect(listTemplates(templates).filter((template) => template.key === "gst:tax_invoice")).toHaveLength(2);
  });

  it("stores custom field values on the document and leaves them when the template changes", () => {
    const db = database();
    prepare(db);
    const documentDeps = deps(db);
    const templates = templateDeps(db);
    const revised = reviseTemplate(
      "tpl:biz-1:gst:tax_invoice:1",
      {
        sections: [{ key: "custom-details", visible: true }],
        customFields: [
          { label: "Batch No.", type: "short_text", required: true, helperText: "Printed on the carton" },
          { label: "Delivery date", type: "date" },
        ],
      },
      templates,
    );
    expect(revised.customFields.map((field) => field.key)).toEqual(["batch-no", "delivery-date"]);
    expect(getTemplate("tpl:biz-1:gst:tax_invoice:1", templates)?.customFields).toEqual([]);

    const input = {
      customerId: "cust-1",
      documentType: "tax_invoice" as const,
      documentDate: "2026-10-31",
      placeOfSupplyStateId: "IN-KL",
      gstEnabled: true,
      reverseCharge: false,
      lines: [line],
    };
    const draft = createDocument(input, documentDeps);
    expect(draft.templateId).toBe(revised.id);
    expect(draft.grandTotal).toBe("1180");
    expect(draft.customFields.find((field) => field.key === "batch-no")?.value).toBeNull();
    expect(() => finalizeDocument(draft.id, documentDeps)).toThrow(/Enter Batch No/);
    expect(getDocument(draft.id, documentDeps)?.documentNumber).toBeNull();

    const saved = updateDocument(
      draft.id,
      {
        ...input,
        customFields: [
          { key: "batch-no", value: "A-12" },
          { key: "delivery-date", value: "2026-11-02" },
        ],
      },
      documentDeps,
    );
    expect(saved.taxTotal).toBe("180");
    expect(saved.grandTotal).toBe("1180");
    const kept = updateDocument(draft.id, input, documentDeps);
    expect(kept.customFields.find((field) => field.key === "batch-no")?.value).toBe("A-12");
    const issued = finalizeDocument(draft.id, documentDeps);
    expect(issued.customFields).toMatchObject([
      { key: "batch-no", label: "Batch No.", value: "A-12", type: "short_text" },
      { key: "delivery-date", label: "Delivery date", value: "2026-11-02", type: "date" },
    ]);

    const renamed = reviseTemplate(
      revised.id,
      {
        sections: [{ key: "custom-details", visible: true }],
        customFields: [
          { key: "batch-no", label: "Lot", type: "short_text", required: true },
          { label: "Project Name", type: "short_text" },
        ],
      },
      templates,
    );
    expect(renamed.id).toBe("tpl:biz-1:gst:tax_invoice:3");
    expect(renamed.customFields.map((field) => field.label)).toEqual(["Lot", "Project Name"]);
    const stored = getDocument(issued.id, documentDeps);
    expect(stored?.templateId).toBe(revised.id);
    expect(stored?.grandTotal).toBe("1180");
    expect(stored?.taxTotal).toBe("180");
    expect(stored?.customFields.find((field) => field.key === "batch-no")).toMatchObject({
      label: "Batch No.",
      value: "A-12",
    });
    expect(getTemplate(revised.id, templates)?.customFields[0]?.label).toBe("Batch No.");
  });

  it("previews sample invoices without saving a document or a template edit", () => {
    const db = database();
    prepare(db);
    const templates = templateDeps(db);
    const previewDeps = { ...templates, states: listStateUts(db) };
    const gst = previewTemplate("tpl:biz-1:gst:tax_invoice:1", previewDeps);
    expect(gst.notice).toBe("Preview. This is not a saved invoice.");
    expect(gst.saved).toBe(true);
    expect(gst.totals).toMatchObject({ taxTotal: "180", grandTotal: "1180" });
    expect(gst.sections.flatMap((section) => section.fields).find((field) => field.key === "document_number")?.value).toBe(
      "Preview",
    );
    expect(gst.sections.flatMap((section) => section.fields).find((field) => field.key === "tax_components")?.value).toBe(
      "CGST 90, SGST 90",
    );
    expect(gst.sections.flatMap((section) => section.fields).find((field) => field.key === "notes")?.value).toContain(
      "not cut off",
    );

    const quotation = previewTemplate("tpl:biz-1:quotation:quotation:1", previewDeps);
    expect(quotation.totals.grandTotal).toBe("1180");
    expect(quotation.sections.flatMap((section) => section.fields).some((field) => field.key === "tax_components")).toBe(
      false,
    );
    expect(previewTemplate("tpl:biz-1:standard:non_gst_invoice:1", previewDeps).totals.grandTotal).toBe("27.27");
    expect(previewTemplate("tpl:biz-1:receipt:receipt:1", previewDeps).totals).toMatchObject({
      taxTotal: "0",
      grandTotal: "27.27",
    });
    expect(previewTemplate("tpl:biz-1:bill-of-supply:bill_of_supply:1", previewDeps).totals).toMatchObject({
      taxTotal: "0",
      grandTotal: "40",
    });

    const edited = previewTemplate("tpl:biz-1:gst:tax_invoice:1", previewDeps, {
      sections: [{ key: "customer", label: "Buyer" }],
      fields: [{ key: "customer_phone", visible: false }],
    });
    expect(edited.saved).toBe(false);
    expect(edited.sections.find((section) => section.key === "customer")?.label).toBe("Buyer");
    expect(edited.sections.flatMap((section) => section.fields).some((field) => field.key === "customer_phone")).toBe(
      false,
    );
    expect(edited.totals.grandTotal).toBe("1180");
    expect(getTemplate("tpl:biz-1:gst:tax_invoice:1", templates)?.sections.find((section) => section.key === "customer")?.label).toBe(
      "Customer",
    );
    expect(() =>
      previewTemplate("tpl:biz-1:gst:tax_invoice:1", previewDeps, { fields: [{ key: "supplier_gstin", visible: false }] }),
    ).toThrow(TemplateError);

    const documents = db.prepare("SELECT COUNT(*) AS count FROM document").get();
    const series = db.prepare("SELECT COUNT(*) AS count FROM number_series").get();
    expect(Number(documents?.count)).toBe(0);
    expect(Number(series?.count)).toBe(0);
    expect(listTemplates(templates).filter((template) => template.key === "gst:tax_invoice")).toHaveLength(1);

    const renamed = reviseTemplate(
      "tpl:biz-1:gst:tax_invoice:1",
      { sections: [{ key: "customer", label: "Buyer" }] },
      templates,
    );
    expect(previewTemplate("tpl:biz-1:gst:tax_invoice:1", previewDeps).sections.find((section) => section.key === "customer")?.label).toBe(
      "Customer",
    );
    expect(previewTemplate(renamed.id, previewDeps).sections.find((section) => section.key === "customer")?.label).toBe(
      "Buyer",
    );
    const restored = restoreTemplate(renamed.id, templates);
    expect(restored.version).toBe(3);
    expect(restored.sections.find((section) => section.key === "customer")?.label).toBe("Customer");
    expect(getTemplate(renamed.id, templates)?.sections.find((section) => section.key === "customer")?.label).toBe("Buyer");
    expect(previewTemplate(renamed.id, previewDeps).totals.grandTotal).toBe("1180");
  });
});
