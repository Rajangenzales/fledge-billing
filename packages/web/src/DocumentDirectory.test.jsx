import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import DocumentDirectory from "./DocumentDirectory.jsx";

const callbacks = {
  onNavigate: () => undefined,
  onSave: () => undefined,
  onFinalize: () => undefined,
  onCancel: () => undefined,
};

describe("browser document directory", () => {
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

    expect(html).toContain("Invoices &amp; documents");
    expect(html).toContain("INV/2026-27/0001");
    expect(html).toContain("Harbour Stores");
    expect(html).toContain("Due 2026-11-30");
    expect(html).toContain("Choose a saved template revision");
    expect(html).not.toContain("No documents yet");
  });
});
