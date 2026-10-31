/**
 * GST component engine.
 *
 * The seeded rule splits an explicit GST percentage. It does not look up a
 * rate from HSN/SAC, and it does not derive place of supply from IGST Act
 * sections 10 to 13. Those sections stay unresolved until a sourced rule is added.
 *
 * Intra-state and inter-state follow IGST Act sections 7 and 8 once the
 * supplier location and place of supply are both known:
 * https://cbic-gst.gov.in/hindi/IGST-bill-e.html
 *
 * UTGST applies only in the Union territories named in UTGST Act section 2(8):
 * https://cbic-gst.gov.in/hindi/UTGST-bill-e.html
 * Delhi, Puducherry and Jammu and Kashmir are not in that list.
 *
 * Discounts recorded on the invoice reduce the value of supply
 * (CGST Act section 15(3)). Tax is then rounded half-up to paise.
 * CGST Act section 170 rounds tax payable to the government to the nearest
 * rupee; that rounding is not applied to invoice lines.
 */

import { findStateUtById, type StateUt } from "./state-ut.js";
import { assertGstinMatchesState, normalizeGstin } from "./gstin.js";
import { TAX_CATEGORIES, type ProductType, type TaxCategoryId } from "./product.js";
import {
  assertDocumentGstMode,
  calculateDocument,
  financialYearOf,
  type ChargeInput,
  type DiscountType,
  type DocumentType,
  type LineInput,
} from "./billing.js";
import { INR_MINOR_SCALE, Money, Ratio, roundHalfUp } from "./money.js";

export const GST_TAX_TYPES = ["CGST", "SGST", "UTGST", "IGST", "CESS"] as const;
export type GstTaxType = (typeof GST_TAX_TYPES)[number];

export const GST_RULE_STATUSES = ["active", "superseded"] as const;
export type GstRuleStatus = (typeof GST_RULE_STATUSES)[number];

export class GstError extends Error {
  readonly userMessage: string;

  constructor(userMessage: string) {
    super(userMessage);
    this.name = "GstError";
    this.userMessage = userMessage;
  }
}

export type GstRuleVersion = {
  id: string;
  version: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  sourceReference: string;
  status: GstRuleStatus;
  notes: string;
  utgstStateCodes: readonly string[];
};

const GST_STRUCTURE_SOURCE = [
  "IGST Act, 2017, sections 7 and 8",
  "https://cbic-gst.gov.in/hindi/IGST-bill-e.html",
  "CGST Act, 2017, sections 9, 15(3) and 31",
  "https://cbic-gst.gov.in/hindi/CGST-bill-e.html",
  "UTGST Act, 2017, sections 2(8) and 7",
  "https://cbic-gst.gov.in/hindi/UTGST-bill-e.html",
].join("; ");

/**
 * Calculation structure in force from 1 July 2017.
 * UTGST codes: Chandigarh 04, Dadra and Nagar Haveli and Daman and Diu 26,
 * Lakshadweep 31, Andaman and Nicobar Islands 35, Ladakh 38.
 */
export const GST_RULE_VERSIONS: readonly GstRuleVersion[] = [
  {
    id: "gst-structure-2017-07-01",
    version: "2017-07-01",
    effectiveFrom: "2017-07-01",
    effectiveTo: null,
    sourceReference: GST_STRUCTURE_SOURCE,
    status: "active",
    notes:
      "Split an explicit GST percentage equally into CGST and SGST, or CGST and UTGST when the place of supply is a section 2(8) Union territory. A different supplier location and place of supply produces IGST at the full percentage. Round each component half-up to paise. Do not apply section 170 nearest-rupee rounding on the invoice. Do not look up HSN rates or compensation cess.",
    utgstStateCodes: ["04", "26", "31", "35", "38"],
  },
];

export type GstParty = {
  stateId: string;
  gstRegistered: boolean;
  gstin?: string | null;
};

export type GstRecipient = {
  stateId: string;
  registrationType: "registered" | "unregistered";
  gstin?: string | null;
};

export type GstLineInput = LineInput & {
  taxCategoryId: TaxCategoryId;
  supplyNature?: ProductType | null;
  cessRatePercent?: string | null;
};

export type GstChargeInput = ChargeInput & {
  taxCategoryId: TaxCategoryId;
  gstRatePercent?: string | null;
  cessRatePercent?: string | null;
};

export type GstDocumentInput = {
  documentType: DocumentType;
  documentDate: string;
  gstEnabled: boolean;
  reverseCharge: boolean;
  reverseChargeCategory?: string | null;
  placeOfSupplyStateId?: string | null;
  supplier: GstParty;
  recipient: GstRecipient;
  lines: readonly GstLineInput[];
  charges?: readonly GstChargeInput[];
  rules: readonly GstRuleVersion[];
  states: readonly StateUt[];
  productRates?: Readonly<Record<string, string | null>>;
  productCategories?: Readonly<Record<string, TaxCategoryId>>;
};

export type GstCalculatedLine = {
  productId: string | null;
  description: string;
  hsnSac: string | null;
  quantity: string;
  unit: string;
  rate: string;
  discountType: DiscountType;
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

export type GstCalculatedCharge = {
  description: string;
  amount: string;
  taxable: boolean;
  taxCategoryId: TaxCategoryId;
  gstRatePercent: string | null;
  sortOrder: number;
};

export type GstTaxLine = {
  source: "line" | "charge";
  sourceIndex: number;
  taxType: GstTaxType;
  rate: string;
  taxableValue: string;
  amount: string;
  jurisdictionStateId: string;
  ruleVersionId: string;
  reverseCharge: boolean;
};

export type GstDocumentCalculation = {
  lines: GstCalculatedLine[];
  charges: GstCalculatedCharge[];
  taxes: GstTaxLine[];
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
  reverseCharge: boolean;
  supplierStateId: string;
  recipientStateId: string;
  notices: string[];
};

export function selectGstRuleVersion(
  isoDate: string,
  rules: readonly GstRuleVersion[],
): GstRuleVersion {
  financialYearOf(isoDate);
  const matches = rules.filter(
    (rule) =>
      rule.status === "active" &&
      rule.effectiveFrom <= isoDate &&
      (rule.effectiveTo === null || isoDate <= rule.effectiveTo),
  );
  if (matches.length === 0) {
    throw new GstError("No GST rule is effective on this date.");
  }
  if (matches.length > 1) {
    throw new GstError("More than one GST rule is effective on this date.");
  }
  return matches[0]!;
}

export function calculateGstDocument(input: GstDocumentInput): GstDocumentCalculation {
  if (typeof input.gstEnabled !== "boolean") {
    throw new GstError("Choose whether GST applies to this document.");
  }
  if (typeof input.reverseCharge !== "boolean") {
    throw new GstError("Choose whether tax is payable on reverse charge.");
  }
  if (presentText(input.reverseChargeCategory)) {
    throw new GstError(
      "Reverse charge categories are not verified. Set reverse charge only as an explicit yes or no.",
    );
  }
  assertDocumentGstMode(input.documentType, input.gstEnabled);
  financialYearOf(input.documentDate);

  const supplier = resolveParty(input.supplier, input.states, "supplier");
  const recipient = resolveRecipient(input.recipient, input.states);
  const place = resolvePlace(input.placeOfSupplyStateId, input.gstEnabled, input.states);
  assertDocumentTypeRules(input);

  if (!input.gstEnabled || !place) {
    return calculateWithoutGst(input, supplier.state, recipient.state);
  }
  if (input.reverseCharge && input.lines.some((line) => line.taxInclusive)) {
    throw new GstError("Tax-inclusive pricing cannot be used when tax is payable on reverse charge.");
  }

  const rule = selectGstRuleVersion(input.documentDate, input.rules);
  const notices: string[] = [];
  if (!supplier.party.gstRegistered && input.documentType === "quotation") {
    notices.push("The business is not GST registered. This quotation is not a tax invoice.");
  }

  const lines = input.lines.map((line, index) =>
    calculateGstLine(line, index, input, rule, place, notices),
  );
  const charges = (input.charges ?? []).map((charge, index) =>
    calculateGstCharge(charge, index, input, rule, place),
  );
  const taxes = [
    ...lines.flatMap((line) => line.taxes),
    ...charges.flatMap((charge) => charge.taxes),
  ];
  assertTaxInvoiceHasTaxableSupply(input.documentType, lines, charges);

  const subtotal = sum(lines.map((line) => Money.parse(line.line.lineAmount).add(Money.parse(line.line.discountAmount))));
  const discountTotal = sum(lines.map((line) => Money.parse(line.line.discountAmount)));
  const taxableTotal = sum([
    ...lines.filter((line) => countsAsTaxable(line.line.taxCategoryId)).map((line) => Money.parse(line.line.taxableValue)),
    ...charges.filter((charge) => charge.charge.taxable).map((charge) => Money.parse(charge.charge.amount)),
  ]);
  const exemptTotal = sum(
    lines.filter((line) => line.line.taxCategoryId === "exempt").map((line) => Money.parse(line.line.lineAmount)),
  );
  const nonGstTotal = sum([
    ...lines.filter((line) => line.line.taxCategoryId === "non-gst").map((line) => Money.parse(line.line.lineAmount)),
    ...charges.filter((charge) => charge.charge.taxCategoryId === "non-gst").map((charge) => Money.parse(charge.charge.amount)),
  ]);
  const taxTotal = sum(taxes.map((tax) => Money.parse(tax.amount)));
  const residual = sum([
    ...lines.map((line) => line.residual),
    ...charges.map(() => Money.zero()),
  ]);
  const commercialGrand = sum(lines.map((line) => Money.parse(line.line.lineAmount))).add(
    sum(charges.map((charge) => Money.parse(charge.charge.amount))),
  );
  // Inclusive tax is already inside the line amount. Exclusive tax is added
  // unless reverse charge keeps it out of the amount payable to the supplier.
  const payableTax = input.reverseCharge
    ? Money.zero()
    : taxTotal.subtract(
        sum(lines.filter((line) => line.line.taxInclusive).map((line) => line.embeddedCollected)),
      );

  return {
    lines: lines.map((line) => line.line),
    charges: charges.map((charge) => charge.charge),
    taxes,
    subtotal: subtotal.toDecimalString(),
    discountTotal: discountTotal.toDecimalString(),
    taxableTotal: taxableTotal.toDecimalString(),
    exemptTotal: exemptTotal.toDecimalString(),
    nonGstTotal: nonGstTotal.toDecimalString(),
    taxTotal: taxTotal.toDecimalString(),
    cessTotal: "0",
    roundingResidual: residual.toDecimalString(),
    grandTotal: commercialGrand.add(payableTax).toDecimalString(),
    ruleVersionId: rule.id,
    reverseCharge: input.reverseCharge,
    supplierStateId: supplier.state.id,
    recipientStateId: recipient.state.id,
    notices,
  };
}

function calculateWithoutGst(
  input: GstDocumentInput,
  supplierState: StateUt,
  recipientState: StateUt,
): GstDocumentCalculation {
  if (input.reverseCharge) {
    throw new GstError("Reverse charge applies only when GST is enabled.");
  }
  for (const line of input.lines) {
    assertCategory(line.taxCategoryId);
    if (line.taxCategoryId !== "non-gst" && input.documentType !== "bill_of_supply") {
      throw new GstError("Choose a non-GST category when GST is off.");
    }
    if (input.documentType === "bill_of_supply" && line.taxCategoryId !== "exempt" && line.taxCategoryId !== "non-gst") {
      throw new GstError("A bill of supply cannot include a taxable or nil-rated line.");
    }
    if (line.taxInclusive || presentText(line.gstRatePercent)) {
      throw new GstError("Clear the GST rate when GST is off.");
    }
    if (presentText(line.cessRatePercent)) {
      throw new GstError("No verified cess rule is available for this supply.");
    }
  }
  for (const charge of input.charges ?? []) {
    if (charge.taxable || charge.taxCategoryId === "taxable" || presentText(charge.gstRatePercent)) {
      throw new GstError("Clear the GST rate when GST is off.");
    }
  }
  const commercial = calculateDocument({
    gstEnabled: false,
    lines: input.lines.map((line) => ({ ...line, taxInclusive: false, gstRatePercent: null })),
    charges: input.charges,
  });
  const lines = commercial.lines.map((line, index) => ({
    ...line,
    taxCategoryId: input.lines[index]!.taxCategoryId,
    supplyNature: normalizeNature(input.lines[index]!.supplyNature),
    taxableValue: line.lineAmount,
  }));
  const charges = commercial.charges.map((charge, index) => ({
    ...charge,
    taxCategoryId: input.charges?.[index]?.taxCategoryId ?? "non-gst",
    gstRatePercent: null,
  }));
  const exemptTotal = sum(
    lines.filter((line) => line.taxCategoryId === "exempt").map((line) => Money.parse(line.lineAmount)),
  );
  const nonGstTotal = sum([
    ...lines.filter((line) => line.taxCategoryId === "non-gst").map((line) => Money.parse(line.lineAmount)),
    ...charges.filter((charge) => charge.taxCategoryId === "non-gst").map((charge) => Money.parse(charge.amount)),
  ]);
  return {
    lines,
    charges,
    taxes: [],
    subtotal: commercial.subtotal,
    discountTotal: commercial.discountTotal,
    taxableTotal: "0",
    exemptTotal: exemptTotal.toDecimalString(),
    nonGstTotal: nonGstTotal.toDecimalString(),
    taxTotal: "0",
    cessTotal: "0",
    roundingResidual: "0",
    grandTotal: commercial.grandTotal,
    ruleVersionId: null,
    reverseCharge: false,
    supplierStateId: supplierState.id,
    recipientStateId: recipientState.id,
    notices: [],
  };
}

function calculateGstLine(
  input: GstLineInput,
  index: number,
  document: GstDocumentInput,
  rule: GstRuleVersion,
  place: StateUt,
  notices: string[],
): { line: GstCalculatedLine; taxes: GstTaxLine[]; residual: Money; embedded: Money; embeddedCollected: Money } {
  assertCategory(input.taxCategoryId);
  if (presentText(input.cessRatePercent)) {
    throw new GstError("No verified cess rule is available for this supply.");
  }
  const nature = normalizeNature(input.supplyNature);
  const productId = blank(input.productId);
  if (productId && document.productRates && productId in document.productRates) {
    const saved = document.productRates[productId];
    if (saved && input.taxCategoryId === "taxable" && saved !== normalizeRate(input.gstRatePercent)) {
      notices.push(
        `The line rate ${normalizeRate(input.gstRatePercent)} does not match the saved GST rate ${saved}. The invoice uses the line rate.`,
      );
    }
  }
  if (productId && document.productCategories && document.productCategories[productId] && document.productCategories[productId] !== input.taxCategoryId) {
    notices.push("The line tax category does not match the saved product category. The invoice uses the line category.");
  }

  if (input.taxCategoryId === "exempt" || input.taxCategoryId === "non-gst") {
    if (input.taxInclusive || presentText(input.gstRatePercent)) {
      throw new GstError(
        input.taxCategoryId === "exempt"
          ? "Clear the GST rate for an exempt line."
          : "Clear the GST rate for a non-GST line.",
      );
    }
    const commercial = calculateDocument({
      gstEnabled: false,
      lines: [{ ...input, taxInclusive: false, gstRatePercent: null }],
    }).lines[0]!;
    return {
      line: {
        ...commercial,
        taxableValue: "0",
        gstRatePercent: null,
        taxInclusive: false,
        taxCategoryId: input.taxCategoryId,
        supplyNature: nature,
      },
      taxes: [],
      residual: Money.zero(),
      embedded: Money.zero(),
      embeddedCollected: Money.zero(),
    };
  }

  if (input.taxCategoryId === "nil-rated") {
    if (input.taxInclusive) {
      throw new GstError("A nil-rated line cannot include tax in the price.");
    }
    if (presentText(input.gstRatePercent) && normalizeRate(input.gstRatePercent) !== "0") {
      throw new GstError("A nil-rated line uses a zero GST rate.");
    }
  }

  const rate = input.taxCategoryId === "nil-rated" ? "0" : requireRate(input.gstRatePercent);
  const commercial = calculateDocument({
    gstEnabled: true,
    lines: [{ ...input, gstRatePercent: rate, taxInclusive: input.taxInclusive }],
  }).lines[0]!;
  const taxed = taxOnValue({
    taxableValue: commercial.taxableValue,
    ratePercent: rate,
    supplier: resolveSupplierState(document),
    place,
    rule,
    source: "line",
    sourceIndex: index,
    reverseCharge: document.reverseCharge,
  });
  const embedded = input.taxInclusive
    ? Money.parse(commercial.lineAmount).subtract(Money.parse(commercial.taxableValue))
    : Money.zero();
  const residual = input.taxInclusive ? embedded.subtract(taxed.componentSum) : Money.zero();
  return {
    line: {
      ...commercial,
      taxCategoryId: input.taxCategoryId,
      supplyNature: nature,
      gstRatePercent: rate,
    },
    taxes: taxed.taxes,
    residual,
    embedded,
    embeddedCollected: input.taxInclusive ? taxed.componentSum : Money.zero(),
  };
}

function calculateGstCharge(
  input: GstChargeInput,
  index: number,
  document: GstDocumentInput,
  rule: GstRuleVersion,
  place: StateUt,
): { charge: GstCalculatedCharge; taxes: GstTaxLine[] } {
  assertCategory(input.taxCategoryId);
  if (presentText(input.cessRatePercent)) {
    throw new GstError("No verified cess rule is available for this supply.");
  }
  const taxable = input.taxCategoryId === "taxable";
  if (input.taxable !== taxable) {
    throw new GstError("A taxable charge must use the taxable category.");
  }
  const parsed = calculateDocument({
    gstEnabled: false,
    lines: [
      {
        description: input.description,
        quantity: "1",
        unit: "nos",
        rate: input.amount,
        discountType: "none",
        taxInclusive: false,
      },
    ],
  }).lines[0]!;
  if (!taxable) {
    if (presentText(input.gstRatePercent)) {
      throw new GstError("Clear the GST rate for a charge that is not taxable.");
    }
    return {
      charge: {
        description: parsed.description,
        amount: parsed.lineAmount,
        taxable: false,
        taxCategoryId: input.taxCategoryId,
        gstRatePercent: null,
        sortOrder: index,
      },
      taxes: [],
    };
  }
  const rate = requireRate(input.gstRatePercent);
  const taxed = taxOnValue({
    taxableValue: parsed.lineAmount,
    ratePercent: rate,
    supplier: resolveSupplierState(document),
    place,
    rule,
    source: "charge",
    sourceIndex: index,
    reverseCharge: document.reverseCharge,
  });
  return {
    charge: {
      description: parsed.description,
      amount: parsed.lineAmount,
      taxable: true,
      taxCategoryId: "taxable",
      gstRatePercent: rate,
      sortOrder: index,
    },
    taxes: taxed.taxes,
  };
}

function taxOnValue(input: {
  taxableValue: string;
  ratePercent: string;
  supplier: StateUt;
  place: StateUt;
  rule: GstRuleVersion;
  source: "line" | "charge";
  sourceIndex: number;
  reverseCharge: boolean;
}): { taxes: GstTaxLine[]; componentSum: Money } {
  const intra = input.supplier.gstStateCode === input.place.gstStateCode;
  const utgst = intra && input.rule.utgstStateCodes.includes(input.place.gstStateCode);
  const parts: Array<{ taxType: GstTaxType; half: boolean }> = intra
    ? [
        { taxType: "CGST", half: true },
        { taxType: utgst ? "UTGST" : "SGST", half: true },
      ]
    : [{ taxType: "IGST", half: false }];
  const taxes = parts.map((part) => {
    const rate = componentPercent(input.ratePercent, part.half);
    const amount = roundHalfUp(
      Money.parse(input.taxableValue).times(Ratio.percent(rate)),
      INR_MINOR_SCALE,
    );
    return {
      source: input.source,
      sourceIndex: input.sourceIndex,
      taxType: part.taxType,
      rate,
      taxableValue: input.taxableValue,
      amount: amount.toDecimalString(),
      jurisdictionStateId: input.place.id,
      ruleVersionId: input.rule.id,
      reverseCharge: input.reverseCharge,
    } satisfies GstTaxLine;
  });
  return {
    taxes,
    componentSum: sum(taxes.map((tax) => Money.parse(tax.amount))),
  };
}

function resolveSupplierState(document: GstDocumentInput): StateUt {
  const state = findStateUtById(document.supplier.stateId, document.states);
  if (!state?.active) {
    throw new GstError("Choose an active supplier State or Union Territory.");
  }
  return state;
}

function componentPercent(totalPercent: string, half: boolean): string {
  const total = Money.parse(totalPercent);
  return (half ? total.dividedBy(Money.parse("2")) : total).toDecimalString();
}

function assertDocumentTypeRules(input: GstDocumentInput): void {
  if (input.documentType === "tax_invoice" && !input.supplier.gstRegistered) {
    throw new GstError("A tax invoice requires a GST-registered business.");
  }
  if (input.documentType === "bill_of_supply" && !input.supplier.gstRegistered) {
    throw new GstError("A bill of supply requires a GST-registered business.");
  }
}

function assertTaxInvoiceHasTaxableSupply(
  documentType: DocumentType,
  lines: Array<{ line: GstCalculatedLine }>,
  charges: Array<{ charge: GstCalculatedCharge }>,
): void {
  if (documentType !== "tax_invoice") {
    return;
  }
  const hasTaxableSupply =
    lines.some((line) => line.line.taxCategoryId === "taxable" || line.line.taxCategoryId === "nil-rated") ||
    charges.some((charge) => charge.charge.taxable);
  if (!hasTaxableSupply) {
    throw new GstError("Use a bill of supply when the document has no taxable supply.");
  }
}

function countsAsTaxable(category: TaxCategoryId): boolean {
  return category === "taxable" || category === "nil-rated";
}

function resolveParty(
  party: GstParty,
  states: readonly StateUt[],
  role: "supplier" | "recipient",
): { party: GstParty; state: StateUt; gstin: string | null } {
  const state = findStateUtById(party.stateId, states);
  if (!state?.active) {
    throw new GstError(
      role === "supplier"
        ? "Choose an active supplier State or Union Territory."
        : "Choose an active customer State or Union Territory.",
    );
  }
  if (typeof party.gstRegistered !== "boolean") {
    throw new GstError("Choose whether the business is GST-registered.");
  }
  const fail = (message: string): never => {
    throw new GstError(message);
  };
  const gstin = normalizeGstin(party.gstin, fail);
  if (party.gstRegistered && !gstin) {
    throw new GstError("Enter the GSTIN for a GST-registered business.");
  }
  if (!party.gstRegistered && gstin) {
    throw new GstError("Clear the GSTIN when the business is not GST-registered.");
  }
  if (gstin) {
    assertGstinMatchesState(gstin, state, states, fail);
  }
  return { party, state, gstin };
}

function resolveRecipient(
  recipient: GstRecipient,
  states: readonly StateUt[],
): { state: StateUt; gstin: string | null } {
  const state = findStateUtById(recipient.stateId, states);
  if (!state?.active) {
    throw new GstError("Choose an active customer State or Union Territory.");
  }
  if (recipient.registrationType !== "registered" && recipient.registrationType !== "unregistered") {
    throw new GstError("Choose whether the customer is GST-registered.");
  }
  const fail = (message: string): never => {
    throw new GstError(message);
  };
  const gstin = normalizeGstin(recipient.gstin, fail);
  if (recipient.registrationType === "registered" && !gstin) {
    throw new GstError("Enter the customer GSTIN.");
  }
  if (recipient.registrationType === "unregistered" && gstin) {
    throw new GstError("Clear the GSTIN for an unregistered customer.");
  }
  if (gstin) {
    assertGstinMatchesState(gstin, state, states, fail);
  }
  return { state, gstin };
}

function resolvePlace(
  stateId: string | null | undefined,
  gstEnabled: boolean,
  states: readonly StateUt[],
): StateUt | null {
  const present = typeof stateId === "string" && stateId.trim().length > 0;
  if (!gstEnabled) {
    if (present) {
      throw new GstError("Clear the place of supply when GST is off.");
    }
    return null;
  }
  if (!present || typeof stateId !== "string") {
    throw new GstError("Choose the place of supply.");
  }
  const state = findStateUtById(stateId.trim(), states);
  if (!state?.active) {
    throw new GstError("Choose an active place of supply.");
  }
  return state;
}

function requireRate(value: string | null | undefined): string {
  if (!presentText(value)) {
    throw new GstError("Enter the GST percentage.");
  }
  return normalizeRate(value);
}

function normalizeRate(value: string | null | undefined): string {
  if (!presentText(value) || typeof value !== "string") {
    throw new GstError("Enter the GST percentage.");
  }
  let amount: Money;
  try {
    amount = Money.parse(value.trim());
  } catch {
    throw new GstError("Enter the GST percentage.");
  }
  if (amount.isNegative() || amount.compare(Money.parse("100")) > 0) {
    throw new GstError("Enter the GST percentage.");
  }
  const fraction = amount.toDecimalString().split(".")[1] ?? "";
  if (fraction.length > 2) {
    throw new GstError("Enter the GST percentage.");
  }
  return amount.toDecimalString();
}

function normalizeNature(value: ProductType | null | undefined): ProductType | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (value !== "goods" && value !== "service") {
    throw new GstError("Choose goods or service for this line.");
  }
  return value;
}

function assertCategory(value: string): asserts value is TaxCategoryId {
  if (!TAX_CATEGORIES.some((category) => category.id === value)) {
    throw new GstError("Choose a tax category.");
  }
}

function presentText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function blank(value: string | null | undefined): string | null {
  if (!presentText(value) || typeof value !== "string") {
    return null;
  }
  return value.trim();
}

function sum(amounts: Money[]): Money {
  return amounts.reduce((total, amount) => total.add(amount), Money.zero());
}
