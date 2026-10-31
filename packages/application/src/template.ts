import type { DocumentType } from "@fledge/domain";
import {
  TemplateError,
  reviseTemplateConfiguration,
  type TemplateDensity,
  type TemplateFamily,
  type TemplateFontFamily,
  type CustomFieldDefinition,
  type TemplateRevisionPatch,
  type TemplateSectionDefinition,
  type TemplateFieldDefinition,
} from "@fledge/domain";

export type TemplateSection = {
  id: string;
  key: string;
  label: string;
  sortOrder: number;
  visible: boolean;
  protected: boolean;
};

export type TemplateField = {
  id: string;
  key: string;
  sectionKey: string;
  label: string;
  sortOrder: number;
  visible: boolean;
  required: boolean;
  protected: boolean;
};

export type TemplateCustomField = CustomFieldDefinition & {
  id: string;
};

export type InvoiceTemplate = {
  id: string;
  businessId: string;
  key: string;
  family: TemplateFamily;
  name: string;
  purpose: string;
  documentType: DocumentType;
  version: number;
  brandColor: string;
  fontFamily: TemplateFontFamily;
  density: TemplateDensity;
  isDefault: boolean;
  active: boolean;
  sections: TemplateSection[];
  fields: TemplateField[];
  customFields: TemplateCustomField[];
  createdAt: string;
  updatedAt: string;
};

export type TemplateBusiness = {
  legalName: string;
  stateId: string;
  gstRegistered: boolean;
  gstin: string | null;
};

export type TemplateRepository = {
  getBusinessId: () => string | null;
  getBusiness: () => TemplateBusiness | null;
  ensureBuiltIns: (businessId: string, now: string) => void;
  list: (businessId: string) => InvoiceTemplate[];
  get: (businessId: string, id: string) => InvoiceTemplate | null;
  setDefault: (businessId: string, id: string, now: string) => void;
  saveRevision: (
    businessId: string,
    sourceId: string,
    sections: readonly TemplateSectionDefinition[],
    fields: readonly TemplateFieldDefinition[],
    customFields: readonly CustomFieldDefinition[],
    now: string,
  ) => string;
};

export type TemplateDeps = {
  repository: TemplateRepository;
  now: () => string;
};

export function listTemplates(deps: TemplateDeps): InvoiceTemplate[] {
  const businessId = requireBusiness(deps);
  deps.repository.ensureBuiltIns(businessId, deps.now());
  return deps.repository.list(businessId);
}

export function getTemplate(id: string, deps: TemplateDeps): InvoiceTemplate | null {
  const businessId = deps.repository.getBusinessId();
  if (!businessId) {
    return null;
  }
  deps.repository.ensureBuiltIns(businessId, deps.now());
  return deps.repository.get(businessId, id);
}

export function setDefaultTemplate(id: string, deps: TemplateDeps): InvoiceTemplate {
  const businessId = requireBusiness(deps);
  deps.repository.ensureBuiltIns(businessId, deps.now());
  const template = deps.repository.get(businessId, id);
  if (!template || !template.active) {
    throw new TemplateError("That template was not found.");
  }
  deps.repository.setDefault(businessId, id, deps.now());
  const updated = deps.repository.get(businessId, id);
  if (!updated) {
    throw new TemplateError("That template was not found.");
  }
  return updated;
}

export function reviseTemplate(id: string, patch: TemplateRevisionPatch, deps: TemplateDeps): InvoiceTemplate {
  const businessId = requireBusiness(deps);
  deps.repository.ensureBuiltIns(businessId, deps.now());
  const current = deps.repository.get(businessId, id);
  if (!current || !current.active) {
    throw new TemplateError("That template was not found.");
  }
  const next = reviseTemplateConfiguration(current, patch);
  const revisedId = deps.repository.saveRevision(
    businessId,
    id,
    next.sections,
    next.fields,
    next.customFields,
    deps.now(),
  );
  const saved = deps.repository.get(businessId, revisedId);
  if (!saved) {
    throw new TemplateError("That template was not found.");
  }
  return saved;
}

function requireBusiness(deps: TemplateDeps): string {
  const businessId = deps.repository.getBusinessId();
  if (!businessId) {
    throw new TemplateError("Save the business profile before choosing a template.");
  }
  return businessId;
}
