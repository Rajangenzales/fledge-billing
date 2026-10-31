import type { StateUt } from "@fledge/domain";
import {
  BUILT_IN_TEMPLATES,
  GST_RULE_VERSIONS,
  TemplateError,
  calculateGstDocument,
  findStateUtById,
  renderTemplatePreview,
  reviseTemplateConfiguration,
  type CustomFieldDefinition,
  type DocumentType,
  type GstLineInput,
  type PreviewTemplate,
  type TemplatePreview,
  type TemplateRevisionPatch,
} from "@fledge/domain";
import { reviseTemplate, type InvoiceTemplate, type TemplateDeps } from "./template.js";

export const PREVIEW_DATE = "2026-10-31";

const SAMPLE_CUSTOMER = {
  name: "Sample Customer",
  phone: "9847000111",
  email: "buyer@example.com",
};

const LONG_NOTE =
  "This preview note is long enough to show that optional text is kept in full and is not cut off for the page.";

export type TemplatePreviewDeps = TemplateDeps & {
  states: readonly StateUt[];
};

export function previewTemplate(
  id: string,
  deps: TemplatePreviewDeps,
  patch?: TemplateRevisionPatch,
): TemplatePreview {
  const businessId = requireBusinessId(deps);
  deps.repository.ensureBuiltIns(businessId, deps.now());
  const stored = deps.repository.get(businessId, id);
  if (!stored || !stored.active) {
    throw new TemplateError("That template was not found.");
  }
  const business = deps.repository.getBusiness();
  if (!business) {
    throw new TemplateError("Save the business profile before choosing a template.");
  }
  const edited = patch === undefined ? null : reviseTemplateConfiguration(stored, patch);
  const template: PreviewTemplate = {
    id: stored.id,
    version: stored.version,
    documentType: stored.documentType,
    family: stored.family,
    brandColor: stored.brandColor,
    fontFamily: stored.fontFamily,
    density: stored.density,
    sections: edited?.sections ?? stored.sections,
    fields: edited?.fields ?? stored.fields,
    customFields: edited?.customFields ?? stored.customFields,
  };
  return renderStoredTemplate(template, business, deps.states, edited === null);
}

export function restoreTemplate(id: string, deps: TemplateDeps): InvoiceTemplate {
  const businessId = requireBusinessId(deps);
  deps.repository.ensureBuiltIns(businessId, deps.now());
  const current = deps.repository.get(businessId, id);
  if (!current || !current.active) {
    throw new TemplateError("That template was not found.");
  }
  const builtin = BUILT_IN_TEMPLATES.find(
    (template) => template.family === current.family && template.documentType === current.documentType,
  );
  if (!builtin) {
    throw new TemplateError("Choose a template.");
  }
  try {
    return reviseTemplate(
      id,
      {
        sections: builtin.sections.map((section) => ({
          key: section.key,
          label: section.label,
          visible: section.visible,
        })),
        fields: builtin.fields.map((field) => ({
          key: field.key,
          label: field.label,
          visible: field.visible,
        })),
        customFields: [],
      },
      deps,
    );
  } catch (error) {
    if (error instanceof TemplateError && error.userMessage.includes("new template version")) {
      throw new TemplateError("This template already matches the built-in layout.");
    }
    throw error;
  }
}

function renderStoredTemplate(
  template: PreviewTemplate,
  business: { legalName: string; stateId: string; gstRegistered: boolean; gstin: string | null },
  states: readonly StateUt[],
  saved: boolean,
): TemplatePreview {
  const place = findStateUtById(business.stateId, states);
  if (!place) {
    throw new TemplateError("Choose an active Indian State or Union Territory.");
  }
  const calculation = calculateGstDocument({
    documentType: template.documentType,
    documentDate: PREVIEW_DATE,
    gstEnabled: gstEnabled(template.documentType),
    reverseCharge: false,
    placeOfSupplyStateId: gstEnabled(template.documentType) ? business.stateId : null,
    supplier: {
      stateId: business.stateId,
      gstRegistered: business.gstRegistered,
      gstin: business.gstin,
    },
    recipient: {
      stateId: business.stateId,
      registrationType: "unregistered",
    },
    lines: sampleLines(template.documentType),
    rules: GST_RULE_VERSIONS,
    states,
  });
  return renderTemplatePreview({
    template,
    saved,
    supplier: { legalName: business.legalName, gstin: business.gstin },
    placeOfSupplyName: place.name,
    documentDate: PREVIEW_DATE,
    customer: SAMPLE_CUSTOMER,
    notes: LONG_NOTE,
    calculation,
    customValues: Object.fromEntries(template.customFields.map((field) => [field.key, sampleCustomValue(field)])),
  });
}

function sampleLines(documentType: DocumentType): GstLineInput[] {
  if (documentType === "tax_invoice" || documentType === "quotation") {
    return [
      {
        description: "Sample consulting for a preview of this template.",
        quantity: "1",
        unit: "nos",
        rate: "1000",
        discountType: "none",
        taxInclusive: false,
        gstRatePercent: "18",
        taxCategoryId: "taxable",
        hsnSac: "998314",
      },
    ];
  }
  if (documentType === "bill_of_supply") {
    return [
      {
        description: "Rice",
        quantity: "1",
        unit: "kg",
        rate: "40",
        discountType: "none",
        taxInclusive: false,
        taxCategoryId: "exempt",
      },
    ];
  }
  return [
    {
      description: "Notebook",
      quantity: "3",
      unit: "nos",
      rate: "10.10",
      discountType: "percent",
      discountValue: "10",
      taxInclusive: false,
      taxCategoryId: "non-gst",
    },
  ];
}

function gstEnabled(documentType: DocumentType): boolean {
  return documentType === "tax_invoice" || documentType === "quotation";
}

function sampleCustomValue(field: CustomFieldDefinition): string {
  if (field.defaultValue) {
    return field.defaultValue;
  }
  switch (field.type) {
    case "long_text":
      return LONG_NOTE;
    case "number":
      return "1";
    case "date":
      return PREVIEW_DATE;
    case "phone":
      return SAMPLE_CUSTOMER.phone;
    case "email":
      return SAMPLE_CUSTOMER.email;
    case "url":
      return "https://example.com";
    case "checkbox":
      return "yes";
    case "short_text":
      return "Sample";
  }
}

function requireBusinessId(deps: TemplateDeps): string {
  const businessId = deps.repository.getBusinessId();
  if (!businessId) {
    throw new TemplateError("Save the business profile before choosing a template.");
  }
  return businessId;
}
