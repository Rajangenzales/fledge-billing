import type {
  CustomFieldDefinition,
  CustomFieldSnapshot,
  DocumentType,
  ProductType,
  StateUt,
  TaxCategoryId,
} from "@fledge/domain";
import {
  BillingError,
  GstError,
  assertDocumentGstMode,
  snapshotCustomFields,
  assertFinancialYearLabel,
  calculateGstDocument,
  financialYearOf,
  normalizeSeriesPrefix,
  type GstChargeInput,
  type GstDocumentCalculation,
  type GstLineInput,
  type GstRuleVersion,
  type GstTaxType,
} from "@fledge/domain";

export type DocumentStatus = "draft" | "finalized" | "partial" | "paid" | "cancelled";

export type DocumentLine = {
  id: string;
  productId: string | null;
  description: string;
  hsnSac: string | null;
  quantity: string;
  unit: string;
  rate: string;
  discountType: GstLineInput["discountType"];
  discountValue: string;
  discountAmount: string;
  lineAmount: string;
  taxableValue: string;
  gstRatePercent: string | null;
  taxInclusive: boolean;
  taxCategoryId: TaxCategoryId;
  supplyNature: ProductType | null;
  sortOrder: number;
};

export type DocumentCharge = {
  id: string;
  description: string;
  amount: string;
  taxable: boolean;
  taxCategoryId: TaxCategoryId;
  gstRatePercent: string | null;
  sortOrder: number;
};

export type DocumentTax = {
  id: string;
  documentItemId: string | null;
  documentChargeId: string | null;
  taxType: GstTaxType;
  rate: string;
  taxableValue: string;
  amount: string;
  jurisdictionStateId: string;
  ruleVersionId: string;
  reverseCharge: boolean;
};

export type DocumentCustomField = CustomFieldSnapshot & {
  id: string;
};

export type BillingDocument = {
  id: string;
  businessId: string;
  customerId: string;
  documentType: DocumentType;
  status: DocumentStatus;
  documentNumber: string | null;
  financialYear: string;
  documentDate: string;
  placeOfSupplyStateId: string | null;
  gstEnabled: boolean;
  reverseCharge: boolean;
  supplierStateId: string;
  supplierGstRegistered: boolean;
  supplierGstin: string | null;
  recipientStateId: string;
  recipientRegistrationType: "registered" | "unregistered";
  recipientGstin: string | null;
  lines: DocumentLine[];
  charges: DocumentCharge[];
  taxes: DocumentTax[];
  subtotal: string;
  discountTotal: string;
  taxableTotal: string;
  exemptTotal: string;
  nonGstTotal: string;
  taxTotal: string;
  cessTotal: string;
  roundingResidual: string;
  grandTotal: string;
  ruleVersionId: string | null;
  notices: string[];
  templateId: string | null;
  customFields: DocumentCustomField[];
  createdAt: string;
  finalizedAt: string | null;
  updatedAt: string;
};

export type BusinessRef = {
  id: string;
  stateId: string;
  gstRegistered: boolean;
  gstin: string | null;
};

export type CustomerRef = {
  id: string;
  active: boolean;
  stateId: string;
  registrationType: "registered" | "unregistered";
  gstin: string | null;
};

export type ProductRef = {
  id: string;
  type: ProductType;
  taxCategoryId: TaxCategoryId;
  savedGstRatePercent: string | null;
};

export type NumberSeries = {
  id: string;
  businessId: string;
  documentType: BillingDocument["documentType"];
  financialYear: string;
  prefix: string;
  nextNumber: number;
  padding: number;
  active: boolean;
};

export type DocumentRepository = {
  getBusinessId: () => string | null;
  getBusiness: () => BusinessRef | null;
  getCustomer: (id: string) => CustomerRef | null;
  getCustomerContact: (id: string) => { name: string; phone: string | null; email: string | null } | null;
  getProduct: (id: string) => ProductRef | null;
  listGstRuleVersions: () => GstRuleVersion[];
  list: () => BillingDocument[];
  get: (id: string) => BillingDocument | null;
  insert: (record: BillingDocument) => void;
  replaceDraft: (record: BillingDocument) => void;
  finalize: (id: string, finalizedAt: string) => BillingDocument;
  cancel: (id: string, updatedAt: string) => BillingDocument;
  getNumberSeries: (documentType: BillingDocument["documentType"], financialYear: string) => NumberSeries | null;
  saveNumberSeries: (record: NumberSeries) => void;
  hasIssuedNumber: (documentType: BillingDocument["documentType"], financialYear: string) => boolean;
  resolveTemplate: (documentType: DocumentType, templateId: string | null, now: string) => string;
  listCustomFields: (templateId: string) => CustomFieldDefinition[];
};

export type DocumentDeps = {
  repository: DocumentRepository;
  states: readonly StateUt[];
  now: () => string;
  createId: () => string;
};

export type SaveDocumentInput = {
  customerId: string;
  documentType: BillingDocument["documentType"];
  documentDate: string;
  placeOfSupplyStateId?: string | null;
  gstEnabled: boolean;
  reverseCharge: boolean;
  lines: readonly GstLineInput[];
  charges?: readonly GstChargeInput[];
  templateId?: string | null;
  customFields?: readonly { key: string; value: string | null }[];
};

export type SaveNumberSeriesInput = {
  documentType: BillingDocument["documentType"];
  financialYear: string;
  prefix: string;
  nextNumber: number;
  padding: number;
};

export function listDocuments(deps: DocumentDeps): BillingDocument[] {
  return deps.repository.list().map((document) => presentDraft(document, deps));
}

export function getDocument(id: string, deps: DocumentDeps): BillingDocument | null {
  const stored = deps.repository.get(id);
  return stored ? presentDraft(stored, deps) : null;
}

export function createDocument(input: SaveDocumentInput, deps: DocumentDeps): BillingDocument {
  const business = requireBusiness(deps);
  const draft = buildDraft(input, deps, business, null, [], {
    id: deps.createId(),
    businessId: business.id,
    status: "draft",
    documentNumber: null,
    createdAt: deps.now(),
    finalizedAt: null,
    updatedAt: deps.now(),
  });
  deps.repository.insert(draft);
  return draft;
}

export function updateDocument(
  id: string,
  input: SaveDocumentInput,
  deps: DocumentDeps,
): BillingDocument {
  const existing = deps.repository.get(id);
  if (!existing) {
    throw new BillingError("That document was not found.");
  }
  if (existing.status !== "draft") {
    throw new BillingError("A finalized document cannot be changed.");
  }
  const business = requireBusiness(deps);
  const draft = buildDraft(input, deps, business, existing.templateId, existing.customFields, {
    id: existing.id,
    businessId: existing.businessId,
    status: "draft",
    documentNumber: null,
    createdAt: existing.createdAt,
    finalizedAt: null,
    updatedAt: deps.now(),
  });
  deps.repository.replaceDraft(draft);
  return draft;
}

export function finalizeDocument(id: string, deps: DocumentDeps): BillingDocument {
  return deps.repository.finalize(id, deps.now());
}

export function cancelDocument(id: string, deps: DocumentDeps): BillingDocument {
  return deps.repository.cancel(id, deps.now());
}

export function saveNumberSeries(input: SaveNumberSeriesInput, deps: DocumentDeps): NumberSeries {
  const business = requireBusiness(deps);
  assertDocumentGstMode(input.documentType, input.documentType === "tax_invoice");
  const financialYear = assertFinancialYearLabel(input.financialYear);
  const prefix = normalizeSeriesPrefix(input.prefix);
  if (!Number.isInteger(input.padding) || input.padding < 3 || input.padding > 6) {
    throw new BillingError("Number padding must be from 3 to 6 digits.");
  }
  if (!Number.isInteger(input.nextNumber) || input.nextNumber < 1) {
    throw new BillingError("The next document number must be a whole number of at least 1.");
  }
  const existing = deps.repository.getNumberSeries(input.documentType, financialYear);
  if (
    existing &&
    deps.repository.hasIssuedNumber(input.documentType, financialYear) &&
    input.nextNumber < existing.nextNumber
  ) {
    throw new BillingError("The next number can only move forward after a document is issued.");
  }
  const record: NumberSeries = {
    id: existing?.id ?? seriesId(business.id, input.documentType, financialYear),
    businessId: business.id,
    documentType: input.documentType,
    financialYear,
    prefix,
    nextNumber: input.nextNumber,
    padding: input.padding,
    active: true,
  };
  deps.repository.saveNumberSeries(record);
  return record;
}

export function seriesId(
  businessId: string,
  documentType: BillingDocument["documentType"],
  financialYear: string,
): string {
  return `ns:${businessId}:${documentType}:${financialYear}`;
}

function buildDraft(
  input: SaveDocumentInput,
  deps: DocumentDeps,
  business: BusinessRef,
  existingTemplateId: string | null,
  existingCustomFields: readonly { key: string; value: string | null }[],
  identity: {
    id: string;
    businessId: string;
    status: "draft";
    documentNumber: null;
    createdAt: string;
    finalizedAt: null;
    updatedAt: string;
  },
): BillingDocument {
  const financialYear = financialYearOf(input.documentDate);
  const customer = deps.repository.getCustomer(input.customerId);
  if (!customer) {
    throw new BillingError("Choose a customer.");
  }
  if (!customer.active) {
    throw new BillingError("Choose an active customer.");
  }
  const templateId = deps.repository.resolveTemplate(
    input.documentType,
    input.templateId === undefined ? existingTemplateId : input.templateId,
    deps.now(),
  );
  const customFields = snapshotCustomFields(
    deps.repository.listCustomFields(templateId),
    input.customFields,
    existingCustomFields,
  ).map((field) => ({ ...field, id: `dcf:${identity.id}:${field.key}` }));
  const lines = input.lines.map((line) => withProductNature(line, deps));
  const context = productContext(lines, deps);
  const calculated = calculateGstDocument({
    documentType: input.documentType,
    documentDate: input.documentDate,
    gstEnabled: input.gstEnabled,
    reverseCharge: input.reverseCharge,
    placeOfSupplyStateId: input.placeOfSupplyStateId,
    supplier: {
      stateId: business.stateId,
      gstRegistered: business.gstRegistered,
      gstin: business.gstin,
    },
    recipient: {
      stateId: customer.stateId,
      registrationType: customer.registrationType,
      gstin: customer.gstin,
    },
    lines,
    charges: input.charges,
    rules: deps.repository.listGstRuleVersions(),
    states: deps.states,
    productRates: context.rates,
    productCategories: context.categories,
  });
  const lineIds = calculated.lines.map(() => deps.createId());
  const chargeIds = calculated.charges.map(() => deps.createId());
  return toDocument(calculated, identity, {
    customerId: customer.id,
    documentType: input.documentType,
    financialYear,
    documentDate: input.documentDate,
    placeOfSupplyStateId: input.gstEnabled ? (input.placeOfSupplyStateId ?? "").trim() : null,
    gstEnabled: input.gstEnabled,
    business,
    customer,
    lineIds,
    chargeIds,
    templateId,
    customFields,
  });
}

function presentDraft(stored: BillingDocument, deps: DocumentDeps): BillingDocument {
  if (stored.status !== "draft") {
    return stored;
  }
  const business = deps.repository.getBusiness();
  const customer = deps.repository.getCustomer(stored.customerId);
  if (!business || !customer) {
    throw new BillingError("That document was not found.");
  }
  const lines = stored.lines.map((line) => ({
    productId: line.productId,
    description: line.description,
    hsnSac: line.hsnSac,
    quantity: line.quantity,
    unit: line.unit,
    rate: line.rate,
    discountType: line.discountType,
    discountValue: line.discountType === "none" ? null : line.discountValue,
    taxInclusive: line.taxInclusive,
    gstRatePercent: line.gstRatePercent,
    taxCategoryId: line.taxCategoryId,
    supplyNature: line.supplyNature,
  }));
  const context = productContext(lines, deps);
  const calculated = calculateGstDocument({
    documentType: stored.documentType,
    documentDate: stored.documentDate,
    gstEnabled: stored.gstEnabled,
    reverseCharge: stored.reverseCharge,
    placeOfSupplyStateId: stored.placeOfSupplyStateId,
    supplier: {
      stateId: business.stateId,
      gstRegistered: business.gstRegistered,
      gstin: business.gstin,
    },
    recipient: {
      stateId: customer.stateId,
      registrationType: customer.registrationType,
      gstin: customer.gstin,
    },
    lines,
    charges: stored.charges.map((charge) => ({
      description: charge.description,
      amount: charge.amount,
      taxable: charge.taxable,
      taxCategoryId: charge.taxCategoryId,
      gstRatePercent: charge.gstRatePercent,
    })),
    rules: deps.repository.listGstRuleVersions(),
    states: deps.states,
    productRates: context.rates,
    productCategories: context.categories,
  });
  return toDocument(
    calculated,
    {
      id: stored.id,
      businessId: stored.businessId,
      status: "draft",
      documentNumber: null,
      createdAt: stored.createdAt,
      finalizedAt: null,
      updatedAt: stored.updatedAt,
    },
    {
      customerId: stored.customerId,
      documentType: stored.documentType,
      financialYear: stored.financialYear,
      documentDate: stored.documentDate,
      placeOfSupplyStateId: stored.placeOfSupplyStateId,
      gstEnabled: stored.gstEnabled,
      business,
      customer,
      lineIds: stored.lines.map((line) => line.id),
      chargeIds: stored.charges.map((charge) => charge.id),
      templateId: stored.templateId,
      customFields: stored.customFields,
    },
  );
}

function toDocument(
  calculated: GstDocumentCalculation,
  identity: {
    id: string;
    businessId: string;
    status: "draft";
    documentNumber: null;
    createdAt: string;
    finalizedAt: null;
    updatedAt: string;
  },
  context: {
    customerId: string;
    documentType: BillingDocument["documentType"];
    financialYear: string;
    documentDate: string;
    placeOfSupplyStateId: string | null;
    gstEnabled: boolean;
    business: BusinessRef;
    customer: CustomerRef;
    lineIds: string[];
    chargeIds: string[];
    templateId: string | null;
    customFields: DocumentCustomField[];
  },
): BillingDocument {
  if (
    calculated.lines.length !== context.lineIds.length ||
    calculated.charges.length !== context.chargeIds.length
  ) {
    throw new GstError("The GST calculation did not match the document lines.");
  }
  return {
    ...identity,
    customerId: context.customerId,
    documentType: context.documentType,
    financialYear: context.financialYear,
    documentDate: context.documentDate,
    placeOfSupplyStateId: context.placeOfSupplyStateId,
    gstEnabled: context.gstEnabled,
    reverseCharge: calculated.reverseCharge,
    supplierStateId: calculated.supplierStateId,
    supplierGstRegistered: context.business.gstRegistered,
    supplierGstin: context.business.gstin,
    recipientStateId: calculated.recipientStateId,
    recipientRegistrationType: context.customer.registrationType,
    recipientGstin: context.customer.gstin,
    lines: calculated.lines.map((line, index) => ({ ...line, id: context.lineIds[index]! })),
    charges: calculated.charges.map((charge, index) => ({ ...charge, id: context.chargeIds[index]! })),
    taxes: calculated.taxes.map((tax) => {
      const sourceId = tax.source === "line" ? context.lineIds[tax.sourceIndex] : context.chargeIds[tax.sourceIndex];
      if (!sourceId) {
        throw new GstError("The GST calculation did not match the document lines.");
      }
      return {
        id: `${sourceId}:${tax.taxType}`,
        documentItemId: tax.source === "line" ? sourceId : null,
        documentChargeId: tax.source === "charge" ? sourceId : null,
        taxType: tax.taxType,
        rate: tax.rate,
        taxableValue: tax.taxableValue,
        amount: tax.amount,
        jurisdictionStateId: tax.jurisdictionStateId,
        ruleVersionId: tax.ruleVersionId,
        reverseCharge: tax.reverseCharge,
      };
    }),
    subtotal: calculated.subtotal,
    discountTotal: calculated.discountTotal,
    taxableTotal: calculated.taxableTotal,
    exemptTotal: calculated.exemptTotal,
    nonGstTotal: calculated.nonGstTotal,
    taxTotal: calculated.taxTotal,
    cessTotal: calculated.cessTotal,
    roundingResidual: calculated.roundingResidual,
    grandTotal: calculated.grandTotal,
    ruleVersionId: calculated.ruleVersionId,
    notices: calculated.notices,
    templateId: context.templateId,
    customFields: context.customFields,
  };
}

function withProductNature(line: GstLineInput, deps: DocumentDeps): GstLineInput {
  const productId = line.productId?.trim();
  if (!productId || line.supplyNature) {
    return line;
  }
  const product = deps.repository.getProduct(productId);
  if (!product) {
    throw new BillingError("That product was not found.");
  }
  return { ...line, supplyNature: product.type };
}

function productContext(
  lines: readonly GstLineInput[],
  deps: DocumentDeps,
): {
  rates: Record<string, string | null>;
  categories: Record<string, TaxCategoryId>;
} {
  const rates: Record<string, string | null> = {};
  const categories: Record<string, TaxCategoryId> = {};
  for (const line of lines) {
    const productId = line.productId?.trim();
    if (!productId || productId in rates) {
      continue;
    }
    const product = deps.repository.getProduct(productId);
    if (!product) {
      throw new BillingError("That product was not found.");
    }
    rates[productId] = product.savedGstRatePercent;
    categories[productId] = product.taxCategoryId;
  }
  return { rates, categories };
}

function requireBusiness(deps: DocumentDeps): BusinessRef {
  const business = deps.repository.getBusiness();
  if (!business) {
    throw new BillingError("Save the business profile before creating a document.");
  }
  return business;
}
