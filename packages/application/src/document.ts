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

export type DocumentPartySnapshot = {
  name: string;
  address: string;
  pinCode: string | null;
  stateId: string;
  phone: string | null;
  email: string | null;
  gstin: string | null;
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
  dueDate: string | null;
  placeOfSupplyStateId: string | null;
  gstEnabled: boolean;
  reverseCharge: boolean;
  supplierStateId: string;
  supplierGstRegistered: boolean;
  supplierGstin: string | null;
  recipientStateId: string;
  recipientRegistrationType: "registered" | "unregistered";
  recipientGstin: string | null;
  supplierSnapshot?: DocumentPartySnapshot;
  recipientSnapshot?: DocumentPartySnapshot;
  paymentDetailsSnapshot: string | null;
  invoicePreferencesSnapshot: string | null;
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
  legalName?: string;
  address?: string;
  pinCode?: string | null;
  phone?: string | null;
  email?: string | null;
  paymentDetails?: string | null;
  invoicePreferences?: string | null;
};

export type CustomerRef = {
  id: string;
  active: boolean;
  stateId: string;
  registrationType: "registered" | "unregistered";
  gstin: string | null;
  name?: string;
  billingAddress?: string;
  shippingAddress?: string | null;
  pinCode?: string | null;
  phone?: string | null;
  email?: string | null;
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
  getBusinessId: () => Promise<string | null>;
  getBusiness: () => Promise<BusinessRef | null>;
  getCustomer: (id: string) => Promise<CustomerRef | null>;
  getCustomerContact: (id: string) => Promise<{ name: string; phone: string | null; email: string | null } | null>;
  getProduct: (id: string) => Promise<ProductRef | null>;
  listGstRuleVersions: () => Promise<GstRuleVersion[]>;
  list: () => Promise<BillingDocument[]>;
  get: (id: string) => Promise<BillingDocument | null>;
  insert: (record: BillingDocument) => Promise<void>;
  replaceDraft: (record: BillingDocument) => Promise<void>;
  finalize: (id: string, finalizedAt: string) => Promise<BillingDocument>;
  cancel: (id: string, updatedAt: string) => Promise<BillingDocument>;
  getNumberSeries: (documentType: BillingDocument["documentType"], financialYear: string) => Promise<NumberSeries | null>;
  saveNumberSeries: (record: NumberSeries) => Promise<void>;
  hasIssuedNumber: (documentType: BillingDocument["documentType"], financialYear: string) => Promise<boolean>;
  resolveTemplate: (documentType: DocumentType, templateId: string | null, now: string) => Promise<string>;
  listCustomFields: (templateId: string) => Promise<CustomFieldDefinition[]>;
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
  dueDate?: string | null;
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

export async function listDocuments(deps: DocumentDeps): Promise<BillingDocument[]> {
  const stored = await deps.repository.list();
  const documents: BillingDocument[] = [];
  for (const document of stored) {
    documents.push(await presentDraft(document, deps));
  }
  return documents;
}

export async function getDocument(id: string, deps: DocumentDeps): Promise<BillingDocument | null> {
  const stored = await deps.repository.get(id);
  return stored ? presentDraft(stored, deps) : null;
}

export async function createDocument(input: SaveDocumentInput, deps: DocumentDeps): Promise<BillingDocument> {
  const business = await requireBusiness(deps);
  const draft = await buildDraft(input, deps, business, null, [], {
    id: deps.createId(),
    businessId: business.id,
    status: "draft",
    documentNumber: null,
    createdAt: deps.now(),
    finalizedAt: null,
    updatedAt: deps.now(),
  });
  await deps.repository.insert(draft);
  return draft;
}

export async function updateDocument(
  id: string,
  input: SaveDocumentInput,
  deps: DocumentDeps,
): Promise<BillingDocument> {
  const existing = await deps.repository.get(id);
  if (!existing) {
    throw new BillingError("That document was not found.");
  }
  if (existing.status !== "draft") {
    throw new BillingError("A finalized document cannot be changed.");
  }
  const business = await requireBusiness(deps);
  const templateId = input.documentType === existing.documentType ? existing.templateId : null;
  const draft = await buildDraft(input, deps, business, templateId, existing.customFields, {
    id: existing.id,
    businessId: existing.businessId,
    status: "draft",
    documentNumber: null,
    createdAt: existing.createdAt,
    finalizedAt: null,
    updatedAt: deps.now(),
  });
  await deps.repository.replaceDraft(draft);
  return draft;
}

export async function finalizeDocument(id: string, deps: DocumentDeps): Promise<BillingDocument> {
  return deps.repository.finalize(id, deps.now());
}

export async function cancelDocument(id: string, deps: DocumentDeps): Promise<BillingDocument> {
  return deps.repository.cancel(id, deps.now());
}

export async function saveNumberSeries(input: SaveNumberSeriesInput, deps: DocumentDeps): Promise<NumberSeries> {
  const business = await requireBusiness(deps);
  assertDocumentGstMode(input.documentType, input.documentType === "tax_invoice");
  const financialYear = assertFinancialYearLabel(input.financialYear);
  const prefix = normalizeSeriesPrefix(input.prefix);
  if (!Number.isInteger(input.padding) || input.padding < 3 || input.padding > 6) {
    throw new BillingError("Number padding must be from 3 to 6 digits.");
  }
  if (!Number.isInteger(input.nextNumber) || input.nextNumber < 1) {
    throw new BillingError("The next document number must be a whole number of at least 1.");
  }
  const existing = await deps.repository.getNumberSeries(input.documentType, financialYear);
  if (
    existing &&
    await deps.repository.hasIssuedNumber(input.documentType, financialYear) &&
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
  await deps.repository.saveNumberSeries(record);
  return record;
}

export function seriesId(
  businessId: string,
  documentType: BillingDocument["documentType"],
  financialYear: string,
): string {
  return `ns:${businessId}:${documentType}:${financialYear}`;
}

async function buildDraft(
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
): Promise<BillingDocument> {
  const financialYear = financialYearOf(input.documentDate);
  const dueDate = normalizeDueDate(input.dueDate, input.documentDate);
  const customer = await deps.repository.getCustomer(input.customerId);
  if (!customer) {
    throw new BillingError("Choose a customer.");
  }
  if (!customer.active) {
    throw new BillingError("Choose an active customer.");
  }
  const templateId = await deps.repository.resolveTemplate(
    input.documentType,
    input.templateId === undefined ? existingTemplateId : input.templateId,
    deps.now(),
  );
  const customFields = snapshotCustomFields(
    await deps.repository.listCustomFields(templateId),
    input.customFields,
    existingCustomFields,
  ).map((field) => ({ ...field, id: `dcf:${identity.id}:${field.key}` }));
  const lines: GstLineInput[] = [];
  for (const line of input.lines) {
    lines.push(await withProductNature(line, deps));
  }
  const context = await productContext(lines, deps);
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
    rules: await deps.repository.listGstRuleVersions(),
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
    dueDate,
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

async function presentDraft(stored: BillingDocument, deps: DocumentDeps): Promise<BillingDocument> {
  if (stored.status !== "draft") {
    return stored;
  }
  const business = await deps.repository.getBusiness();
  const customer = await deps.repository.getCustomer(stored.customerId);
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
  const context = await productContext(lines, deps);
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
    rules: await deps.repository.listGstRuleVersions(),
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
      dueDate: stored.dueDate ?? null,
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
    dueDate: string | null;
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
    dueDate: context.dueDate,
    placeOfSupplyStateId: context.placeOfSupplyStateId,
    gstEnabled: context.gstEnabled,
    reverseCharge: calculated.reverseCharge,
    supplierStateId: calculated.supplierStateId,
    supplierGstRegistered: context.business.gstRegistered,
    supplierGstin: context.business.gstin,
    recipientStateId: calculated.recipientStateId,
    recipientRegistrationType: context.customer.registrationType,
    recipientGstin: context.customer.gstin,
    supplierSnapshot: {
      name: context.business.legalName ?? "",
      address: context.business.address ?? "",
      pinCode: context.business.pinCode ?? null,
      stateId: context.business.stateId,
      phone: context.business.phone ?? null,
      email: context.business.email ?? null,
      gstin: context.business.gstin,
    },
    paymentDetailsSnapshot: context.business.paymentDetails ?? null,
    invoicePreferencesSnapshot: context.business.invoicePreferences ?? null,
    recipientSnapshot: {
      name: context.customer.name ?? "",
      address: context.customer.billingAddress ?? "",
      pinCode: context.customer.pinCode ?? null,
      stateId: context.customer.stateId,
      phone: context.customer.phone ?? null,
      email: context.customer.email ?? null,
      gstin: context.customer.gstin,
    },
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

function normalizeDueDate(dueDate: string | null | undefined, documentDate: string): string | null {
  if (dueDate === undefined || dueDate === null || dueDate === "") {
    return null;
  }
  financialYearOf(dueDate);
  if (dueDate < documentDate) {
    throw new BillingError("The due date cannot be before the document date.");
  }
  return dueDate;
}

async function withProductNature(line: GstLineInput, deps: DocumentDeps): Promise<GstLineInput> {
  const productId = line.productId?.trim();
  if (!productId || line.supplyNature) {
    return line;
  }
  const product = await deps.repository.getProduct(productId);
  if (!product) {
    throw new BillingError("That product was not found.");
  }
  return { ...line, supplyNature: product.type };
}

async function productContext(
  lines: readonly GstLineInput[],
  deps: DocumentDeps,
): Promise<{
  rates: Record<string, string | null>;
  categories: Record<string, TaxCategoryId>;
}> {
  const rates: Record<string, string | null> = {};
  const categories: Record<string, TaxCategoryId> = {};
  for (const line of lines) {
    const productId = line.productId?.trim();
    if (!productId || productId in rates) {
      continue;
    }
    const product = await deps.repository.getProduct(productId);
    if (!product) {
      throw new BillingError("That product was not found.");
    }
    rates[productId] = product.savedGstRatePercent;
    categories[productId] = product.taxCategoryId;
  }
  return { rates, categories };
}

async function requireBusiness(deps: DocumentDeps): Promise<BusinessRef> {
  const business = await deps.repository.getBusiness();
  if (!business) {
    throw new BillingError("Save the business profile before creating a document.");
  }
  return business;
}
