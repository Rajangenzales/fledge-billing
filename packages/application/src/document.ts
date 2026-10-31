import type { StateUt } from "@fledge/domain";
import {
  BillingError,
  assertDocumentGstMode,
  assertFinancialYearLabel,
  calculateDocument,
  financialYearOf,
  normalizeSeriesPrefix,
  type CalculatedCharge,
  type CalculatedLine,
  type ChargeInput,
  type DocumentType,
  type LineInput,
} from "@fledge/domain";

export type DocumentStatus = "draft" | "finalized" | "partial" | "paid" | "cancelled";

export type DocumentLine = CalculatedLine & {
  id: string;
};

export type DocumentCharge = CalculatedCharge & {
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
  lines: DocumentLine[];
  charges: DocumentCharge[];
  subtotal: string;
  discountTotal: string;
  taxableTotal: string;
  taxTotal: string;
  grandTotal: string;
  createdAt: string;
  finalizedAt: string | null;
  updatedAt: string;
};

export type NumberSeries = {
  id: string;
  businessId: string;
  documentType: DocumentType;
  financialYear: string;
  prefix: string;
  nextNumber: number;
  padding: number;
  active: boolean;
};

export type DocumentRepository = {
  getBusinessId: () => string | null;
  getCustomer: (id: string) => { id: string; active: boolean } | null;
  getProduct: (id: string) => { id: string } | null;
  list: () => BillingDocument[];
  get: (id: string) => BillingDocument | null;
  insert: (record: BillingDocument) => void;
  replaceDraft: (record: BillingDocument) => void;
  finalize: (id: string, finalizedAt: string) => BillingDocument;
  cancel: (id: string, updatedAt: string) => BillingDocument;
  getNumberSeries: (documentType: DocumentType, financialYear: string) => NumberSeries | null;
  saveNumberSeries: (record: NumberSeries) => void;
  hasIssuedNumber: (documentType: DocumentType, financialYear: string) => boolean;
};

export type DocumentDeps = {
  repository: DocumentRepository;
  states: readonly StateUt[];
  now: () => string;
  createId: () => string;
};

export type SaveDocumentInput = {
  customerId: string;
  documentType: DocumentType;
  documentDate: string;
  placeOfSupplyStateId?: string | null;
  gstEnabled: boolean;
  lines: readonly LineInput[];
  charges?: readonly ChargeInput[];
};

export type SaveNumberSeriesInput = {
  documentType: DocumentType;
  financialYear: string;
  prefix: string;
  nextNumber: number;
  padding: number;
};

export function listDocuments(deps: DocumentDeps): BillingDocument[] {
  return deps.repository.list().map(presentDraft);
}

export function getDocument(id: string, deps: DocumentDeps): BillingDocument | null {
  const stored = deps.repository.get(id);
  return stored ? presentDraft(stored) : null;
}

export function createDocument(input: SaveDocumentInput, deps: DocumentDeps): BillingDocument {
  const businessId = requireBusiness(deps);
  const draft = buildDraft(input, deps, {
    id: deps.createId(),
    businessId,
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
  const draft = buildDraft(input, deps, {
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
  const businessId = requireBusiness(deps);
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
    id: existing?.id ?? seriesId(businessId, input.documentType, financialYear),
    businessId,
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

export function seriesId(businessId: string, documentType: DocumentType, financialYear: string): string {
  return `ns:${businessId}:${documentType}:${financialYear}`;
}

function buildDraft(
  input: SaveDocumentInput,
  deps: DocumentDeps,
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
  if (typeof input.gstEnabled !== "boolean") {
    throw new BillingError("Choose whether GST applies to this document.");
  }
  assertDocumentGstMode(input.documentType, input.gstEnabled);
  const financialYear = financialYearOf(input.documentDate);
  const customer = deps.repository.getCustomer(input.customerId);
  if (!customer) {
    throw new BillingError("Choose a customer.");
  }
  if (!customer.active) {
    throw new BillingError("Choose an active customer.");
  }
  const placeOfSupplyStateId = resolvePlaceOfSupply(
    input.placeOfSupplyStateId,
    input.gstEnabled,
    deps.states,
  );
  for (const line of input.lines ?? []) {
    if (line.productId && line.productId.trim().length > 0 && !deps.repository.getProduct(line.productId.trim())) {
      throw new BillingError("That product was not found.");
    }
  }
  const calculated = calculateDocument({
    gstEnabled: input.gstEnabled,
    lines: input.lines,
    charges: input.charges,
  });
  return {
    ...identity,
    customerId: customer.id,
    documentType: input.documentType,
    financialYear,
    documentDate: input.documentDate,
    placeOfSupplyStateId,
    gstEnabled: input.gstEnabled,
    lines: calculated.lines.map((line) => ({ ...line, id: deps.createId() })),
    charges: calculated.charges.map((charge) => ({ ...charge, id: deps.createId() })),
    subtotal: calculated.subtotal,
    discountTotal: calculated.discountTotal,
    taxableTotal: calculated.taxableTotal,
    taxTotal: calculated.taxTotal,
    grandTotal: calculated.grandTotal,
  };
}

function presentDraft(stored: BillingDocument): BillingDocument {
  if (stored.status !== "draft") {
    return stored;
  }
  const calculated = calculateDocument({
    gstEnabled: stored.gstEnabled,
    lines: stored.lines.map((line) => ({
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
    })),
    charges: stored.charges.map((charge) => ({
      description: charge.description,
      amount: charge.amount,
      taxable: charge.taxable,
    })),
  });
  return {
    ...stored,
    lines: calculated.lines.map((line, index) => ({
      ...line,
      id: stored.lines[index]?.id ?? line.description,
    })),
    charges: calculated.charges.map((charge, index) => ({
      ...charge,
      id: stored.charges[index]?.id ?? charge.description,
    })),
    subtotal: calculated.subtotal,
    discountTotal: calculated.discountTotal,
    taxableTotal: calculated.taxableTotal,
    taxTotal: calculated.taxTotal,
    grandTotal: calculated.grandTotal,
  };
}

function resolvePlaceOfSupply(
  stateId: string | null | undefined,
  gstEnabled: boolean,
  states: readonly StateUt[],
): string | null {
  const present = typeof stateId === "string" && stateId.trim().length > 0;
  if (!gstEnabled) {
    if (present) {
      throw new BillingError("Clear the place of supply when GST is off.");
    }
    return null;
  }
  if (!present || typeof stateId !== "string") {
    throw new BillingError("Choose the place of supply.");
  }
  const state = states.find((candidate) => candidate.id === stateId.trim());
  if (!state?.active) {
    throw new BillingError("Choose an active place of supply.");
  }
  return state.id;
}

function requireBusiness(deps: DocumentDeps): string {
  const businessId = deps.repository.getBusinessId();
  if (!businessId) {
    throw new BillingError("Save the business profile before creating a document.");
  }
  return businessId;
}
