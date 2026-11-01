import {
  cancelDocument,
  createCustomer,
  createDocument,
  createProduct,
  createSavedGstRate,
  allocateReceiptToInvoice,
  finalizeDocument,
  getCustomerAdvance,
  getCustomerPaymentActivity,
  getInvoiceSettlement,
  getBusinessProfile,
  getDocument,
  getProduct,
  listCustomers,
  listDocuments,
  listProducts,
  listSavedGstRates,
  listCustomerReceipts,
  listTemplates,
  previewTemplate,
  recordCustomerReceipt,
  recordCustomerRefund,
  renderIssuedDocument,
  renderCustomerReceipt,
  releaseReceiptAllocation,
  reverseCustomerReceipt,
  reverseCustomerRefund,
  reviseTemplate,
  saveBusinessProfile,
  saveNumberSeries,
  setDefaultTemplate,
  updateDocument,
  updateProduct,
  updateSavedGstRate,
} from "@fledge/application/browser";
import { STATE_UTS, gstinCheckCharacter } from "@fledge/domain";
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import {
  BrowserStorageError,
  createBrowserRepositories,
  openFledgeDatabase,
} from "./indexed-db.js";

describe("browser IndexedDB repositories", () => {
  it("persists the business profile and customer across database reopen", async () => {
    const factory = new IDBFactory();
    const firstDatabase = await openFledgeDatabase(factory);
    const firstRepositories = createBrowserRepositories(firstDatabase);
    const businessDeps = {
      repository: firstRepositories.businessRepository,
      states: STATE_UTS,
      now: () => "2026-11-01T00:00:00.000Z",
      createId: () => "business-1",
    };
    const customerDeps = {
      repository: firstRepositories.customerRepository,
      states: STATE_UTS,
      now: () => "2026-11-01T00:01:00.000Z",
      createId: () => "customer-1",
    };

    await saveBusinessProfile(
      {
        legalName: "Fledge Traders",
        displayName: "Fledge",
        address: "Market Road",
        stateId: "IN-KL",
        gstRegistered: false,
      },
      businessDeps,
    );
    await createCustomer(
      {
        name: "Harbour Stores",
        billingAddress: "Beach Road",
        stateId: "IN-KL",
        registrationType: "unregistered",
      },
      customerDeps,
    );
    firstDatabase.close();

    const reopenedDatabase = await openFledgeDatabase(factory);
    const reopenedRepositories = createBrowserRepositories(reopenedDatabase);
    const profile = await getBusinessProfile({
      repository: reopenedRepositories.businessRepository,
      states: STATE_UTS,
    });
    const customers = await listCustomers({
      repository: reopenedRepositories.customerRepository,
      states: STATE_UTS,
    });

    expect(profile).toMatchObject({ id: "business-1", displayName: "Fledge", stateId: "IN-KL" });
    expect(customers).toHaveLength(1);
    expect(customers[0]).toMatchObject({
      id: "customer-1",
      businessId: "business-1",
      name: "Harbour Stores",
      stateUt: { name: "Kerala" },
    });
    reopenedDatabase.close();
  });

  it("persists saved rates and products across database reopen", async () => {
    const factory = new IDBFactory();
    const database = await openFledgeDatabase(factory);
    const repositories = createBrowserRepositories(database);
    await repositories.businessRepository.save({ id: "business-1" });
    const deps = productDeps(repositories.productRepository);
    const rate = await createSavedGstRate({ name: "GST 18", percentage: "18" }, deps);
    const product = await createProduct({
      type: "goods",
      name: "Notebook",
      code: "NB-1",
      hsnSac: "482010",
      unit: "nos",
      defaultPrice: "100.50",
      defaultDiscount: "0",
      taxCategoryId: "taxable",
      savedGstRateId: rate.id,
      taxInclusive: true,
    }, deps);
    database.close();

    const reopenedDatabase = await openFledgeDatabase(factory);
    const reopenedRepositories = createBrowserRepositories(reopenedDatabase);
    const reopenedDeps = productDeps(reopenedRepositories.productRepository);

    expect(await listSavedGstRates(reopenedDeps)).toMatchObject([
      { id: rate.id, businessId: "business-1", percentage: "18" },
    ]);
    expect(await listProducts(reopenedDeps)).toMatchObject([
      { id: product.id, name: "Notebook", savedGstRate: { id: rate.id } },
    ]);
    expect(await getProduct(product.id, reopenedDeps)).toMatchObject({
      code: "NB-1",
      taxCategory: { id: "taxable" },
    });
    reopenedDatabase.close();
  });

  it("persists scoped template revisions, defaults, previews, and document snapshots", async () => {
    const factory = new IDBFactory();
    const workspace = await setupDocumentWorkspace(factory);
    const templateDeps = {
      repository: workspace.repositories.templateRepository,
      now: () => "2026-11-01T00:00:00.000Z",
    };
    const templates = await listTemplates(templateDeps);
    const taxTemplates = templates.filter((template) => template.documentType === "tax_invoice");
    const builtInDefault = taxTemplates.find((template) => template.isDefault);
    const alternative = taxTemplates.find((template) => !template.isDefault);
    expect(builtInDefault).toBeTruthy();
    expect(alternative).toBeTruthy();

    await setDefaultTemplate(alternative.id, templateDeps);
    const revised = await reviseTemplate(alternative.id, {
      sections: [{ key: "custom-details", visible: true }],
      fields: [{ key: "customer_name", label: "Buyer" }],
      customFields: [{
        label: "Purchase order",
        type: "short_text",
        required: true,
      }],
    }, templateDeps);

    expect(revised).toMatchObject({
      id: `tpl:business-1:${alternative.key}:2`,
      version: 2,
      isDefault: true,
      fields: expect.arrayContaining([expect.objectContaining({ key: "customer_name", label: "Buyer" })]),
      customFields: [expect.objectContaining({ key: "purchase-order", label: "Purchase order", required: true })],
    });
    expect(await workspace.repositories.templateRepository.get("another-business", revised.id)).toBeNull();
    await expect(reviseTemplate(revised.id, {
      fields: [{ key: "tax_components", label: "Tax details" }],
    }, templateDeps)).rejects.toThrow(/Keep the label/);

    const preview = await previewTemplate(revised.id, templateDeps);
    expect(preview).toMatchObject({ saved: true, templateId: revised.id, version: 2 });
    expect(preview.sections.flatMap((section) => section.fields))
      .toContainEqual(expect.objectContaining({ label: "Buyer" }));

    const draft = await createDocument({
      ...documentInput(workspace),
      templateId: revised.id,
      customFields: [{ key: "purchase-order", value: "PO-42" }],
    }, workspace.documentDeps);
    expect(draft).toMatchObject({
      templateId: revised.id,
      customFields: [expect.objectContaining({ key: "purchase-order", label: "Purchase order", value: "PO-42" })],
    });
    const finalized = await finalizeDocument(draft.id, workspace.documentDeps);
    await setDefaultTemplate(builtInDefault.id, templateDeps);
    const savedBusiness = await workspace.repositories.businessRepository.get();
    await workspace.repositories.businessRepository.save({
      ...savedBusiness,
      legalName: "Updated Supplier",
      address: "Updated supplier address",
    });
    const savedCustomer = await workspace.repositories.customerRepository.get(workspace.customer.id);
    await workspace.repositories.customerRepository.update({
      ...savedCustomer,
      name: "Updated Customer",
      billingAddress: "Updated customer address",
    });
    const rendered = await renderIssuedDocument(finalized.id, {
      documents: workspace.repositories.documentRepository,
      templates: workspace.repositories.templateRepository,
      states: STATE_UTS,
    });
    expect(rendered.templateId).toBe(revised.id);
    const renderedFields = rendered.sections.flatMap((section) => section.fields);
    expect(renderedFields).toContainEqual(expect.objectContaining({
      key: "purchase-order",
      label: "Purchase order",
      value: "PO-42",
    }));
    expect(renderedFields).toContainEqual(expect.objectContaining({
      key: "supplier_legal_name",
      value: "Fledge Traders",
    }));
    expect(renderedFields).toContainEqual(expect.objectContaining({
      key: "customer_name",
      value: "Harbour Stores",
    }));

    workspace.database.close();
    const reopened = await openFledgeDatabase(factory);
    const reopenedRepositories = createBrowserRepositories(reopened);
    const reopenedTemplates = await listTemplates({
      repository: reopenedRepositories.templateRepository,
      now: () => "2026-11-02T00:00:00.000Z",
    });
    expect(reopenedTemplates).toContainEqual(expect.objectContaining({
      id: revised.id,
      isDefault: false,
      customFields: [expect.objectContaining({ key: "purchase-order" })],
    }));
    reopened.close();
  });

  it("persists idempotent receipts, allocation events, refunds, reversals, and snapshots", async () => {
    const factory = new IDBFactory();
    const workspace = await setupDocumentWorkspace(factory);
    const draft = await createDocument(documentInput(workspace), workspace.documentDeps);
    const invoice = await finalizeDocument(draft.id, workspace.documentDeps);
    const paymentDeps = createPaymentDeps(workspace.repositories);
    const receiptInput = {
      customerId: workspace.customer.id,
      amount: "236",
      paymentDate: "2026-11-01",
      method: "upi",
      reference: "UTR-42",
      notes: "November payment",
      idempotencyKey: "receipt-42",
    };
    const receipt = await recordCustomerReceipt(receiptInput, paymentDeps.receipt);
    const retriedReceipt = await recordCustomerReceipt(receiptInput, paymentDeps.receipt);
    expect(retriedReceipt).toEqual(receipt);
    expect(receipt.identitySnapshot).toMatchObject({
      business: { legalName: "Fledge Traders", displayName: "Fledge" },
      customer: { name: "Harbour Stores", billingAddress: "Beach Road" },
    });
    const changedBusiness = await workspace.repositories.businessRepository.get();
    await workspace.repositories.businessRepository.save({
      ...changedBusiness,
      displayName: "New Business Name",
    });
    const changedCustomer = await workspace.repositories.customerRepository.get(workspace.customer.id);
    await workspace.repositories.customerRepository.update({
      ...changedCustomer,
      name: "New Customer Name",
    });
    await expect(recordCustomerReceipt({
      ...receiptInput,
      amount: "237",
    }, paymentDeps.receipt)).rejects.toThrow(/request key was already used/);

    const allocation = await allocateReceiptToInvoice({
      receiptId: receipt.id,
      invoiceId: invoice.id,
      amount: "100",
      idempotencyKey: "allocation-100",
    }, paymentDeps.allocation);
    expect(allocation).toMatchObject({
      customerId: workspace.customer.id,
      receiptId: receipt.id,
      invoiceId: invoice.id,
      amount: "100",
    });
    await expect(recordCustomerRefund({
      receiptId: receipt.id,
      amount: "10",
      paymentDate: "2026-11-01",
      method: "cash",
      reason: "Incorrect payment",
      idempotencyKey: "refund-too-early",
    }, paymentDeps.adjustment)).rejects.toThrow(/Release the receipt's active invoice allocations/);
    await expect(reverseCustomerReceipt({
      receiptId: receipt.id,
      reason: "Wrong receipt",
      idempotencyKey: "receipt-reversal-too-early",
    }, paymentDeps.adjustment)).rejects.toThrow(/Release the receipt's active invoice allocations/);
    await expect(allocateReceiptToInvoice({
      receiptId: receipt.id,
      invoiceId: invoice.id,
      amount: "137",
      idempotencyKey: "allocation-overrun",
    }, paymentDeps.allocation)).rejects.toThrow(/exceeds the receipt's available balance/);
    expect(await workspace.repositories.allocationRepository.listReceiptEvents(receipt.id)).toHaveLength(1);
    expect(await getInvoiceSettlement(invoice.id, paymentDeps.allocation)).toMatchObject({
      allocatedAmount: "100",
      outstandingAmount: "136",
      paymentStatus: "partially_paid",
    });

    const released = await releaseReceiptAllocation({
      allocationId: allocation.id,
      reason: "Correct allocation",
      idempotencyKey: "release-100",
    }, paymentDeps.allocation);
    expect(await releaseReceiptAllocation({
      allocationId: allocation.id,
      reason: "Correct allocation",
      idempotencyKey: "release-100",
    }, paymentDeps.allocation)).toEqual(released);
    await expect(releaseReceiptAllocation({
      allocationId: allocation.id,
      reason: "Second release",
      idempotencyKey: "release-again",
    }, paymentDeps.allocation)).rejects.toThrow(/already been released/);
    expect(await getInvoiceSettlement(invoice.id, paymentDeps.allocation)).toMatchObject({
      allocatedAmount: "0",
      outstandingAmount: "236",
      paymentStatus: "unpaid",
    });

    const refundInput = {
      receiptId: receipt.id,
      amount: "20",
      paymentDate: "2026-11-02",
      method: "bank_transfer",
      reason: "Customer refund",
      idempotencyKey: "refund-20",
    };
    const refund = await recordCustomerRefund(refundInput, paymentDeps.adjustment);
    expect(await recordCustomerRefund(refundInput, paymentDeps.adjustment)).toEqual(refund);
    await expect(allocateReceiptToInvoice({
      receiptId: receipt.id,
      invoiceId: invoice.id,
      amount: "217",
      idempotencyKey: "allocation-after-refund",
    }, paymentDeps.allocation)).rejects.toThrow(/exceeds the receipt's available balance/);
    await expect(reverseCustomerReceipt({
      receiptId: receipt.id,
      reason: "Wrong receipt",
      idempotencyKey: "receipt-reversal-with-refund",
    }, paymentDeps.adjustment)).rejects.toThrow(/Reverse or resolve the receipt's refunds/);
    const refundReversal = await reverseCustomerRefund({
      refundEventId: refund.id,
      reason: "Refund transfer failed",
      idempotencyKey: "refund-reversal-20",
    }, paymentDeps.adjustment);
    expect(await reverseCustomerRefund({
      refundEventId: refund.id,
      reason: "Refund transfer failed",
      idempotencyKey: "refund-reversal-20",
    }, paymentDeps.adjustment)).toEqual(refundReversal);
    expect(refundReversal).toMatchObject({
      eventType: "reverse_refund",
      customerId: workspace.customer.id,
      receiptId: receipt.id,
      amount: "20",
    });
    const receiptReversal = await reverseCustomerReceipt({
      receiptId: receipt.id,
      reason: "Receipt entered in error",
      idempotencyKey: "receipt-reversal-42",
    }, paymentDeps.adjustment);
    expect(await reverseCustomerReceipt({
      receiptId: receipt.id,
      reason: "Receipt entered in error",
      idempotencyKey: "receipt-reversal-42",
    }, paymentDeps.adjustment)).toEqual(receiptReversal);
    await expect(reverseCustomerReceipt({
      receiptId: receipt.id,
      reason: "A second attempt",
      idempotencyKey: "receipt-reversal-again",
    }, paymentDeps.adjustment)).rejects.toThrow(/already been reversed/);

    const [listed, advance, activity] = await Promise.all([
      listCustomerReceipts(workspace.customer.id, paymentDeps.receipt),
      getCustomerAdvance(workspace.customer.id, paymentDeps.receipt),
      getCustomerPaymentActivity(workspace.customer.id, paymentDeps.activity),
    ]);
    expect(listed).toHaveLength(1);
    expect(advance).toMatchObject({ receiptCount: 1, unallocatedAmount: "0" });
    expect(activity.summary).toMatchObject({
      receiptCount: 1,
      totalReceived: "236",
      totalAllocated: "0",
      totalRefunded: "0",
      totalReversedReceipts: "236",
      unallocatedAdvance: "0",
    });
    expect(activity.entries.map((entry) => entry.type)).toEqual(expect.arrayContaining([
      "receipt", "allocation", "allocation_release", "refund", "refund_reversal", "receipt_reversal",
    ]));
    const printableReceipt = await renderCustomerReceipt(receipt.id, paymentDeps.receipt);
    expect(printableReceipt).toMatchObject({
      businessName: "Fledge",
      customerName: "Harbour Stores",
      amount: "236",
    });
    workspace.database.close();

    const reopened = await openFledgeDatabase(factory);
    const reopenedRepositories = createBrowserRepositories(reopened);
    const reopenedPaymentDeps = createPaymentDeps(reopenedRepositories);
    expect(await listCustomerReceipts(workspace.customer.id, reopenedPaymentDeps.receipt))
      .toHaveLength(1);
    expect((await getCustomerPaymentActivity(
      workspace.customer.id,
      reopenedPaymentDeps.activity,
    )).summary).toMatchObject({
      totalReceived: "236",
      totalAllocated: "0",
      totalReversedReceipts: "236",
    });
    expect(await renderCustomerReceipt(receipt.id, reopenedPaymentDeps.receipt)).toMatchObject({
      businessName: "Fledge",
      customerName: "Harbour Stores",
    });
    reopened.close();
  });

  it("reads customer payment activity from one IndexedDB snapshot", async () => {
    const workspace = await setupDocumentWorkspace(new IDBFactory());
    const draft = await createDocument(documentInput(workspace), workspace.documentDeps);
    const invoice = await finalizeDocument(draft.id, workspace.documentDeps);
    const paymentDeps = createPaymentDeps(workspace.repositories);
    const receipt = await recordCustomerReceipt({
      customerId: workspace.customer.id,
      amount: "236",
      paymentDate: "2026-11-01",
      method: "cash",
      idempotencyKey: "snapshot-receipt",
    }, paymentDeps.receipt);

    const [snapshot] = await Promise.all([
      getCustomerPaymentActivity(workspace.customer.id, paymentDeps.activity),
      allocateReceiptToInvoice({
        receiptId: receipt.id,
        invoiceId: invoice.id,
        amount: "50",
        idempotencyKey: "snapshot-allocation",
      }, paymentDeps.allocation),
    ]);
    expect(snapshot.summary).toMatchObject({ totalReceived: "236", totalAllocated: "0" });
    expect((await getCustomerPaymentActivity(
      workspace.customer.id,
      paymentDeps.activity,
    )).summary.totalAllocated).toBe("50");
    workspace.database.close();
  });

  it("serializes concurrent allocations against the same receipt balance", async () => {
    const workspace = await setupDocumentWorkspace(new IDBFactory());
    const draft = await createDocument(documentInput(workspace), workspace.documentDeps);
    const invoice = await finalizeDocument(draft.id, workspace.documentDeps);
    const paymentDeps = createPaymentDeps(workspace.repositories);
    const receipt = await recordCustomerReceipt({
      customerId: workspace.customer.id,
      amount: "236",
      paymentDate: "2026-11-01",
      method: "upi",
      idempotencyKey: "concurrent-receipt",
    }, paymentDeps.receipt);

    const results = await Promise.allSettled([
      allocateReceiptToInvoice({
        receiptId: receipt.id,
        invoiceId: invoice.id,
        amount: "150",
        idempotencyKey: "concurrent-allocation-a",
      }, paymentDeps.allocation),
      allocateReceiptToInvoice({
        receiptId: receipt.id,
        invoiceId: invoice.id,
        amount: "150",
        idempotencyKey: "concurrent-allocation-b",
      }, paymentDeps.allocation),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(await workspace.repositories.allocationRepository.listReceiptEvents(receipt.id))
      .toHaveLength(1);
    expect(await getInvoiceSettlement(invoice.id, paymentDeps.allocation)).toMatchObject({
      allocatedAmount: "150",
      outstandingAmount: "86",
      paymentStatus: "partially_paid",
    });
    workspace.database.close();
  });

  it("persists and edits a draft document across database reopen", async () => {
    const factory = new IDBFactory();
    const workspace = await setupDocumentWorkspace(factory);
    const draft = await createDocument({
      ...documentInput(workspace),
      dueDate: "2026-11-30",
    }, workspace.documentDeps);
    workspace.database.close();

    const reopened = await openFledgeDatabase(factory);
    const repositories = createBrowserRepositories(reopened);
    const deps = documentDeps(repositories.documentRepository);
    expect(await getDocument(draft.id, deps)).toMatchObject({
      id: draft.id,
      status: "draft",
      customerId: workspace.customer.id,
      dueDate: "2026-11-30",
      lines: [{ productId: workspace.product.id, quantity: "2", taxCategoryId: "taxable" }],
      financialYear: "2026-27",
      templateId: expect.any(String),
    });

    const updated = await updateDocument(
      draft.id,
      { ...documentInput(workspace), documentDate: "2027-03-31" },
      deps,
    );
    expect(updated).toMatchObject({ status: "draft", financialYear: "2026-27" });
    expect(await listDocuments(deps)).toHaveLength(1);
    reopened.close();
  });

  it("recalculates and finalizes atomically using date-based numbering", async () => {
    const factory = new IDBFactory();
    const workspace = await setupDocumentWorkspace(factory);
    const draft = await createDocument(
      {
        ...documentInput(workspace),
        documentDate: "2027-04-01",
        dueDate: "2027-04-15",
      },
      workspace.documentDeps,
    );
    await saveNumberSeries({
      documentType: "tax_invoice",
      financialYear: "2027-28",
      prefix: "BILL",
      nextNumber: 12,
      padding: 4,
    }, workspace.documentDeps);

    const finalized = await finalizeDocument(draft.id, workspace.documentDeps);
    expect(finalized).toMatchObject({
      status: "finalized",
      financialYear: "2027-28",
      dueDate: "2027-04-15",
      documentNumber: "BILL/2027-28/0012",
      grandTotal: "236",
      taxTotal: "36",
      lines: [{ taxableValue: "200" }],
    });
    expect(await workspace.repositories.documentRepository.getNumberSeries(
      "tax_invoice",
      "2027-28",
    )).toMatchObject({ nextNumber: 13 });

    await expect(finalizeDocument(draft.id, workspace.documentDeps))
      .resolves.toMatchObject({ status: "finalized", documentNumber: finalized.documentNumber });
    expect(await workspace.repositories.documentRepository.getNumberSeries(
      "tax_invoice",
      "2027-28",
    )).toMatchObject({ nextNumber: 13 });
    workspace.database.close();

    const reopened = await openFledgeDatabase(factory);
    const reopenedRepositories = createBrowserRepositories(reopened);
    expect(await getDocument(finalized.id, documentDeps(reopenedRepositories.documentRepository)))
      .toMatchObject({
        status: "finalized",
        documentNumber: finalized.documentNumber,
        dueDate: "2027-04-15",
        grandTotal: "236",
      });
    expect(await reopenedRepositories.documentRepository.getNumberSeries(
      "tax_invoice",
      "2027-28",
    )).toMatchObject({ nextNumber: 13 });
    reopened.close();
  });

  it("does not consume a document number when finalization cannot revalidate its product", async () => {
    const workspace = await setupDocumentWorkspace(new IDBFactory());
    const draft = await createDocument(documentInput(workspace), workspace.documentDeps);
    await saveNumberSeries({
      documentType: "tax_invoice",
      financialYear: "2026-27",
      prefix: "BILL",
      nextNumber: 7,
      padding: 4,
    }, workspace.documentDeps);
    const transaction = workspace.database.transaction("products", "readwrite");
    transaction.objectStore("products").delete(workspace.product.id);
    await transactionDone(transaction);

    await expect(finalizeDocument(draft.id, workspace.documentDeps))
      .rejects.toThrow(/product was not found/);
    expect(await requestResult(workspace.database.transaction("documents", "readonly")
      .objectStore("documents").get(draft.id))).toMatchObject({
      status: "draft",
      documentNumber: null,
    });
    expect(await workspace.repositories.documentRepository.getNumberSeries(
      "tax_invoice",
      "2026-27",
    )).toMatchObject({ nextNumber: 7 });
    workspace.database.close();
  });

  it("allocates distinct document numbers for concurrent finalizations", async () => {
    const workspace = await setupDocumentWorkspace(new IDBFactory());
    const first = await createDocument(documentInput(workspace), workspace.documentDeps);
    const second = await createDocument(documentInput(workspace), workspace.documentDeps);

    const finalized = await Promise.all([
      finalizeDocument(first.id, workspace.documentDeps),
      finalizeDocument(second.id, workspace.documentDeps),
    ]);

    expect(finalized.map((document) => document.documentNumber).sort()).toEqual([
      "INV/2026-27/0001",
      "INV/2026-27/0002",
    ]);
    expect(await workspace.repositories.documentRepository.getNumberSeries(
      "tax_invoice",
      "2026-27",
    )).toMatchObject({ nextNumber: 3 });
    workspace.database.close();
  });

  it("rejects missing customers and products without storing a draft", async () => {
    const workspace = await setupDocumentWorkspace(new IDBFactory());
    await expect(createDocument({
      ...documentInput(workspace),
      customerId: "missing-customer",
    }, workspace.documentDeps)).rejects.toThrow(/Choose a customer/);
    await expect(createDocument({
      ...documentInput(workspace),
      lines: documentInput(workspace).lines.map((line) => ({
        ...line,
        productId: "missing-product",
      })),
    }, workspace.documentDeps)).rejects.toThrow(/product was not found/);
    expect(await listDocuments(workspace.documentDeps)).toHaveLength(0);
    workspace.database.close();
  });

  it("cancels drafts and finalized documents without allowing history edits", async () => {
    const workspace = await setupDocumentWorkspace(new IDBFactory());
    const draft = await createDocument(documentInput(workspace), workspace.documentDeps);
    const cancelledDraft = await cancelDocument(draft.id, workspace.documentDeps);
    expect(cancelledDraft.status).toBe("cancelled");
    await expect(updateDocument(draft.id, documentInput(workspace), workspace.documentDeps))
      .rejects.toThrow(/finalized document cannot be changed/);

    const secondDraft = await createDocument(documentInput(workspace), workspace.documentDeps);
    const finalized = await finalizeDocument(secondDraft.id, workspace.documentDeps);
    const cancelledFinal = await cancelDocument(finalized.id, workspace.documentDeps);
    expect(cancelledFinal).toMatchObject({
      status: "cancelled",
      documentNumber: finalized.documentNumber,
      grandTotal: finalized.grandTotal,
    });
    workspace.database.close();
  });

  it("supports updates and activation changes for products and saved rates", async () => {
    const database = await openFledgeDatabase(new IDBFactory());
    const repositories = createBrowserRepositories(database);
    await repositories.businessRepository.save({ id: "business-1" });
    const deps = productDeps(repositories.productRepository);
    const rate = await createSavedGstRate({ name: "GST 18", percentage: "18" }, deps);
    const product = await createProduct({
      type: "goods",
      name: "Notebook",
      unit: "nos",
      defaultPrice: "100",
      taxCategoryId: "taxable",
      savedGstRateId: rate.id,
      taxInclusive: false,
    }, deps);

    const retiredRate = await updateSavedGstRate(
      rate.id,
      { name: "GST 18", percentage: "18", active: false },
      deps,
    );
    const inactiveProduct = await updateProduct(
      product.id,
      {
        type: "goods",
        name: "Notebook updated",
        unit: "nos",
        defaultPrice: "95",
        taxCategoryId: "taxable",
        savedGstRateId: rate.id,
        taxInclusive: false,
        active: false,
      },
      deps,
    );

    expect(retiredRate.active).toBe(false);
    expect(inactiveProduct).toMatchObject({ name: "Notebook updated", active: false });
    await expect(repositories.productRepository.insertProduct({
      ...inactiveProduct,
      id: "new-inactive-rate-product",
      name: "New notebook",
      active: true,
    })).rejects.toThrow(/active saved GST rate/);
    expect(await listProducts(deps)).toEqual([]);
    expect(await listProducts(deps, { includeInactive: true })).toHaveLength(1);
    expect(await listSavedGstRates(deps)).toEqual([]);
    expect(await listSavedGstRates(deps, { includeInactive: true })).toHaveLength(1);
    database.close();
  });

  it("rejects duplicate product codes and saved rate names without partial writes", async () => {
    const database = await openFledgeDatabase(new IDBFactory());
    const repositories = createBrowserRepositories(database);
    await repositories.businessRepository.save({ id: "business-1" });
    const deps = productDeps(repositories.productRepository);
    const rate = await createSavedGstRate({ name: "GST 18", percentage: "18" }, deps);
    const product = await createProduct({
      type: "goods",
      name: "Notebook",
      code: "NB-1",
      unit: "nos",
      defaultPrice: "100",
      taxCategoryId: "taxable",
      savedGstRateId: rate.id,
      taxInclusive: false,
    }, deps);

    await expect(repositories.productRepository.insertProduct({
      ...product,
      id: "duplicate-product",
    })).rejects.toThrow(/code already exists/);
    await expect(repositories.productRepository.insertSavedGstRate({
      ...rate,
      id: "duplicate-rate",
    })).rejects.toThrow(/rate with this name already exists/);

    expect(await listProducts(deps, { includeInactive: true })).toHaveLength(1);
    expect(await listSavedGstRates(deps, { includeInactive: true })).toHaveLength(1);
    database.close();
  });

  it("rejects cross-business product and saved-rate writes", async () => {
    const database = await openFledgeDatabase(new IDBFactory());
    const repositories = createBrowserRepositories(database);
    await repositories.businessRepository.save({ id: "business-1" });
    const deps = productDeps(repositories.productRepository);

    await expect(repositories.productRepository.insertSavedGstRate({
      id: "foreign-rate",
      businessId: "another-business",
      name: "GST 5",
      percentage: "5",
      active: true,
      createdAt: "2026-11-01T00:00:00.000Z",
      updatedAt: "2026-11-01T00:00:00.000Z",
    })).rejects.toThrow(/business profile/);

    const transaction = database.transaction("savedGstRates", "readwrite");
    transaction.objectStore("savedGstRates").add({
      id: "foreign-rate",
      businessId: "another-business",
      name: "Foreign GST 5",
      percentage: "5",
      active: true,
      createdAt: "2026-11-01T00:00:00.000Z",
      updatedAt: "2026-11-01T00:00:00.000Z",
    });
    await transactionDone(transaction);
    await expect(repositories.productRepository.insertProduct({
      id: "foreign-rate-product",
      businessId: "business-1",
      type: "goods",
      name: "Invalid rate reference",
      code: null,
      description: null,
      hsnSac: null,
      unit: "nos",
      defaultPrice: "10",
      defaultDiscount: "0",
      taxCategoryId: "taxable",
      savedGstRateId: "foreign-rate",
      taxInclusive: false,
      active: true,
      createdAt: "2026-11-01T00:00:00.000Z",
      updatedAt: "2026-11-01T00:00:00.000Z",
    })).rejects.toThrow(/saved GST rate/);

    await expect(repositories.productRepository.insertProduct({
      id: "foreign-product",
      businessId: "another-business",
      type: "goods",
      name: "Foreign",
      code: null,
      description: null,
      hsnSac: null,
      unit: "nos",
      defaultPrice: "10",
      defaultDiscount: "0",
      taxCategoryId: "non-gst",
      savedGstRateId: null,
      taxInclusive: false,
      active: true,
      createdAt: "2026-11-01T00:00:00.000Z",
      updatedAt: "2026-11-01T00:00:00.000Z",
    })).rejects.toThrow(/business profile/);
    expect(await getProduct("foreign-product", deps)).toBeNull();
    database.close();
  });

  it("rejects customer writes without an active matching business", async () => {
    const database = await openFledgeDatabase(new IDBFactory());
    const repositories = createBrowserRepositories(database);

    await expect(repositories.customerRepository.insert(customerRecord({
      businessId: "missing-business",
    }))).rejects.toThrow(/business profile/);
    database.close();
  });

  it("rejects stale and cross-business customer updates", async () => {
    const database = await openFledgeDatabase(new IDBFactory());
    const repositories = createBrowserRepositories(database);
    await repositories.businessRepository.save({ id: "business-1" });
    await repositories.customerRepository.insert(customerRecord());

    await expect(repositories.customerRepository.update(customerRecord({
      id: "missing-customer",
    }))).rejects.toThrow(/customer was not found/);
    await expect(repositories.customerRepository.update(customerRecord({
      businessId: "another-business",
    }))).rejects.toThrow(/business profile/);

    expect(await repositories.customerRepository.list()).toHaveLength(1);
    database.close();
  });

  it("aborts a duplicate customer insert without changing stored data", async () => {
    const database = await openFledgeDatabase(new IDBFactory());
    const repositories = createBrowserRepositories(database);
    await repositories.businessRepository.save({ id: "business-1" });
    await repositories.customerRepository.insert(customerRecord());

    await expect(repositories.customerRepository.insert(customerRecord()))
      .rejects.toThrow();

    expect(await repositories.customerRepository.list()).toHaveLength(1);
    database.close();
  });

  it("surfaces quota failures as actionable browser storage errors", async () => {
    const repositories = createBrowserRepositories({
      transaction() {
        throw new DOMException("Storage quota exceeded", "QuotaExceededError");
      },
    });

    await expect(repositories.businessRepository.get()).rejects.toMatchObject({
      name: "BrowserStorageError",
      userMessage: "Storage quota exceeded",
    });
  });

  it("reports when IndexedDB is unavailable", async () => {
    await expect(openFledgeDatabase(null)).rejects.toBeInstanceOf(BrowserStorageError);
  });

  it("closes its connection on version change and preserves existing records", async () => {
    const factory = new IDBFactory();
    const database = await openFledgeDatabase(factory);
    const repositories = createBrowserRepositories(database);
    await repositories.businessRepository.save({ id: "business-1" });

    const upgrade = factory.open("fledge-billing", 6);
    upgrade.onupgradeneeded = () => {
      upgrade.result.createObjectStore("future", { keyPath: "id" });
    };
    const upgradedDatabase = await requestResult(upgrade);

    expect(() => database.transaction("business", "readonly")).toThrow();
    expect(await requestResult(upgradedDatabase.transaction("business", "readonly")
      .objectStore("business").get("business-1"))).toEqual({ id: "business-1" });
    upgradedDatabase.close();
  });

  it("upgrades version 1 customer data to version 5 payment, product, document, and template stores", async () => {
    const factory = new IDBFactory();
    const legacyRequest = factory.open("fledge-billing", 1);
    legacyRequest.onupgradeneeded = () => {
      const database = legacyRequest.result;
      database.createObjectStore("business", { keyPath: "id" });
      const customers = database.createObjectStore("customers", { keyPath: "id" });
      customers.createIndex("businessId", "businessId", { unique: false });
    };
    const legacyDatabase = await requestResult(legacyRequest);
    const transaction = legacyDatabase.transaction(["business", "customers"], "readwrite");
    transaction.objectStore("business").put({ id: "business-1" });
    transaction.objectStore("customers").put(customerRecord());
    await transactionDone(transaction);
    legacyDatabase.close();

    const upgradedDatabase = await openFledgeDatabase(factory);
    const repositories = createBrowserRepositories(upgradedDatabase);
    expect(await repositories.businessRepository.get()).toEqual({ id: "business-1" });
    expect(await repositories.customerRepository.list()).toHaveLength(1);
    expect(upgradedDatabase.objectStoreNames.contains("products")).toBe(true);
    expect(upgradedDatabase.objectStoreNames.contains("savedGstRates")).toBe(true);
    expect(upgradedDatabase.objectStoreNames.contains("documents")).toBe(true);
    expect(upgradedDatabase.objectStoreNames.contains("numberSeries")).toBe(true);
    expect(upgradedDatabase.objectStoreNames.contains("templates")).toBe(true);
    expect(upgradedDatabase.objectStoreNames.contains("customerReceipts")).toBe(true);
    expect(upgradedDatabase.objectStoreNames.contains("paymentAllocationEvents")).toBe(true);
    expect(upgradedDatabase.objectStoreNames.contains("paymentAdjustmentEvents")).toBe(true);
    upgradedDatabase.close();
  });

  it("adds payment stores to a version 4 database without losing template revisions", async () => {
    const factory = new IDBFactory();
    const legacyRequest = factory.open("fledge-billing", 4);
    legacyRequest.onupgradeneeded = () => {
      const database = legacyRequest.result;
      database.createObjectStore("business", { keyPath: "id" });
      for (const name of ["customers", "savedGstRates", "products", "documents", "templates"]) {
        const store = database.createObjectStore(name, { keyPath: "id" });
        store.createIndex("businessId", "businessId", { unique: false });
        if (name === "templates") {
          store.createIndex("businessKeyVersion", ["businessId", "key", "version"], { unique: true });
        }
        if (name === "documents") {
          store.createIndex("businessTypeYear", ["businessId", "documentType", "financialYear"], {
            unique: false,
          });
        }
      }
      const series = database.createObjectStore("numberSeries", { keyPath: "id" });
      series.createIndex("businessTypeYear", ["businessId", "documentType", "financialYear"], {
        unique: true,
      });
    };
    const legacyDatabase = await requestResult(legacyRequest);
    const transaction = legacyDatabase.transaction("templates", "readwrite");
    transaction.objectStore("templates").put({
      id: "tpl:business-1:standard:tax_invoice:1",
      businessId: "business-1",
      key: "standard:tax_invoice",
      version: 1,
      name: "Standard",
    });
    await transactionDone(transaction);
    legacyDatabase.close();

    const upgraded = await openFledgeDatabase(factory);
    expect(await requestResult(upgraded.transaction("templates", "readonly")
      .objectStore("templates").get("tpl:business-1:standard:tax_invoice:1")))
      .toMatchObject({ businessId: "business-1", version: 1 });
    expect(upgraded.objectStoreNames.contains("customerReceipts")).toBe(true);
    expect(upgraded.objectStoreNames.contains("paymentAllocationEvents")).toBe(true);
    expect(upgraded.objectStoreNames.contains("paymentAdjustmentEvents")).toBe(true);
    upgraded.close();
  });

  it("persists additional taxable charges on a billing document", async () => {
    const factory = new IDBFactory();
    const workspace = await setupDocumentWorkspace(factory);
    const draft = await createDocument({
      ...documentInput(workspace),
      charges: [{
        description: "Delivery",
        amount: "50",
        taxable: true,
        taxCategoryId: "taxable",
        gstRatePercent: "18",
      }],
    }, workspace.documentDeps);

    expect(draft.charges).toMatchObject([{
      description: "Delivery",
      amount: "50",
      taxable: true,
      taxCategoryId: "taxable",
      gstRatePercent: "18",
    }]);
    expect(draft.taxes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        documentChargeId: draft.charges[0].id,
        taxType: "CGST",
        amount: "4.50",
      }),
      expect.objectContaining({
        documentChargeId: draft.charges[0].id,
        taxType: "SGST",
        amount: "4.50",
      }),
    ]));
    expect(draft.grandTotal).toBe("295");

    const stored = await getDocument(draft.id, workspace.documentDeps);
    expect(stored?.charges).toMatchObject([{ description: "Delivery", amount: "50" }]);
    workspace.database.close();
  });

  it("rejects a blocked database upgrade and closes the late connection", async () => {
    const factory = new IDBFactory();
    const existing = await requestResult(factory.open("fledge-billing", 1));
    let lateRequest;
    const blockingFactory = {
      open(name, version) {
        lateRequest = factory.open(name, version + 1);
        return lateRequest;
      },
    };
    const openPromise = openFledgeDatabase(blockingFactory);

    await expect(openPromise).rejects.toThrow(/Close other Fledge tabs/);
    existing.close();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(() => lateRequest.result.transaction("business", "readonly")).toThrow();
  });
});

function customerRecord(overrides = {}) {
  return {
    id: "customer-1",
    businessId: "business-1",
    name: "Harbour Stores",
    billingAddress: "Beach Road",
    shippingAddress: null,
    stateId: "IN-KL",
    pinCode: null,
    phone: null,
    email: null,
    registrationType: "unregistered",
    gstin: null,
    notes: null,
    active: true,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    ...overrides,
  };
}

function productDeps(repository) {
  let sequence = 0;
  return {
    repository,
    now: () => "2026-11-01T00:00:00.000Z",
    createId: () => `product-record-${++sequence}`,
  };
}

async function setupDocumentWorkspace(factory) {
  const database = await openFledgeDatabase(factory);
  const repositories = createBrowserRepositories(database);
  const timestamp = "2026-11-01T00:00:00.000Z";
  const business = await saveBusinessProfile(
    {
      legalName: "Fledge Traders",
      displayName: "Fledge",
      address: "Market Road",
      stateId: "IN-KL",
      gstRegistered: true,
      gstin: `32AABCU9603R1Z${gstinCheckCharacter("32AABCU9603R1Z")}`,
    },
    {
      repository: repositories.businessRepository,
      states: STATE_UTS,
      now: () => timestamp,
      createId: () => "business-1",
    },
  );
  const customer = await createCustomer(
    {
      name: "Harbour Stores",
      billingAddress: "Beach Road",
      stateId: "IN-KL",
      registrationType: "unregistered",
    },
    {
      repository: repositories.customerRepository,
      states: STATE_UTS,
      now: () => timestamp,
      createId: () => "customer-1",
    },
  );
  const productDependencies = productDeps(repositories.productRepository);
  const rate = await createSavedGstRate(
    { name: "GST 18", percentage: "18" },
    productDependencies,
  );
  const product = await createProduct(
    {
      type: "goods",
      name: "Notebook",
      code: "NB-1",
      hsnSac: "482010",
      unit: "nos",
      defaultPrice: "100",
      defaultDiscount: "0",
      taxCategoryId: "taxable",
      savedGstRateId: rate.id,
      taxInclusive: false,
    },
    productDependencies,
  );
  const documentDependencies = documentDeps(repositories.documentRepository);
  return {
    database,
    repositories,
    business,
    customer,
    product,
    documentDeps: documentDependencies,
  };
}

function documentDeps(repository) {
  let sequence = 0;
  return {
    repository,
    states: STATE_UTS,
    now: () => "2026-11-01T00:00:00.000Z",
    createId: () => `document-record-${++sequence}`,
  };
}

function createPaymentDeps(repositories) {
  let sequence = 0;
  const dependencies = {
    now: () => "2026-11-01T00:00:00.000Z",
    createId: () => `payment-record-${++sequence}`,
  };
  return {
    receipt: { repository: repositories.customerReceiptRepository, ...dependencies },
    allocation: { repository: repositories.allocationRepository, ...dependencies },
    adjustment: { repository: repositories.paymentAdjustmentRepository, ...dependencies },
    activity: { repository: repositories.customerPaymentActivityRepository },
  };
}

function documentInput(workspace) {
  return {
    customerId: workspace.customer.id,
    documentType: "tax_invoice",
    documentDate: "2026-11-01",
    placeOfSupplyStateId: "IN-KL",
    gstEnabled: true,
    reverseCharge: false,
    lines: [{
      productId: workspace.product.id,
      description: "Notebook",
      hsnSac: "482010",
      quantity: "2",
      unit: "nos",
      rate: "100",
      discountType: "none",
      taxInclusive: false,
      gstRatePercent: "18",
      taxCategoryId: "taxable",
    }],
  };
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onabort = () => reject(transaction.error);
    transaction.onerror = () => reject(transaction.error);
  });
}
