import { describe, expect, it } from "vitest";
import { TemplateError } from "./template.js";
import { formatInr } from "./format-inr.js";
import { assertInvoiceLogo } from "./logo.js";
import { invoicePdfFilename, presentationLines, renderPrintSheet } from "./print.js";
import type { IssuedRender } from "./preview.js";

describe("INR display and print", () => {
  it("formats stored amounts without changing their scale", () => {
    expect(formatInr("1180")).toBe("INR 1,180.00");
    expect(formatInr("90")).toBe("INR 90.00");
    expect(formatInr("27.27")).toBe("INR 27.27");
    expect(formatInr("-0.01")).toBe("INR -0.01");
    expect(formatInr("12345678")).toBe("INR 1,23,45,678.00");
    expect(() => formatInr("1.2.3")).toThrow(TemplateError);
  });

  it("rejects a logo that is not a small PNG or JPEG", () => {
    expect(assertInvoiceLogo(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]))).toBe("png");
    expect(assertInvoiceLogo(Uint8Array.from([0xff, 0xd8, 0xff, 0x00]))).toBe("jpeg");
    expect(() => assertInvoiceLogo(Uint8Array.from([0x3c, 0x73, 0x76, 0x67]))).toThrow(/PNG or JPEG/);
    expect(() => assertInvoiceLogo(new Uint8Array(1_000_001))).toThrow(/1 MB/);
  });

  it("keeps the total with its label across print pages", () => {
    const render = sampleRender(45);
    const lines = presentationLines(render);
    expect(lines.at(-1)).toBe("Total: INR 1,180.00");
    const printed = renderPrintSheet(render);
    expect(printed).toContain("Total: INR 1,180.00");
    expect(printed).toContain("Page 2 of");
    expect(printed).not.toContain("1180");
    expect(invoicePdfFilename("tax_invoice", "INV/2026-27/0001", "2026-10-31")).toBe(
      "tax-invoice_INV-2026-27-0001_2026-10-31.pdf",
    );
  });
});

function sampleRender(itemCount: number): IssuedRender {
  return {
    preview: false,
    fallback: false,
    templateId: "tpl:1",
    version: 1,
    documentId: "doc-1",
    documentNumber: "INV/2026-27/0001",
    documentDate: "2026-10-31",
    documentType: "tax_invoice",
    sections: [
      {
        key: "header",
        label: "Header",
        fields: [
          { key: "document_number", label: "Number", value: "INV/2026-27/0001" },
          { key: "tax_components", label: "Tax", value: "CGST 90, SGST 90" },
          { key: "grand_total", label: "Total", value: "1180" },
        ],
      },
    ],
    items: Array.from({ length: itemCount }, (_, index) => ({
      description: `Line ${index + 1}`,
      quantity: "1",
      unit: "nos",
      rate: "1000",
      amount: "1000",
      hsnSac: "998314",
    })),
    charges: [],
    totals: {
      subtotal: "1000",
      discountTotal: "0",
      taxableTotal: "1000",
      taxTotal: "180",
      grandTotal: "1180",
    },
  };
}
