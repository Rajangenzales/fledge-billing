import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import IssuedDocumentOutput from "./IssuedDocumentOutput.jsx";

describe("issued document output", () => {
  it("uses the saved render lines and exposes print, share and PDF download actions", () => {
    const html = renderToStaticMarkup(React.createElement(IssuedDocumentOutput, {
      render: {
        preview: false,
        fallback: false,
        templateId: "template-1",
        version: 1,
        documentId: "document-1",
        documentNumber: "INV/2026-27/0001",
        documentDate: "2026-10-31",
        documentType: "tax_invoice",
        sections: [{
          key: "header",
          label: "Invoice details",
          fields: [
            { key: "document_number", label: "Number", value: "INV/2026-27/0001" },
            { key: "document_date", label: "Date", value: "2026-10-31" },
            { key: "supplier_legal_name", label: "Supplier", value: "Fledge Traders" },
            { key: "customer_name", label: "Customer", value: "Harbour Stores" },
            { key: "tax_components", label: "Tax", value: "CGST 90, SGST 90" },
          ],
        }],
        itemColumnLabels: {
          description: "Service",
          quantity: "Hours",
          unit: "Session",
          rate: "Fee",
          amount: "Line total",
          hsnSac: "HSN/SAC",
        },
        promotionalOffers: [{
          description: "Quarterly distributor promotion",
          qualifyingQuantity: "10",
          freeQuantity: "1",
          unit: "cases",
          note: "Applicable to this order",
        }],
        items: [{
          description: "Consulting service",
          quantity: "1",
          unit: "nos",
          rate: "1000",
          amount: "1000",
          hsnSac: "998314",
        }],
        charges: [],
        totals: {
          subtotal: "1000",
          discountTotal: "0",
          taxableTotal: "1000",
          taxTotal: "180",
          grandTotal: "1180",
        },
      },
      busy: false,
      message: "",
      onDownload: () => undefined,
      onPrint: () => undefined,
      onShare: () => undefined,
    }));

    expect(html).toContain("Customer document preview");
    expect(html).toContain("Date: 2026-10-31");
    expect(html).toContain("Supplier: Fledge Traders");
    expect(html).toContain("Customer: Harbour Stores");
    expect(html).toContain("CGST INR 90.00, SGST INR 90.00");
    expect(html).toContain("Service | Hours | Session | Fee | Line total | HSN/SAC");
    expect(html).toContain("Service: Consulting service | Hours: 1 | Session: nos | Fee: INR 1,000.00 | Line total: INR 1,000.00 | HSN/SAC: 998314");
    expect(html).toContain("Promotional offer details");
    expect(html).toContain("Quarterly distributor promotion: Buy 10 cases, get 1 free");
    expect(html).toContain("Service: Consulting service | Hours: 1 | Session: nos | Fee: INR 1,000.00 | Line total: INR 1,000.00 | HSN/SAC: 998314");
    expect(html).toContain("Total: INR 1,180.00");
    expect(html).not.toContain("Generated");
    expect(html).toContain("Print</button>");
    expect(html).toContain("Share PDF</button>");
    expect(html).toContain("Download PDF</button>");
  });
});
