/**
 * Printable text for an issued invoice.
 * Amounts are display-formatted copies of the stored render. Nothing is calculated.
 */

import { formatInr } from "./format-inr.js";
import type { IssuedRender } from "./preview.js";

const DOCUMENT_TITLES: Record<IssuedRender["documentType"], string> = {
  tax_invoice: "Tax invoice",
  non_gst_invoice: "Invoice",
  bill_of_supply: "Bill of supply",
  quotation: "Quotation",
  receipt: "Receipt",
};

const MONEY_FIELDS = new Set(["taxable_value", "grand_total"]);

export function presentationLines(render: IssuedRender): string[] {
  const lines = [DOCUMENT_TITLES[render.documentType]];
  for (const section of render.sections) {
    lines.push(section.label);
    for (const field of section.fields) {
      lines.push(`${field.label}: ${displayField(field.key, field.value)}`);
    }
  }
  if (render.items.length > 0) {
    lines.push("Items");
    for (const item of render.items) {
      const hsn = item.hsnSac ? ` HSN ${item.hsnSac}` : "";
      lines.push(
        `${item.description} — ${item.quantity} ${item.unit}${hsn} — ${formatInr(item.rate)} — ${formatInr(item.amount)}`,
      );
    }
  }
  if (render.charges.length > 0) {
    lines.push("Charges");
    for (const charge of render.charges) {
      lines.push(`${charge.description} — ${formatInr(charge.amount)}`);
    }
  }
  lines.push(
    `Subtotal: ${formatInr(render.totals.subtotal)}`,
    `Discount: ${formatInr(render.totals.discountTotal)}`,
    `Taxable value: ${formatInr(render.totals.taxableTotal)}`,
    `Tax: ${formatInr(render.totals.taxTotal)}`,
    `Total: ${formatInr(render.totals.grandTotal)}`,
  );
  return lines;
}

export function renderPrintSheet(render: IssuedRender): string {
  const lines = presentationLines(render);
  const totals = lines.slice(-5);
  const body = lines.slice(0, -5);
  const capacity = 40;
  const pages: string[][] = [];
  for (let index = 0; index < body.length; index += capacity) {
    pages.push(body.slice(index, index + capacity));
  }
  if (pages.length === 0) {
    pages.push([]);
  }
  const last = pages[pages.length - 1];
  if (!last) {
    pages.push([]);
  }
  const tail = pages[pages.length - 1];
  if (!tail) {
    return "";
  }
  if (tail.length + totals.length > capacity) {
    pages.push([]);
  }
  pages[pages.length - 1]?.push(...totals);
  return pages
    .map((page, index) => [...page, "", `Page ${index + 1} of ${pages.length}`].join("\n"))
    .join("\n\f\n");
}

function displayField(key: string, value: string): string {
  if (MONEY_FIELDS.has(key)) {
    return formatInr(value);
  }
  if (key === "tax_components") {
    return formatTaxComponents(value);
  }
  return value;
}

function formatTaxComponents(value: string): string {
  if (value === "0") {
    return formatInr("0");
  }
  return value
    .split(", ")
    .map((part) => {
      const splitAt = part.lastIndexOf(" ");
      if (splitAt <= 0) {
        return part;
      }
      return `${part.slice(0, splitAt)} ${formatInr(part.slice(splitAt + 1))}`;
    })
    .join(", ");
}

export function invoicePdfFilename(
  documentType: string,
  documentNumber: string | null,
  documentDate: string,
): string {
  const type = documentType.replace(/_/g, "-");
  const number = (documentNumber ?? "unnumbered").replace(/[^A-Za-z0-9-]+/g, "-").replace(/-+/g, "-");
  const date = /^\d{4}-\d{2}-\d{2}$/.test(documentDate) ? documentDate : "undated";
  return `${type}_${number}_${date}.pdf`;
}
