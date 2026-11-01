import { describe, expect, it } from "vitest";
import { GST_RULE_VERSIONS, STATE_UTS } from "@fledge/domain";
import {
  getDocument,
  updateDocument,
  type BillingDocument,
  type DocumentDeps,
} from "./document.js";

function deps(get: DocumentDeps["repository"]["get"]): DocumentDeps {
  return {
    repository: { get } as unknown as DocumentDeps["repository"],
    states: [],
    now: () => "2026-11-01T00:00:00.000Z",
    createId: () => "unused",
  };
}

const finalizedDocument = {
  id: "document-1",
  status: "finalized",
} as BillingDocument;

describe("async document application workflows", () => {
  it("waits for a delayed document read before resolving", async () => {
    let releaseRead!: () => void;
    let signalReadStarted!: () => void;
    const readStarted = new Promise<void>((resolve) => { signalReadStarted = resolve; });
    const readGate = new Promise<void>((resolve) => { releaseRead = resolve; });

    const documentDeps = deps(async () => {
      signalReadStarted();
      await readGate;
      return finalizedDocument;
    });

    let resolved = false;
    const result = getDocument("document-1", documentDeps).then((document) => {
      resolved = true;
      return document;
    });

    await readStarted;
    expect(resolved).toBe(false);

    releaseRead();
    await expect(result).resolves.toBe(finalizedDocument);
    expect(resolved).toBe(true);
  });

  it("propagates document repository read failures", async () => {
    const failure = new Error("document storage unavailable");
    const documentDeps = deps(async () => { throw failure; });

    await expect(getDocument("document-1", documentDeps)).rejects.toBe(failure);
  });

  it("selects a document-type-compatible template when changing a draft type", async () => {
    let resolvedTemplateInput: { documentType: string; templateId: string | null } | undefined;
    const stored = {
      id: "document-1",
      businessId: "business-1",
      customerId: "customer-1",
      status: "draft",
      documentNumber: null,
      documentType: "non_gst_invoice",
      documentDate: "2026-11-01",
      dueDate: null,
      financialYear: "2026-27",
      placeOfSupplyStateId: null,
      gstEnabled: false,
      reverseCharge: false,
      supplierStateId: "IN-KL",
      supplierGstRegistered: false,
      supplierGstin: null,
      recipientStateId: "IN-KL",
      recipientRegistrationType: "unregistered",
      recipientGstin: null,
      lines: [],
      charges: [],
      taxes: [],
      subtotal: "0",
      discountTotal: "0",
      taxableTotal: "0",
      exemptTotal: "0",
      nonGstTotal: "0",
      taxTotal: "0",
      cessTotal: "0",
      roundingResidual: "0",
      grandTotal: "0",
      ruleVersionId: null,
      notices: [],
      templateId: "old-invoice-template",
      customFields: [],
      promotionalOffers: [],
      createdAt: "2026-11-01T00:00:00.000Z",
      finalizedAt: null,
      updatedAt: "2026-11-01T00:00:00.000Z",
    } satisfies BillingDocument;
    const repository = {
      get: async () => stored,
      getBusiness: async () => ({
        id: "business-1",
        stateId: "IN-KL",
        gstRegistered: false,
        gstin: null,
      }),
      getCustomer: async () => ({
        id: "customer-1",
        active: true,
        stateId: "IN-KL",
        registrationType: "unregistered",
        gstin: null,
      }),
      getProduct: async () => null,
      listGstRuleVersions: async () => GST_RULE_VERSIONS,
      resolveTemplate: async (documentType: string, templateId: string | null) => {
        resolvedTemplateInput = { documentType, templateId };
        return "quotation-template";
      },
      listCustomFields: async () => [],
      replaceDraft: async () => undefined,
    } as unknown as DocumentDeps["repository"];
    const documentDeps: DocumentDeps = {
      repository,
      states: STATE_UTS,
      now: () => "2026-11-02T00:00:00.000Z",
      createId: () => "line-1",
    };

    const updated = await updateDocument("document-1", {
      customerId: "customer-1",
      documentType: "quotation",
      documentDate: "2026-11-01",
      dueDate: "2026-11-15",
      gstEnabled: false,
      reverseCharge: false,
      lines: [{
        description: "Notebook",
        quantity: "1",
        unit: "nos",
        rate: "100",
        discountType: "none",
        taxInclusive: false,
        taxCategoryId: "non-gst",
      }],
    }, documentDeps);

    expect(resolvedTemplateInput).toEqual({ documentType: "quotation", templateId: null });
    expect(updated).toMatchObject({
      templateId: "quotation-template",
      dueDate: "2026-11-15",
    });

    await expect(updateDocument("document-1", {
      customerId: "customer-1",
      documentType: "quotation",
      documentDate: "2026-11-01",
      dueDate: "2026-10-31",
      gstEnabled: false,
      reverseCharge: false,
      lines: [{
        description: "Notebook",
        quantity: "1",
        unit: "nos",
        rate: "100",
        discountType: "none",
        taxInclusive: false,
        taxCategoryId: "non-gst",
      }],
    }, documentDeps)).rejects.toThrow(/due date cannot be before/);
  });
});
