import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { TemplateError } from "@fledge/domain";
import { buildInvoicePdf } from "./pdf.js";
import type { IssuedRender } from "@fledge/domain";

const png = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  ),
);

describe("invoice PDF", () => {
  it("draws the stored total on A4 and continues onto another page", async () => {
    const bytes = await buildInvoicePdf(sampleRender(50));
    const text = extractPdfText(bytes);
    expect(text).toContain("Total: INR 1,180.00");
    expect(text).toContain("CGST INR 90.00, SGST INR 90.00");
    expect(text).toContain("Page 2 of");
    expect(pageCount(bytes)).toBeGreaterThan(1);
    expect(pageSize(bytes)).toEqual([595.28, 841.89]);
    const withLogo = await buildInvoicePdf(sampleRender(1), png);
    expect(extractPdfText(withLogo)).toContain("Total: INR 1,180.00");
    await expect(buildInvoicePdf(sampleRender(1), Uint8Array.from([0x3c, 0x73, 0x76, 0x67]))).rejects.toThrow(
      TemplateError,
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
      description: `Line ${index + 1} with a long description that must stay with its amount`,
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

function pdfStreams(bytes: Uint8Array): string[] {
  const raw = Buffer.from(bytes);
  const latin = raw.toString("latin1");
  const streams: string[] = [];
  let index = 0;
  while (index < latin.length) {
    const marker = latin.indexOf("stream", index);
    if (marker < 0) {
      break;
    }
    let dataStart = marker + "stream".length;
    if (latin[dataStart] === "\r") {
      dataStart += 1;
    }
    if (latin[dataStart] === "\n") {
      dataStart += 1;
    }
    const end = latin.indexOf("endstream", dataStart);
    if (end < 0) {
      break;
    }
    let slice = raw.subarray(dataStart, end);
    if (slice[slice.length - 1] === 0x0a) {
      slice = slice.subarray(0, slice.length - 1);
    }
    if (slice[slice.length - 1] === 0x0d) {
      slice = slice.subarray(0, slice.length - 1);
    }
    try {
      streams.push(inflateSync(slice).toString("latin1"));
    } catch {
      streams.push(Buffer.from(slice).toString("latin1"));
    }
    index = end + "endstream".length;
  }
  return streams;
}

function extractPdfText(bytes: Uint8Array): string {
  const parts: string[] = [];
  for (const content of pdfStreams(bytes)) {
    for (const match of content.matchAll(/\((?:\\[()\\]|[^\\)])*\)\s*Tj/g)) {
      parts.push(match[0].replace(/\)\s*Tj$/, "").slice(1).replace(/\\([()\\])/g, "$1"));
    }
    for (const match of content.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) {
      parts.push(Buffer.from(match[1] ?? "", "hex").toString("latin1"));
    }
  }
  return parts.join("\n");
}

function pageCount(bytes: Uint8Array): number {
  return pdfStreams(bytes).join("\n").match(/\/Type\s*\/Page(?!s)/g)?.length ?? 0;
}

function pageSize(bytes: Uint8Array): [number, number] {
  const match = pdfStreams(bytes).join("\n").match(/\/MediaBox\s*\[\s*0\s+0\s+([0-9.]+)\s+([0-9.]+)\s*\]/);
  return [Number(match?.[1]), Number(match?.[2])];
}
