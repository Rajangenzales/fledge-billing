import { gstinCheckCharacter } from "@fledge/domain";
import {
  createCustomer,
  createDocument,
  finalizeDocument,
  getDocument,
  listTemplates,
  saveBusinessProfile,
  setDefaultTemplate,
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
});
