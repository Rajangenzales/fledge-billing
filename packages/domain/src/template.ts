/**
 * Invoice presentation. Templates choose labels, order and visibility.
 * They do not calculate money or tax.
 */

import { DOCUMENT_TYPES, type DocumentType } from "./billing.js";
import { customFieldsChanged, reviseCustomFields, type CustomFieldDefinition, type CustomFieldDraft } from "./custom-field.js";

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
  "item_description",
  "item_quantity",
  "item_unit",
  "item_rate",
  "item_amount",
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
  customFields?: readonly CustomFieldDefinition[];
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
  item_description: "Description",
  item_quantity: "Quantity",
  item_unit: "Unit",
  item_rate: "Rate",
  item_amount: "Amount",
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
  item_description: "items",
  item_quantity: "items",
  item_unit: "items",
  item_rate: "items",
  item_amount: "items",
  hsn_sac: "items",
  taxable_value: "tax-summary",
  tax_components: "tax-summary",
  reverse_charge: "tax-summary",
  grand_total: "tax-summary",
  notes: "notes-terms",
};

const SECTOR_PRESETS: readonly {
  key: string;
  name: string;
  purpose: string;
  family: TemplateFamily;
  fields: readonly { key: string; label: string; type: CustomFieldDefinition["type"]; helperText: string }[];
}[] = [
  {
    key: "distributor-stockist", name: "Distributor / Stockist",
    purpose: "Bulk distribution billing with delivery, order and sales representative references.",
    family: "standard",
    fields: [
      { key: "sales-representative", label: "Sales representative", type: "short_text", helperText: "Person handling this order" },
      { key: "purchase-order-reference", label: "Purchase order reference", type: "short_text", helperText: "Buyer's PO number" },
      { key: "delivery-reference", label: "Delivery reference", type: "short_text", helperText: "Delivery challan or dispatch reference" },
      { key: "delivery-address", label: "Delivery address", type: "long_text", helperText: "Delivery location, if different" },
      { key: "credit-period", label: "Agreed credit period (days)", type: "number", helperText: "Reference only; customer credit settings remain separate" },
    ],
  },
  {
    key: "wholesaler", name: "Wholesaler",
    purpose: "Bulk goods billing with buyer order, packing and transport references.",
    family: "standard",
    fields: [
      { key: "buyer-order-reference", label: "Buyer order reference", type: "short_text", helperText: "Customer purchase order" },
      { key: "dispatch-reference", label: "Dispatch reference", type: "short_text", helperText: "Dispatch or delivery challan number" },
      { key: "transporter-name", label: "Transporter name", type: "short_text", helperText: "Transport provider, if applicable" },
      { key: "lorry-receipt-number", label: "LR / consignment reference", type: "short_text", helperText: "Transport document reference" },
      { key: "packing-reference", label: "Packing details", type: "short_text", helperText: "Package or bundle reference" },
    ],
  },
  {
    key: "retail-shop", name: "Small Retail Shop",
    purpose: "Compact counter billing with cashier and receipt references.",
    family: "retail",
    fields: [
      { key: "counter-number", label: "Counter number", type: "short_text", helperText: "Shop counter identifier" },
      { key: "cashier-name", label: "Cashier", type: "short_text", helperText: "Staff member handling the sale" },
      { key: "customer-reference", label: "Customer reference", type: "short_text", helperText: "Optional walk-in customer reference" },
    ],
  },
  {
    key: "taxi-cab", name: "Taxi / Cab Operator",
    purpose: "Passenger transport billing with driver, vehicle and journey references. Does not calculate fares or manage trips.",
    family: "service",
    fields: [
      { key: "trip-reference", label: "Trip / booking ID", type: "short_text", helperText: "Booking reference" },
      { key: "trip-date", label: "Trip date", type: "date", helperText: "Date of journey" },
      { key: "driver-name", label: "Driver name", type: "short_text", helperText: "Driver assigned to the journey" },
      { key: "driver-contact", label: "Driver contact number", type: "phone", helperText: "Driver phone number" },
      { key: "vehicle-registration", label: "Vehicle registration number", type: "short_text", helperText: "Vehicle registration" },
      { key: "pickup-location", label: "Pickup location", type: "long_text", helperText: "Journey starting point" },
      { key: "drop-location", label: "Destination", type: "long_text", helperText: "Journey destination" },
      { key: "distance-km", label: "Distance (km)", type: "number", helperText: "Recorded distance; informational only" },
    ],
  },
  {
    key: "travel-agency", name: "Travel Agency",
    purpose: "Travel service billing with booking, traveller, itinerary and travel date references.",
    family: "service",
    fields: [
      { key: "booking-reference", label: "Booking reference", type: "short_text", helperText: "Agency booking ID" },
      { key: "traveller-names", label: "Traveller names", type: "long_text", helperText: "Names as provided by the customer" },
      { key: "destination", label: "Destination", type: "long_text", helperText: "Travel destination or itinerary" },
      { key: "departure-date", label: "Departure date", type: "date", helperText: "Planned departure" },
      { key: "return-date", label: "Return date", type: "date", helperText: "Planned return, if applicable" },
      { key: "passenger-count", label: "Passenger count", type: "number", helperText: "Number of travellers" },
      { key: "supplier-reference", label: "Supplier / ticket reference", type: "short_text", helperText: "Airline, hotel or supplier reference" },
    ],
  },
  {
    key: "general-services", name: "General Service Provider",
    purpose: "Professional and field services with project, service period and work references.",
    family: "service",
    fields: [
      { key: "project-reference", label: "Project / work reference", type: "short_text", helperText: "Client project identifier" },
      { key: "service-period-from", label: "Service period from", type: "date", helperText: "Start date" },
      { key: "service-period-to", label: "Service period to", type: "date", helperText: "End date" },
      { key: "assigned-person", label: "Assigned professional", type: "short_text", helperText: "Person delivering the service" },
      { key: "work-description", label: "Work details", type: "long_text", helperText: "Additional scope or completion details" },
    ],
  },
  {
    key: "goods-transport-agency", name: "Goods Transport Agency",
    purpose: "Goods transport document references including consignment, consignor, consignee and vehicle details. GST treatment must be reviewed separately.",
    family: "service",
    fields: [
      { key: "consignment-note-number", label: "Consignment note / LR number", type: "short_text", helperText: "Transport document number" },
      { key: "consignor-details", label: "Consignor details", type: "long_text", helperText: "Name and address of consignor" },
      { key: "consignee-details", label: "Consignee details", type: "long_text", helperText: "Name and address of consignee" },
      { key: "goods-description", label: "Goods description", type: "long_text", helperText: "Description of goods carried" },
      { key: "gross-weight", label: "Gross weight", type: "number", helperText: "Weight as recorded on consignment documents" },
      { key: "transport-vehicle-registration", label: "Vehicle registration number", type: "short_text", helperText: "Transport vehicle registration" },
      { key: "origin", label: "Origin", type: "long_text", helperText: "Place goods were taken up" },
      { key: "destination", label: "Destination", type: "long_text", helperText: "Place goods are to be delivered" },
      { key: "transporter-gstin", label: "Transporter GSTIN", type: "short_text", helperText: "GSTIN, where applicable" },
    ],
  },
];

function buildSectorPresets(): BuiltInTemplate[] {
  return SECTOR_PRESETS.flatMap((preset) =>
    (["tax_invoice", "non_gst_invoice"] as const).map((documentType) => {
      const base = buildBuiltIn(preset.family, documentType);
      const sectorTemplate: BuiltInTemplate = {
        ...base,
        key: `sector:${preset.key}:${documentType}`,
        name: preset.name,
        purpose: preset.purpose,
        isDefault: false,
        sections: base.sections.map((section) => section.key === "custom-details"
          ? { ...section, label: "Additional details", visible: true }
          : section),
        customFields: preset.fields.map((field, index) => ({
          key: field.key,
          sectionKey: "custom-details" as const,
          label: field.label,
          type: field.type,
          helperText: field.helperText,
          required: false,
          visible: true,
          sortOrder: index,
          defaultValue: null,
        })),
      };
      assertTemplateConfiguration(sectorTemplate);
      return sectorTemplate;
    }),
  );
}

export const BUILT_IN_TEMPLATES: readonly BuiltInTemplate[] = [
  ...TEMPLATE_FAMILIES.flatMap((family) =>
    FAMILY_DOCUMENT_TYPES[family].map((documentType) => buildBuiltIn(family, documentType)),
  ),
  ...buildSectorPresets(),
];

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

const EDITABLE_FIELD_KEYS = new Set<TemplateFieldKey>([
  "document_number",
  "document_date",
  "supplier_legal_name",
  "customer_name",
  "customer_phone",
  "customer_email",
  "grand_total",
  "notes",
  "item_description",
  "item_quantity",
  "item_unit",
  "item_rate",
  "item_amount",
]);

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
  customFields?: readonly CustomFieldDraft[];
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
  customFields?: readonly CustomFieldDefinition[];
};

export function reviseTemplateConfiguration(
  current: TemplateConfiguration,
  patch: TemplateRevisionPatch,
): { sections: TemplateSectionDefinition[]; fields: TemplateFieldDefinition[]; customFields: CustomFieldDefinition[] } {
  const sections = applySectionChanges(current, patch.sections ?? []);
  const fields = applyFieldChanges(current, patch.fields ?? []);
  for (const field of fields) {
    const section = sections.find((item) => item.key === field.sectionKey);
    if (field.visible && section && !section.visible) {
      throw new TemplateError("Show this section before showing a field inside it.");
    }
  }
  const customFields = reviseCustomFields(current.customFields ?? [], sections, patch.customFields);
  if (!configurationChanged(current, sections, fields) && !customFieldsChanged(current.customFields ?? [], customFields)) {
    throw new TemplateError("Change a label, an optional part, or a custom field before saving a new template version.");
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
  return { sections, fields, customFields };
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
    const originalLabel = existing?.label ?? sectionLabel(key, current.documentType);
    if (EDITABLE_SECTION_KEYS.has(key) && normalized !== originalLabel) {
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
    const originalLabel = existing?.label ?? FIELD_LABELS[key];
    if (EDITABLE_FIELD_KEYS.has(key) && normalized !== originalLabel) {
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
    key === "grand_total" ||
    key === "item_description" ||
    key === "item_quantity" ||
    key === "item_unit" ||
    key === "item_rate" ||
    key === "item_amount"
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
