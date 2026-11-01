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
  getBusinessId: () => Promise<string | null>;
  getBusiness: () => Promise<TemplateBusiness | null>;
  ensureBuiltIns: (businessId: string, now: string) => Promise<void>;
  list: (businessId: string) => Promise<InvoiceTemplate[]>;
  get: (businessId: string, id: string) => Promise<InvoiceTemplate | null>;
  setDefault: (businessId: string, id: string, now: string) => Promise<void>;
  saveRevision: (
    businessId: string,
    sourceId: string,
    sections: readonly TemplateSectionDefinition[],
    fields: readonly TemplateFieldDefinition[],
    customFields: readonly CustomFieldDefinition[],
    now: string,
  ) => Promise<string>;
};

export type TemplateDeps = {
  repository: TemplateRepository;
  now: () => string;
};

export async function listTemplates(deps: TemplateDeps): Promise<InvoiceTemplate[]> {
  const businessId = await requireBusiness(deps);
  await deps.repository.ensureBuiltIns(businessId, deps.now());
  return deps.repository.list(businessId);
}

export async function getTemplate(id: string, deps: TemplateDeps): Promise<InvoiceTemplate | null> {
  const businessId = await deps.repository.getBusinessId();
  if (!businessId) {
    return null;
  }
  await deps.repository.ensureBuiltIns(businessId, deps.now());
  return deps.repository.get(businessId, id);
}

export async function setDefaultTemplate(id: string, deps: TemplateDeps): Promise<InvoiceTemplate> {
  const businessId = await requireBusiness(deps);
  await deps.repository.ensureBuiltIns(businessId, deps.now());
  const template = await deps.repository.get(businessId, id);
  if (!template || !template.active) {
    throw new TemplateError("That template was not found.");
  }
  await deps.repository.setDefault(businessId, id, deps.now());
  const updated = await deps.repository.get(businessId, id);
  if (!updated) {
    throw new TemplateError("That template was not found.");
  }
  return updated;
}

export async function reviseTemplate(id: string, patch: TemplateRevisionPatch, deps: TemplateDeps): Promise<InvoiceTemplate> {
  const businessId = await requireBusiness(deps);
  await deps.repository.ensureBuiltIns(businessId, deps.now());
  const current = await deps.repository.get(businessId, id);
  if (!current || !current.active) {
    throw new TemplateError("That template was not found.");
  }
  const next = reviseTemplateConfiguration(current, patch);
  const revisedId = await deps.repository.saveRevision(
    businessId,
    id,
    next.sections,
    next.fields,
    next.customFields,
    deps.now(),
  );
  const saved = await deps.repository.get(businessId, revisedId);
  if (!saved) {
    throw new TemplateError("That template was not found.");
  }
  return saved;
}

async function requireBusiness(deps: TemplateDeps): Promise<string> {
  const businessId = await deps.repository.getBusinessId();
  if (!businessId) {
    throw new TemplateError("Save the business profile before choosing a template.");
  }
  return businessId;
}
