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

export type IssuedRender = {
  preview: false;
  fallback: boolean;
  templateId: string | null;
  version: number | null;
  documentId: string;
  documentNumber: string | null;
  documentType: DocumentType;
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

export type StoredDocumentRender = {
  id: string;
  documentType: DocumentType;
  documentNumber: string | null;
  documentDate: string;
  supplierLegalName: string;
  supplierGstin: string | null;
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  placeOfSupplyName: string;
  notes: string;
  reverseCharge: boolean;
  lines: readonly {
    description: string;
    quantity: string;
    unit: string;
    rate: string;
    lineAmount: string;
    hsnSac: string | null;
  }[];
  charges: readonly { description: string; amount: string }[];
  taxes: readonly { taxType: string; amount: string }[];
  customFields: readonly {
    key: string;
    sectionKey: string;
    label: string;
    value: string | null;
    visible: boolean;
    sortOrder: number;
  }[];
  subtotal: string;
  discountTotal: string;
  taxableTotal: string;
  taxTotal: string;
  grandTotal: string;
};

export function renderStoredDocument(input: {
  document: StoredDocumentRender;
  template: PreviewTemplate | null;
  fallback: boolean;
}): IssuedRender {
  const template = input.template;
  const showHsn = template?.fields.some((field) => field.key === "hsn_sac" && field.visible) === true;
  const itemsSection = template?.sections.find((section) => section.key === "items");
  const chargesSection = template?.sections.find((section) => section.key === "charges");
  const items =
    itemsSection?.visible === true
      ? input.document.lines.map((line) => ({
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
      ? input.document.charges.map((charge) => ({
          description: charge.description,
          amount: charge.amount,
        }))
      : [];
  const sections = [...(template?.sections ?? [])]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .filter((section) => section.visible || storedCustomFields(input.document, section.key).length > 0)
    .map((section) => ({
      key: section.key,
      label: section.label,
      fields: storedFields(section.key, section.visible, input.document, template),
    }))
    .filter((section) => section.fields.length > 0 || section.key === "items" || section.key === "charges");

  return {
    preview: false,
    fallback: input.fallback,
    templateId: input.fallback ? null : (template?.id ?? null),
    version: input.fallback ? null : (template?.version ?? null),
    documentId: input.document.id,
    documentNumber: input.document.documentNumber,
    documentType: input.document.documentType,
    sections,
    items,
    charges,
    totals: {
      subtotal: input.document.subtotal,
      discountTotal: input.document.discountTotal,
      taxableTotal: input.document.taxableTotal,
      taxTotal: input.document.taxTotal,
      grandTotal: input.document.grandTotal,
    },
  };
}

function storedFields(
  sectionKey: string,
  sectionVisible: boolean,
  document: StoredDocumentRender,
  template: PreviewTemplate | null,
): PreviewField[] {
  const builtIn = sectionVisible
    ? (template?.fields ?? [])
        .filter((field) => field.sectionKey === sectionKey && field.visible)
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .map((field) => ({
          key: field.key,
          label: field.label,
          value: storedBuiltInValue(field.key, document),
        }))
    : [];
  const custom = storedCustomFields(document, sectionKey).map((field) => ({
    key: field.key,
    label: field.label,
    value: field.value ?? "",
  }));
  return [...builtIn, ...custom];
}

function storedCustomFields(document: StoredDocumentRender, sectionKey: string): StoredDocumentRender["customFields"][number][] {
  return document.customFields
    .filter((field) => field.sectionKey === sectionKey && field.visible)
    .sort((left, right) => left.sortOrder - right.sortOrder);
}

function storedBuiltInValue(key: string, document: StoredDocumentRender): string {
  switch (key) {
    case "document_number":
      return document.documentNumber ?? "";
    case "document_date":
      return document.documentDate;
    case "supplier_legal_name":
      return document.supplierLegalName;
    case "supplier_gstin":
      return document.supplierGstin ?? "";
    case "customer_name":
      return document.customerName;
    case "customer_phone":
      return document.customerPhone ?? "";
    case "customer_email":
      return document.customerEmail ?? "";
    case "place_of_supply":
      return document.placeOfSupplyName;
    case "hsn_sac":
      return document.lines.map((line) => line.hsnSac).filter((value): value is string => value !== null && value.length > 0).join(", ");
    case "taxable_value":
      return document.taxableTotal;
    case "tax_components":
      return document.taxes.length === 0 ? "0" : document.taxes.map((tax) => `${tax.taxType} ${tax.amount}`).join(", ");
    case "reverse_charge":
      return document.reverseCharge ? "Yes" : "No";
    case "grand_total":
      return document.grandTotal;
    case "notes":
      return document.notes;
    default:
      return "";
  }
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
