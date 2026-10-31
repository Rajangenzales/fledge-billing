/**
 * Invoice preview layout. Amounts are copied from a calculation result.
 * This module does not calculate money or tax.
 */

import type { DocumentType } from "./billing.js";
import type { CustomFieldDefinition } from "./custom-field.js";
import type { GstDocumentCalculation } from "./gst.js";
import type { TemplateDensity, TemplateFamily, TemplateFontFamily } from "./template.js";

export const PREVIEW_NOTICE = "Preview. This is not a saved invoice.";

export type PreviewField = {
  key: string;
  label: string;
  value: string;
};

export type PreviewSection = {
  key: string;
  label: string;
  fields: PreviewField[];
};

export type PreviewItem = {
  description: string;
  quantity: string;
  unit: string;
  rate: string;
  amount: string;
  hsnSac: string | null;
};

export type PreviewCharge = {
  description: string;
  amount: string;
};

export type TemplatePreview = {
  preview: true;
  notice: typeof PREVIEW_NOTICE;
  saved: boolean;
  templateId: string;
  version: number;
  documentType: DocumentType;
  family: TemplateFamily;
  brandColor: string;
  fontFamily: TemplateFontFamily;
  density: TemplateDensity;
  sections: PreviewSection[];
  items: PreviewItem[];
  charges: PreviewCharge[];
  totals: {
    subtotal: string;
    discountTotal: string;
    taxableTotal: string;
    taxTotal: string;
    grandTotal: string;
  };
};

export type PreviewTemplate = {
  id: string;
  version: number;
  documentType: DocumentType;
  family: TemplateFamily;
  brandColor: string;
  fontFamily: TemplateFontFamily;
  density: TemplateDensity;
  sections: readonly { key: string; label: string; sortOrder: number; visible: boolean }[];
  fields: readonly { key: string; sectionKey: string; label: string; sortOrder: number; visible: boolean }[];
  customFields: readonly CustomFieldDefinition[];
};

export function renderTemplatePreview(input: {
  template: PreviewTemplate;
  saved: boolean;
  supplier: { legalName: string; gstin: string | null };
  placeOfSupplyName: string;
  documentDate: string;
  customer: { name: string; phone: string; email: string };
  notes: string;
  calculation: GstDocumentCalculation;
  customValues: Readonly<Record<string, string>>;
}): TemplatePreview {
  const showHsn = input.template.fields.some((field) => field.key === "hsn_sac" && field.visible);
  const itemsSection = input.template.sections.find((section) => section.key === "items");
  const chargesSection = input.template.sections.find((section) => section.key === "charges");
  const items =
    itemsSection?.visible === true
      ? input.calculation.lines.map((line) => ({
          description: line.description,
          quantity: line.quantity,
          unit: line.unit,
          rate: line.rate,
          amount: line.lineAmount,
          hsnSac: showHsn ? line.hsnSac : null,
        }))
      : [];
  const charges =
    chargesSection?.visible === true
      ? input.calculation.charges.map((charge) => ({
          description: charge.description,
          amount: charge.amount,
        }))
      : [];
  const sections = [...input.template.sections]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .filter((section) => section.visible)
    .map((section) => ({
      key: section.key,
      label: section.label,
      fields: fieldsForSection(section.key, input),
    }))
    .filter((section) => section.fields.length > 0 || section.key === "items" || section.key === "charges");

  return {
    preview: true,
    notice: PREVIEW_NOTICE,
    saved: input.saved,
    templateId: input.template.id,
    version: input.template.version,
    documentType: input.template.documentType,
    family: input.template.family,
    brandColor: input.template.brandColor,
    fontFamily: input.template.fontFamily,
    density: input.template.density,
    sections,
    items,
    charges,
    totals: {
      subtotal: input.calculation.subtotal,
      discountTotal: input.calculation.discountTotal,
      taxableTotal: input.calculation.taxableTotal,
      taxTotal: input.calculation.taxTotal,
      grandTotal: input.calculation.grandTotal,
    },
  };
}

function fieldsForSection(
  sectionKey: string,
  input: {
    template: PreviewTemplate;
    supplier: { legalName: string; gstin: string | null };
    placeOfSupplyName: string;
    documentDate: string;
    customer: { name: string; phone: string; email: string };
    notes: string;
    calculation: GstDocumentCalculation;
    customValues: Readonly<Record<string, string>>;
  },
): PreviewField[] {
  const builtIn = input.template.fields
    .filter((field) => field.sectionKey === sectionKey && field.visible)
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((field) => ({
      key: field.key,
      label: field.label,
      value: builtInValue(field.key, input),
    }));
  const custom = input.template.customFields
    .filter((field) => field.sectionKey === sectionKey && field.visible)
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((field) => ({
      key: field.key,
      label: field.label,
      value: input.customValues[field.key] ?? "",
    }));
  return [...builtIn, ...custom];
}

function builtInValue(
  key: string,
  input: {
    supplier: { legalName: string; gstin: string | null };
    placeOfSupplyName: string;
    documentDate: string;
    customer: { name: string; phone: string; email: string };
    notes: string;
    calculation: GstDocumentCalculation;
  },
): string {
  switch (key) {
    case "document_number":
      return "Preview";
    case "document_date":
      return input.documentDate;
    case "supplier_legal_name":
      return input.supplier.legalName;
    case "supplier_gstin":
      return input.supplier.gstin ?? "";
    case "customer_name":
      return input.customer.name;
    case "customer_phone":
      return input.customer.phone;
    case "customer_email":
      return input.customer.email;
    case "place_of_supply":
      return input.placeOfSupplyName;
    case "hsn_sac":
      return input.calculation.lines.map((line) => line.hsnSac).filter((value): value is string => value !== null).join(", ");
    case "taxable_value":
      return input.calculation.taxableTotal;
    case "tax_components":
      return input.calculation.taxes.length === 0
        ? "0"
        : input.calculation.taxes.map((tax) => `${tax.taxType} ${tax.amount}`).join(", ");
    case "reverse_charge":
      return input.calculation.reverseCharge ? "Yes" : "No";
    case "grand_total":
      return input.calculation.grandTotal;
    case "notes":
      return input.notes;
    default:
      return "";
  }
}
