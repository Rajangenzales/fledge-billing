/**
 * Invoice presentation. Templates choose labels, order and visibility.
 * They do not calculate money or tax.
 */

import { DOCUMENT_TYPES, type DocumentType } from "./billing.js";

export const TEMPLATE_FAMILIES = [
  "standard",
  "gst",
  "service",
  "retail",
  "quotation",
  "receipt",
  "bill-of-supply",
] as const;

export type TemplateFamily = (typeof TEMPLATE_FAMILIES)[number];

export const TEMPLATE_SECTION_KEYS = [
  "header",
  "business",
  "customer",
  "custom-details",
  "items",
  "charges",
  "tax-summary",
  "payment",
  "notes-terms",
  "footer",
] as const;

export type TemplateSectionKey = (typeof TEMPLATE_SECTION_KEYS)[number];

export const TEMPLATE_FIELD_KEYS = [
  "document_number",
  "document_date",
  "supplier_legal_name",
  "supplier_gstin",
  "customer_name",
  "customer_phone",
  "customer_email",
  "place_of_supply",
  "hsn_sac",
  "taxable_value",
  "tax_components",
  "reverse_charge",
  "grand_total",
  "notes",
] as const;

export type TemplateFieldKey = (typeof TEMPLATE_FIELD_KEYS)[number];
export type TemplateFontFamily = "source-sans" | "system";
export type TemplateDensity = "comfortable" | "compact";

export class TemplateError extends Error {
  readonly userMessage: string;

  constructor(userMessage: string) {
    super(userMessage);
    this.name = "TemplateError";
    this.userMessage = userMessage;
  }
}

export type TemplateSectionDefinition = {
  key: TemplateSectionKey;
  label: string;
  sortOrder: number;
  visible: boolean;
  protected: boolean;
};

export type TemplateFieldDefinition = {
  key: TemplateFieldKey;
  sectionKey: TemplateSectionKey;
  label: string;
  sortOrder: number;
  visible: boolean;
  required: boolean;
  protected: boolean;
};

export type BuiltInTemplate = {
  key: string;
  family: TemplateFamily;
  name: string;
  purpose: string;
  documentType: DocumentType;
  isDefault: boolean;
  brandColor: string;
  fontFamily: TemplateFontFamily;
  density: TemplateDensity;
  sections: readonly TemplateSectionDefinition[];
  fields: readonly TemplateFieldDefinition[];
};

const FAMILY_DOCUMENT_TYPES: Record<TemplateFamily, readonly DocumentType[]> = {
  standard: ["tax_invoice", "non_gst_invoice"],
  gst: ["tax_invoice"],
  service: ["tax_invoice", "quotation"],
  retail: ["tax_invoice", "non_gst_invoice", "receipt"],
  quotation: ["quotation"],
  receipt: ["receipt"],
  "bill-of-supply": ["bill_of_supply"],
};

const FAMILY_NAME: Record<TemplateFamily, string> = {
  standard: "Standard",
  gst: "GST",
  service: "Service",
  retail: "Retail",
  quotation: "Quotation",
  receipt: "Receipt",
  "bill-of-supply": "Bill of Supply",
};

const FAMILY_PURPOSE: Record<TemplateFamily, string> = {
  standard: "A general invoice layout for taxable and non-GST bills.",
  gst: "A tax invoice layout with the GST breakup visible.",
  service: "A service invoice or quotation with room for a description of the work.",
  retail: "A short counter layout for goods, including a non-GST bill or receipt.",
  quotation: "A quotation. It is not a tax invoice.",
  receipt: "A receipt for money received. It is not a tax invoice.",
  "bill-of-supply": "A bill of supply for exempt supplies. It does not show a tax invoice breakup.",
};

const DEFAULT_FOR: Partial<Record<DocumentType, TemplateFamily>> = {
  tax_invoice: "gst",
  non_gst_invoice: "standard",
  quotation: "quotation",
  receipt: "receipt",
  bill_of_supply: "bill-of-supply",
};

const SECTION_LABELS: Record<TemplateSectionKey, string> = {
  header: "Header",
  business: "Business",
  customer: "Customer",
  "custom-details": "Custom details",
  items: "Items",
  charges: "Charges",
  "tax-summary": "Tax summary",
  payment: "Payment",
  "notes-terms": "Notes and terms",
  footer: "Footer",
};

const FIELD_LABELS: Record<TemplateFieldKey, string> = {
  document_number: "Number",
  document_date: "Date",
  supplier_legal_name: "Supplier",
  supplier_gstin: "GSTIN",
  customer_name: "Customer",
  customer_phone: "Phone",
  customer_email: "Email",
  place_of_supply: "Place of supply",
  hsn_sac: "HSN/SAC",
  taxable_value: "Taxable value",
  tax_components: "Tax",
  reverse_charge: "Reverse charge",
  grand_total: "Total",
  notes: "Notes",
};

const FIELD_SECTION: Record<TemplateFieldKey, TemplateSectionKey> = {
  document_number: "header",
  document_date: "header",
  supplier_legal_name: "business",
  supplier_gstin: "business",
  customer_name: "customer",
  customer_phone: "customer",
  customer_email: "customer",
  place_of_supply: "header",
  hsn_sac: "items",
  taxable_value: "tax-summary",
  tax_components: "tax-summary",
  reverse_charge: "tax-summary",
  grand_total: "tax-summary",
  notes: "notes-terms",
};

export const BUILT_IN_TEMPLATES: readonly BuiltInTemplate[] = TEMPLATE_FAMILIES.flatMap((family) =>
  FAMILY_DOCUMENT_TYPES[family].map((documentType) => buildBuiltIn(family, documentType)),
);

export function assertTemplateLabel(label: string): string {
  if (typeof label !== "string") {
    throw new TemplateError("Enter a template label without code or markup.");
  }
  const value = label.trim();
  if (value.length === 0 || value.length > 40 || /[<>{}`\\]/.test(value) || /[\u0000-\u001F]/.test(value)) {
    throw new TemplateError("Enter a template label without code or markup.");
  }
  return value;
}

export function assertTemplateConfiguration(template: BuiltInTemplate): void {
  if (!TEMPLATE_FAMILIES.includes(template.family)) {
    throw new TemplateError("Choose a template.");
  }
  if (!DOCUMENT_TYPES.includes(template.documentType)) {
    throw new TemplateError("Choose a template for this document.");
  }
  if (!/^#[0-9A-Fa-f]{6}$/.test(template.brandColor)) {
    throw new TemplateError("Choose a brand colour as a 6-digit hex value.");
  }
  if (template.fontFamily !== "source-sans" && template.fontFamily !== "system") {
    throw new TemplateError("Choose a supported typeface.");
  }
  if (template.density !== "comfortable" && template.density !== "compact") {
    throw new TemplateError("Choose a supported spacing.");
  }
  const sectionKeys = new Set<string>();
  for (const section of template.sections) {
    assertTemplateLabel(section.label);
    if (sectionKeys.has(section.key)) {
      throw new TemplateError("Choose a template.");
    }
    sectionKeys.add(section.key);
    if (section.protected && !section.visible) {
      throw new TemplateError("This part of the invoice has to stay visible.");
    }
  }
  for (const required of TEMPLATE_SECTION_KEYS) {
    if (!sectionKeys.has(required)) {
      throw new TemplateError("Choose a template.");
    }
  }
  const fieldKeys = new Set<string>();
  for (const field of template.fields) {
    assertTemplateLabel(field.label);
    if (fieldKeys.has(field.key)) {
      throw new TemplateError("Choose a template.");
    }
    fieldKeys.add(field.key);
    if (!sectionKeys.has(field.sectionKey)) {
      throw new TemplateError("Choose a template.");
    }
    if (field.protected && !field.visible) {
      throw new TemplateError("This part of the invoice has to stay visible.");
    }
    if (field.required && !field.visible) {
      throw new TemplateError("This part of the invoice has to stay visible.");
    }
  }
}

export function templateMatchesDocument(template: { documentType: DocumentType }, documentType: DocumentType): boolean {
  return template.documentType === documentType;
}

const EDITABLE_FIELD_KEYS = new Set<TemplateFieldKey>(["customer_name", "customer_phone", "customer_email", "notes"]);

const EDITABLE_SECTION_KEYS = new Set<TemplateSectionKey>([
  "header",
  "business",
  "customer",
  "custom-details",
  "items",
  "charges",
  "payment",
  "notes-terms",
  "footer",
]);

const RESERVED_LABELS = new Set(
  [
    "Number",
    "Date",
    "Supplier",
    "GSTIN",
    "Place of supply",
    "HSN/SAC",
    "Taxable value",
    "Tax",
    "Reverse charge",
    "Total",
    "Tax summary",
    "Totals",
    "HSN",
    "SAC",
    "CGST",
    "SGST",
    "UTGST",
    "IGST",
  ].map((label) => label.toLowerCase()),
);

export type TemplateRevisionChange = {
  key: string;
  label?: string;
  visible?: boolean;
};

export type TemplateRevisionPatch = {
  sections?: readonly TemplateRevisionChange[];
  fields?: readonly TemplateRevisionChange[];
};

export type TemplateConfiguration = {
  documentType: DocumentType;
  sections: readonly {
    key: string;
    label: string;
    sortOrder: number;
    visible: boolean;
    protected: boolean;
  }[];
  fields: readonly {
    key: string;
    sectionKey: string;
    label: string;
    sortOrder: number;
    visible: boolean;
    required: boolean;
    protected: boolean;
  }[];
};

export function reviseTemplateConfiguration(
  current: TemplateConfiguration,
  patch: TemplateRevisionPatch,
): { sections: TemplateSectionDefinition[]; fields: TemplateFieldDefinition[] } {
  const sections = applySectionChanges(current, patch.sections ?? []);
  const fields = applyFieldChanges(current, patch.fields ?? []);
  for (const field of fields) {
    const section = sections.find((item) => item.key === field.sectionKey);
    if (field.visible && section && !section.visible) {
      throw new TemplateError("Show this section before showing a field inside it.");
    }
  }
  if (!configurationChanged(current, sections, fields)) {
    throw new TemplateError("Change a label or which optional parts are shown before saving a new template version.");
  }
  assertTemplateConfiguration({
    key: "revision",
    family: "standard",
    name: "Revision",
    purpose: "A revised template.",
    documentType: current.documentType,
    isDefault: false,
    brandColor: "#1F4B99",
    fontFamily: "system",
    density: "comfortable",
    sections,
    fields,
  });
  return { sections, fields };
}

function buildBuiltIn(family: TemplateFamily, documentType: DocumentType): BuiltInTemplate {
  const sections = TEMPLATE_SECTION_KEYS.map((key, index) => {
    const protectedSection =
      key === "header" ||
      key === "business" ||
      key === "customer" ||
      key === "items" ||
      key === "tax-summary";
    return {
      key,
      label: key === "tax-summary" && documentType !== "tax_invoice" ? "Totals" : SECTION_LABELS[key],
      sortOrder: index,
      visible: key !== "custom-details",
      protected: protectedSection,
    };
  });
  const fields = TEMPLATE_FIELD_KEYS.map((key, index) => {
    const taxField = key === "place_of_supply" || key === "hsn_sac" || key === "taxable_value" || key === "tax_components" || key === "reverse_charge" || key === "supplier_gstin";
    const visible = taxField ? documentType === "tax_invoice" || (documentType === "bill_of_supply" && (key === "supplier_gstin" || key === "hsn_sac")) : true;
    const protectedField = isProtectedField(key, documentType);
    return {
      key,
      sectionKey: FIELD_SECTION[key],
      label: FIELD_LABELS[key],
      sortOrder: index,
      visible: protectedField ? true : visible,
      required: protectedField,
      protected: protectedField,
    };
  });
  const template: BuiltInTemplate = {
    key: `${family}:${documentType}`,
    family,
    name: FAMILY_NAME[family],
    purpose: FAMILY_PURPOSE[family],
    documentType,
    isDefault: DEFAULT_FOR[documentType] === family,
    brandColor: family === "gst" ? "#0F6E56" : "#1F4B99",
    fontFamily: "system",
    density: family === "retail" || family === "receipt" ? "compact" : "comfortable",
    sections,
    fields,
  };
  assertTemplateConfiguration(template);
  return template;
}

function applySectionChanges(
  current: TemplateConfiguration,
  changes: readonly TemplateRevisionChange[],
): TemplateSectionDefinition[] {
  const seen = new Set<string>();
  const replacements = new Map<string, TemplateRevisionChange>();
  for (const change of changes) {
    if (!isSectionKey(change.key) || !current.sections.some((section) => section.key === change.key)) {
      throw new TemplateError("That part of the invoice is not on this template.");
    }
    if (seen.has(change.key)) {
      throw new TemplateError("Choose each part once.");
    }
    seen.add(change.key);
    replacements.set(change.key, change);
  }
  return TEMPLATE_SECTION_KEYS.map((key) => {
    const existing = current.sections.find((section) => section.key === key);
    const change = replacements.get(key);
    const protectedSection = isProtectedSection(key);
    const visible = change?.visible ?? existing?.visible ?? key !== "custom-details";
    if (protectedSection && !visible) {
      throw new TemplateError("This part of the invoice has to stay visible.");
    }
    const label = change?.label === undefined ? (existing?.label ?? sectionLabel(key, current.documentType)) : change.label;
    const normalized = assertTemplateLabel(label);
    if (!EDITABLE_SECTION_KEYS.has(key) && normalized !== sectionLabel(key, current.documentType)) {
      throw new TemplateError(`Keep the label "${sectionLabel(key, current.documentType)}".`);
    }
    if (EDITABLE_SECTION_KEYS.has(key)) {
      assertSafeLabel(normalized);
    }
    return {
      key,
      label: normalized,
      sortOrder: existing?.sortOrder ?? TEMPLATE_SECTION_KEYS.indexOf(key),
      visible,
      protected: protectedSection,
    };
  });
}

function applyFieldChanges(
  current: TemplateConfiguration,
  changes: readonly TemplateRevisionChange[],
): TemplateFieldDefinition[] {
  const seen = new Set<string>();
  const replacements = new Map<string, TemplateRevisionChange>();
  for (const change of changes) {
    if (!isFieldKey(change.key) || !current.fields.some((field) => field.key === change.key)) {
      throw new TemplateError("That part of the invoice is not on this template.");
    }
    if (seen.has(change.key)) {
      throw new TemplateError("Choose each part once.");
    }
    seen.add(change.key);
    replacements.set(change.key, change);
  }
  return TEMPLATE_FIELD_KEYS.map((key) => {
    const existing = current.fields.find((field) => field.key === key);
    const change = replacements.get(key);
    const protectedField = isProtectedField(key, current.documentType);
    const visible = change?.visible ?? existing?.visible ?? !protectedField;
    if (protectedField && !visible) {
      throw new TemplateError("This part of the invoice has to stay visible.");
    }
    const label = change?.label === undefined ? (existing?.label ?? FIELD_LABELS[key]) : change.label;
    const normalized = assertTemplateLabel(label);
    if (!EDITABLE_FIELD_KEYS.has(key) && normalized !== FIELD_LABELS[key]) {
      throw new TemplateError(`Keep the label "${FIELD_LABELS[key]}".`);
    }
    if (EDITABLE_FIELD_KEYS.has(key)) {
      assertSafeLabel(normalized);
    }
    return {
      key,
      sectionKey: FIELD_SECTION[key],
      label: normalized,
      sortOrder: existing?.sortOrder ?? TEMPLATE_FIELD_KEYS.indexOf(key),
      visible,
      required: protectedField,
      protected: protectedField,
    };
  });
}

function configurationChanged(
  current: TemplateConfiguration,
  sections: readonly TemplateSectionDefinition[],
  fields: readonly TemplateFieldDefinition[],
): boolean {
  for (const section of sections) {
    const existing = current.sections.find((item) => item.key === section.key);
    if (!existing || existing.label !== section.label || existing.visible !== section.visible) {
      return true;
    }
  }
  for (const field of fields) {
    const existing = current.fields.find((item) => item.key === field.key);
    if (!existing || existing.label !== field.label || existing.visible !== field.visible) {
      return true;
    }
  }
  return false;
}

function assertSafeLabel(label: string): void {
  if (RESERVED_LABELS.has(label.toLowerCase())) {
    throw new TemplateError("Use a label that does not stand in for a statutory heading.");
  }
}

function sectionLabel(key: TemplateSectionKey, documentType: DocumentType): string {
  if (key === "tax-summary" && documentType !== "tax_invoice") {
    return "Totals";
  }
  return SECTION_LABELS[key];
}

function isProtectedSection(key: TemplateSectionKey): boolean {
  return key === "header" || key === "business" || key === "customer" || key === "items" || key === "tax-summary";
}

function isSectionKey(key: string): key is TemplateSectionKey {
  return (TEMPLATE_SECTION_KEYS as readonly string[]).includes(key);
}

function isFieldKey(key: string): key is TemplateFieldKey {
  return (TEMPLATE_FIELD_KEYS as readonly string[]).includes(key);
}

function isProtectedField(key: TemplateFieldKey, documentType: DocumentType): boolean {
  if (
    key === "document_number" ||
    key === "document_date" ||
    key === "supplier_legal_name" ||
    key === "customer_name" ||
    key === "grand_total"
  ) {
    return true;
  }
  if (documentType === "tax_invoice") {
    return (
      key === "supplier_gstin" ||
      key === "place_of_supply" ||
      key === "hsn_sac" ||
      key === "taxable_value" ||
      key === "tax_components" ||
      key === "reverse_charge"
    );
  }
  if (documentType === "bill_of_supply") {
    return key === "supplier_gstin" || key === "hsn_sac";
  }
  return false;
}
