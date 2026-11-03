import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import DocumentDirectory, { defaultTemplateForBusiness, dueDateForCustomer, documentInput, formFromDocument, lineFromProduct } from "./DocumentDirectory.jsx";

const callbacks = {
  onNavigate: () => undefined,
  onSave: () => undefined,
  onFinalize: () => undefined,
  onCancel: () => undefined,
};

describe("customer credit period due dates", () => {
  it("suggests a due date using the customer's configured credit days", () => {
    expect(dueDateForCustomer("2026-11-01", { creditDays: 30 })).toBe("2026-12-01");
  });

  it("handles month and year boundaries", () => {
    expect(dueDateForCustomer("2026-12-20", { creditDays: 30 })).toBe("2027-01-19");
    expect(dueDateForCustomer("2024-02-20", { creditDays: 10 })).toBe("2024-03-01");
  });

  it("leaves the due date blank for immediate payment or legacy customers", () => {
    expect(dueDateForCustomer("2026-11-01", { creditDays: 0 })).toBe("");
    expect(dueDateForCustomer("2026-11-01", {})).toBe("");
  });
});

describe("business sector template defaults", () => {
  const templates = [
    { id: "generic", documentType: "tax_invoice", isDefault: true, active: true, customFields: [] },
    {
      id: "taxi",
      key: "sector:taxi-cab:tax_invoice",
      documentType: "tax_invoice",
      isDefault: false,
      active: true,
      customFields: [{ key: "driver-name", defaultValue: null }],
    },
  ];

  it("selects the matching sector template before the generic default", () => {
    expect(defaultTemplateForBusiness(
      { businessType: "Taxi / Cab Operator" },
      templates,
      "tax_invoice",
    )).toBe(templates[1]);
  });

  it("keeps the generic default for custom or unmatched business types", () => {
    expect(defaultTemplateForBusiness(
      { businessType: "Custom business" },
      templates,
      "tax_invoice",
    )).toBe(templates[0]);
  });
});

describe("browser document directory", () => {
  it("safely defaults missing document collections to empty lists", () => {
    const html = renderToStaticMarkup(React.createElement(DocumentDirectory, {
      business: null,
      ...callbacks,
    }));

    expect(html).toContain("Set up your business first");
    expect(html).toContain("<h1>Billing</h1>");
  });

  it("requires a business profile before showing document actions", () => {
    const html = renderToStaticMarkup(React.createElement(DocumentDirectory, {
      business: null,
      customers: [],
      products: [],
      templates: [],
      documents: [],
      ...callbacks,
    }));

    expect(html).toContain("Set up your business first");
    expect(html).not.toContain("New document");
  });

  it("lists saved documents and explains template selection", () => {
    const html = renderToStaticMarkup(React.createElement(DocumentDirectory, {
      business: { id: "business-1", gstRegistered: true, stateId: "IN-KL" },
      customers: [{ id: "customer-1", active: true, name: "Harbour Stores" }],
      products: [{ id: "product-1", active: true, name: "Notebook", defaultPrice: "100" }],
      templates: [],
      documents: [{
        id: "document-1",
        customerId: "customer-1",
        documentType: "tax_invoice",
        status: "finalized",
        documentNumber: "INV/2026-27/0001",
        documentDate: "2026-11-01",
        dueDate: "2026-11-30",
        lines: [{ description: "Notebook" }],
        grandTotal: "118",
      }],
      ...callbacks,
    }));

    expect(html).toContain("<h1>Billing</h1>");
    expect(html).toContain("INV/2026-27/0001");
    expect(html).toContain("Harbour Stores");
    expect(html).toContain("Due 2026-11-30");
    expect(html).toContain("Choose a saved template revision");
    expect(html).toContain("Fledge does not verify rates against HSN/SAC");
    expect(html).toContain("determine place of supply or reverse-charge applicability");
    expect(html).not.toContain("No documents yet");
  });
});


describe("product supply nature on billing documents", () => {
  it("copies the catalog goods or service type into a new invoice line", () => {
    expect(lineFromProduct({
      id: "service-1",
      type: "service",
      name: "Consulting",
      unit: "hrs",
      defaultPrice: "1000",
      defaultDiscount: "0",
      taxInclusive: false,
      taxCategoryId: "taxable",
      savedGstRate: { percentage: "18" },
    })).toMatchObject({ productId: "service-1", supplyNature: "service" });
  });

  it("restores supply nature when reopening a saved draft", () => {
    const form = formFromDocument({
      id: "draft-1",
      customerId: "customer-1",
      documentType: "tax_invoice",
      customFields: [],
      documentDate: "2026-11-03",
      dueDate: null,
      placeOfSupplyStateId: "IN-KL",
      gstEnabled: true,
      reverseCharge: false,
      promotionalOffers: [],
      charges: [],
      lines: [{
        productId: "service-1",
        description: "Consulting",
        quantity: "1",
        unit: "hrs",
        rate: "1000",
        discountType: "none",
        discountValue: "0",
        taxInclusive: false,
        gstRatePercent: "18",
        taxCategoryId: "taxable",
        supplyNature: "service",
      }],
    });

    expect(form.lines[0].supplyNature).toBe("service");
  });

  it("passes the retained supply nature into the application document command", () => {
    const input = documentInput({
      documentType: "tax_invoice",
      customFieldValues: {},
      documentDate: "2026-11-03",
      dueDate: "",
      placeOfSupplyStateId: "IN-KL",
      reverseCharge: false,
      charges: [],
      promotionalOffers: [],
      lines: [{
        productId: "service-1",
        description: "Consulting",
        quantity: "1",
        unit: "hrs",
        rate: "1000",
        discountType: "none",
        discountValue: "0",
        taxInclusive: false,
        gstRatePercent: "18",
        taxCategoryId: "taxable",
        supplyNature: "service",
      }],
    });

    expect(input.lines[0].supplyNature).toBe("service");
  });
});
