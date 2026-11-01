import {
  BUILT_IN_TEMPLATES,
  BillingError,
  GST_RULE_VERSIONS,
  ProductError,
  STATE_UTS,
  TAX_CATEGORIES,
  TemplateError,
  assertRequiredCustomFields,
  calculateGstDocument,
  defaultDocumentPrefix,
  formatDocumentNumber,
} from "@fledge/domain";
import {
  AllocationError,
  CustomerReceiptError,
  PaymentAdjustmentError,
} from "@fledge/application/browser";

const DATABASE_NAME = "fledge-billing";
const DATABASE_VERSION = 5;
const BUSINESS_STORE = "business";
const CUSTOMER_STORE = "customers";
const SAVED_GST_RATE_STORE = "savedGstRates";
const PRODUCT_STORE = "products";
const DOCUMENT_STORE = "documents";
const NUMBER_SERIES_STORE = "numberSeries";
const TEMPLATE_STORE = "templates";
const RECEIPT_STORE = "customerReceipts";
const ALLOCATION_STORE = "paymentAllocationEvents";
const PAYMENT_ADJUSTMENT_STORE = "paymentAdjustmentEvents";

export class BrowserStorageError extends Error {
  constructor(message) {
    super(message);
    this.name = "BrowserStorageError";
    this.userMessage = message;
  }
}

export function openFledgeDatabase(factory = globalThis.indexedDB) {
  if (!factory) {
    return Promise.reject(
      new BrowserStorageError("This browser does not support local IndexedDB storage."),
    );
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const request = factory.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(BUSINESS_STORE)) {
        database.createObjectStore(BUSINESS_STORE, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(CUSTOMER_STORE)) {
        const customers = database.createObjectStore(CUSTOMER_STORE, { keyPath: "id" });
        customers.createIndex("businessId", "businessId", { unique: false });
      }
      if (!database.objectStoreNames.contains(SAVED_GST_RATE_STORE)) {
        const rates = database.createObjectStore(SAVED_GST_RATE_STORE, { keyPath: "id" });
        rates.createIndex("businessId", "businessId", { unique: false });
      }
      if (!database.objectStoreNames.contains(PRODUCT_STORE)) {
        const products = database.createObjectStore(PRODUCT_STORE, { keyPath: "id" });
        products.createIndex("businessId", "businessId", { unique: false });
      }
      if (!database.objectStoreNames.contains(DOCUMENT_STORE)) {
        const documents = database.createObjectStore(DOCUMENT_STORE, { keyPath: "id" });
        documents.createIndex("businessId", "businessId", { unique: false });
        documents.createIndex("businessTypeYear", ["businessId", "documentType", "financialYear"], {
          unique: false,
        });
      }
      if (!database.objectStoreNames.contains(NUMBER_SERIES_STORE)) {
        const series = database.createObjectStore(NUMBER_SERIES_STORE, { keyPath: "id" });
        series.createIndex("businessTypeYear", ["businessId", "documentType", "financialYear"], {
          unique: true,
        });
      }
      if (!database.objectStoreNames.contains(TEMPLATE_STORE)) {
        const templates = database.createObjectStore(TEMPLATE_STORE, { keyPath: "id" });
        templates.createIndex("businessId", "businessId", { unique: false });
        templates.createIndex("businessKeyVersion", ["businessId", "key", "version"], {
          unique: true,
        });
      }
      if (!database.objectStoreNames.contains(RECEIPT_STORE)) {
        const receipts = database.createObjectStore(RECEIPT_STORE, { keyPath: "id" });
        receipts.createIndex("businessId", "businessId", { unique: false });
        receipts.createIndex("businessCustomer", ["businessId", "customerId"], { unique: false });
        receipts.createIndex("businessIdempotency", ["businessId", "idempotencyKey"], {
          unique: true,
        });
      }
      if (!database.objectStoreNames.contains(ALLOCATION_STORE)) {
        const allocations = database.createObjectStore(ALLOCATION_STORE, { keyPath: "id" });
        allocations.createIndex("businessId", "businessId", { unique: false });
        allocations.createIndex("businessReceipt", ["businessId", "receiptId"], { unique: false });
        allocations.createIndex("businessInvoice", ["businessId", "invoiceId"], { unique: false });
        allocations.createIndex("businessCustomer", ["businessId", "customerId"], { unique: false });
        allocations.createIndex("businessIdempotency", ["businessId", "idempotencyKey"], {
          unique: true,
        });
        allocations.createIndex("releasedAllocationId", "releasedAllocationId", { unique: true });
      }
      if (!database.objectStoreNames.contains(PAYMENT_ADJUSTMENT_STORE)) {
        const adjustments = database.createObjectStore(PAYMENT_ADJUSTMENT_STORE, { keyPath: "id" });
        adjustments.createIndex("businessId", "businessId", { unique: false });
        adjustments.createIndex("businessReceipt", ["businessId", "receiptId"], { unique: false });
        adjustments.createIndex("businessCustomer", ["businessId", "customerId"], { unique: false });
        adjustments.createIndex("businessIdempotency", ["businessId", "idempotencyKey"], {
          unique: true,
        });
        adjustments.createIndex("reversedReceiptId", "reversedReceiptId", { unique: true });
        adjustments.createIndex("reversedRefundId", "reversedRefundId", { unique: true });
      }
    };
    request.onblocked = () => {
      settled = true;
      reject(new BrowserStorageError("Close other Fledge tabs to finish the local database upgrade."));
    };
    request.onerror = () => {
      settled = true;
      reject(storageError(request.error, "The local database could not be opened."));
    };
    request.onsuccess = () => {
      if (settled) {
        request.result.close();
        return;
      }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}

export function createBrowserRepositories(database) {
  const businessRepository = {
    get() {
      return transact(database, [BUSINESS_STORE], "readonly", (transaction, set, fail) => {
        const request = transaction.objectStore(BUSINESS_STORE).getAll();
        request.onsuccess = () => {
          if (request.result.length > 1) {
            fail(new BrowserStorageError("More than one business profile is stored."));
            return;
          }
          set(request.result[0] ?? null);
        };
      });
    },
    save(record) {
      return transact(database, [BUSINESS_STORE], "readwrite", (transaction, set, fail) => {
        const store = transaction.objectStore(BUSINESS_STORE);
        const request = store.getAll();
        request.onsuccess = () => {
          const current = request.result[0];
          if (request.result.length > 1) {
            fail(new Error("More than one business profile is stored."));
            return;
          }
          if (current && current.id !== record.id) {
            fail(new Error("A business profile is already saved."));
            return;
          }
          store.put(record);
          set(undefined);
        };
      });
    },
  };

  const customerRepository = {
    getBusinessId() {
      return businessRepository.get().then((business) => business?.id ?? null);
    },
    list() {
      return this.getBusinessId().then((businessId) => {
        if (!businessId) return [];
        return transact(database, [CUSTOMER_STORE], "readonly", (transaction, set) => {
          const request = transaction
            .objectStore(CUSTOMER_STORE)
            .index("businessId")
            .getAll(businessId);
          request.onsuccess = () =>
            set(
              request.result.sort(
                (left, right) =>
                  left.name.localeCompare(right.name) || left.id.localeCompare(right.id),
              ),
            );
        });
      });
    },
    get(id) {
      return this.getBusinessId().then((businessId) => {
        if (!businessId) return null;
        return transact(database, [CUSTOMER_STORE], "readonly", (transaction, set) => {
          const request = transaction.objectStore(CUSTOMER_STORE).get(id);
          request.onsuccess = () =>
            set(request.result?.businessId === businessId ? request.result : null);
        });
      });
    },
    insert(record) {
      return writeCustomer(database, record, false);
    },
    update(record) {
      return writeCustomer(database, record, true);
    },
  };

  const productRepository = {
    getBusinessId() {
      return businessRepository.get().then((business) => business?.id ?? null);
    },
    listTaxCategories() {
      return Promise.resolve(TAX_CATEGORIES.map((category) => ({ ...category })));
    },
    listSavedGstRates() {
      return this.getBusinessId().then((businessId) => {
        if (!businessId) return [];
        return transact(database, [SAVED_GST_RATE_STORE], "readonly", (transaction, set) => {
          const request = transaction
            .objectStore(SAVED_GST_RATE_STORE)
            .index("businessId")
            .getAll(businessId);
          request.onsuccess = () =>
            set(request.result.sort(byNameAndId));
        });
      });
    },
    getSavedGstRate(id) {
      return this.getBusinessId().then((businessId) => {
        if (!businessId) return null;
        return transact(database, [SAVED_GST_RATE_STORE], "readonly", (transaction, set) => {
          const request = transaction.objectStore(SAVED_GST_RATE_STORE).get(id);
          request.onsuccess = () =>
            set(request.result?.businessId === businessId ? request.result : null);
        });
      });
    },
    insertSavedGstRate(record) {
      return writeSavedGstRate(database, record, false);
    },
    updateSavedGstRate(record) {
      return writeSavedGstRate(database, record, true);
    },
    listProducts() {
      return this.getBusinessId().then((businessId) => {
        if (!businessId) return [];
        return transact(database, [PRODUCT_STORE], "readonly", (transaction, set) => {
          const request = transaction
            .objectStore(PRODUCT_STORE)
            .index("businessId")
            .getAll(businessId);
          request.onsuccess = () =>
            set(request.result.sort(byNameAndId));
        });
      });
    },
    getProduct(id) {
      return this.getBusinessId().then((businessId) => {
        if (!businessId) return null;
        return transact(database, [PRODUCT_STORE], "readonly", (transaction, set) => {
          const request = transaction.objectStore(PRODUCT_STORE).get(id);
          request.onsuccess = () =>
            set(request.result?.businessId === businessId ? request.result : null);
        });
      });
    },
    insertProduct(record) {
      return writeProduct(database, record, false);
    },
    updateProduct(record) {
      return writeProduct(database, record, true);
    },
  };

  const templateRepository = createTemplateRepository(database, businessRepository);
  const documentRepository = createDocumentRepository(
    database,
    businessRepository,
    templateRepository,
  );
  const paymentRepositories = createBrowserPaymentRepositories(database, businessRepository);

  return {
    businessRepository,
    customerRepository,
    productRepository,
    documentRepository,
    templateRepository,
    ...paymentRepositories,
  };
}

function writeSavedGstRate(database, record, updating) {
  return transact(
    database,
    [BUSINESS_STORE, SAVED_GST_RATE_STORE],
    "readwrite",
    (transaction, set, fail) => {
      const businessRequest = transaction.objectStore(BUSINESS_STORE).getAll();
      businessRequest.onsuccess = () => {
        const business = activeBusiness(businessRequest.result, fail);
        if (!business) return;
        if (!business || business.id !== record.businessId) {
          fail(new ProductError("Save the business profile before adding a product."));
          return;
        }

        const store = transaction.objectStore(SAVED_GST_RATE_STORE);
        const ratesRequest = store.index("businessId").getAll(business.id);
        ratesRequest.onsuccess = () => {
          const rates = ratesRequest.result;
          if (rates.some((rate) => rate.id !== record.id && rate.name === record.name)) {
            fail(new ProductError("A saved GST rate with this name already exists."));
            return;
          }
          if (updating && !rates.some((rate) => rate.id === record.id)) {
            fail(new ProductError("That saved GST rate was not found."));
            return;
          }
          (updating ? store.put(record) : store.add(record));
          set(undefined);
        };
      };
    },
  );
}

function createTemplateRepository(database, businessRepository) {
  const getBusinessId = () =>
    businessRepository.get().then((business) => business?.id ?? null);

  return {
    getBusinessId,
    async getBusiness() {
      const business = await businessRepository.get();
      return business
        ? {
            legalName: business.legalName,
            stateId: business.stateId,
            gstRegistered: business.gstRegistered,
            gstin: business.gstin,
          }
        : null;
    },
    ensureBuiltIns(businessId, now) {
      return transact(database, [BUSINESS_STORE, TEMPLATE_STORE], "readwrite", (transaction, set, fail) => {
        const businessRequest = transaction.objectStore(BUSINESS_STORE).getAll();
        businessRequest.onsuccess = () => {
          const business = activeBusiness(businessRequest.result, fail);
          if (!business) return;
          if (business.id !== businessId) {
            fail(new TemplateError("Save the business profile before choosing a template."));
            return;
          }
          const store = transaction.objectStore(TEMPLATE_STORE);
          const templatesRequest = store.index("businessId").getAll(businessId);
          templatesRequest.onsuccess = () => {
            const existing = templatesRequest.result;
            const keys = new Set(existing.map((template) => `${template.key}:${template.version}`));
            const currentDefaults = new Set(
              existing.filter((template) => template.isDefault && template.active)
                .map((template) => template.documentType),
            );
            for (const builtin of BUILT_IN_TEMPLATES) {
              const identity = `${builtin.key}:1`;
              if (keys.has(identity)) continue;
              const makeDefault = builtin.isDefault && !currentDefaults.has(builtin.documentType);
              const template = browserTemplateRecord(businessId, builtin, now, makeDefault);
              store.add(template);
              if (makeDefault) currentDefaults.add(builtin.documentType);
            }
            set(undefined);
          };
        };
      });
    },
    list(businessId) {
      return transact(database, [TEMPLATE_STORE], "readonly", (transaction, set) => {
        const request = transaction.objectStore(TEMPLATE_STORE).index("businessId").getAll(businessId);
        request.onsuccess = () => set(request.result.sort(compareTemplates));
      });
    },
    get(businessId, id) {
      return transact(database, [TEMPLATE_STORE], "readonly", (transaction, set) => {
        const request = transaction.objectStore(TEMPLATE_STORE).get(id);
        request.onsuccess = () =>
          set(request.result?.businessId === businessId ? request.result : null);
      });
    },
    setDefault(businessId, id, now) {
      return transact(database, [BUSINESS_STORE, TEMPLATE_STORE], "readwrite", (transaction, set, fail) => {
        const businessRequest = transaction.objectStore(BUSINESS_STORE).getAll();
        businessRequest.onsuccess = () => {
          const business = activeBusiness(businessRequest.result, fail);
          if (!business) return;
          if (business.id !== businessId) {
            fail(new TemplateError("That template was not found."));
            return;
          }
          const store = transaction.objectStore(TEMPLATE_STORE);
          const request = store.get(id);
          request.onsuccess = () => {
            const selected = request.result;
            if (selected?.businessId !== businessId || !selected.active) {
              fail(new TemplateError("That template was not found."));
              return;
            }
            const templatesRequest = store.index("businessId").getAll(businessId);
            templatesRequest.onsuccess = () => {
              for (const template of templatesRequest.result) {
                if (template.documentType !== selected.documentType) continue;
                const isDefault = template.id === selected.id;
                if (template.isDefault !== isDefault || template.id === selected.id) {
                  store.put({ ...template, isDefault, updatedAt: now });
                }
              }
              set(undefined);
            };
          };
        };
      });
    },
    saveRevision(businessId, sourceId, sections, fields, customFields, now) {
      return transact(database, [BUSINESS_STORE, TEMPLATE_STORE], "readwrite", (transaction, set, fail) => {
        const businessRequest = transaction.objectStore(BUSINESS_STORE).getAll();
        businessRequest.onsuccess = () => {
          const business = activeBusiness(businessRequest.result, fail);
          if (!business) return;
          if (business.id !== businessId) {
            fail(new TemplateError("That template was not found."));
            return;
          }
          const store = transaction.objectStore(TEMPLATE_STORE);
          const templatesRequest = store.index("businessId").getAll(businessId);
          templatesRequest.onsuccess = () => {
            const existing = templatesRequest.result;
            const source = existing.find((template) => template.id === sourceId && template.active);
            if (!source) {
              fail(new TemplateError("That template was not found."));
              return;
            }
            const latestVersion = existing
              .filter((template) => template.key === source.key)
              .reduce((latest, template) => Math.max(latest, template.version), 0);
            if (latestVersion !== source.version) {
              fail(new TemplateError("Edit the current version of this template."));
              return;
            }
            const version = source.version + 1;
            const id = `tpl:${businessId}:${source.key}:${version}`;
            if (source.isDefault) {
              for (const template of existing) {
                if (template.documentType === source.documentType && template.isDefault) {
                  store.put({ ...template, isDefault: false, updatedAt: now });
                }
              }
            }
            const revision = {
              ...source,
              id,
              version,
              isDefault: source.isDefault,
              active: true,
              sections: sections.map((section) => ({ ...section, id: `${id}:${section.key}` })),
              fields: fields.map((field) => ({ ...field, id: `${id}:${field.key}` })),
              customFields: customFields.map((field) => ({
                ...field,
                id: `tcf:${id}:${field.key}`,
              })),
              createdAt: now,
              updatedAt: now,
            };
            store.add(revision);
            set(id);
          };
        };
      });
    },
  };
}

function browserTemplateRecord(businessId, builtin, now, isDefault) {
  const id = `tpl:${businessId}:${builtin.key}:1`;
  return {
    id,
    businessId,
    key: builtin.key,
    family: builtin.family,
    name: builtin.name,
    purpose: builtin.purpose,
    documentType: builtin.documentType,
    version: 1,
    brandColor: builtin.brandColor,
    fontFamily: builtin.fontFamily,
    density: builtin.density,
    isDefault,
    active: true,
    sections: builtin.sections.map((section) => ({ ...section, id: `${id}:${section.key}` })),
    fields: builtin.fields.map((field) => ({ ...field, id: `${id}:${field.key}` })),
    customFields: [],
    createdAt: now,
    updatedAt: now,
  };
}

function compareTemplates(left, right) {
  return left.documentType.localeCompare(right.documentType) ||
    Number(right.isDefault) - Number(left.isDefault) ||
    left.name.localeCompare(right.name) ||
    left.version - right.version;
}

function createBrowserPaymentRepositories(database, businessRepository) {
  const getBusinessId = () =>
    businessRepository.get().then((business) => business?.id ?? null);

  const customerReceiptRepository = {
    getBusinessId,
    customerExists(customerId, businessId) {
      return transact(database, [BUSINESS_STORE, CUSTOMER_STORE], "readonly", (transaction, set) => {
        const businessRequest = transaction.objectStore(BUSINESS_STORE).getAll();
        const customerRequest = transaction.objectStore(CUSTOMER_STORE).get(customerId);
        whenRequestsComplete([businessRequest, customerRequest], ([businesses, customer]) => {
          set(businesses.length === 1 && businesses[0].id === businessId &&
            customer?.businessId === businessId);
        });
      });
    },
    insert(record) {
      return transact(
        database,
        [BUSINESS_STORE, CUSTOMER_STORE, RECEIPT_STORE],
        "readwrite",
        (transaction, set, fail) => {
          const businessRequest = transaction.objectStore(BUSINESS_STORE).getAll();
          const customerRequest = transaction.objectStore(CUSTOMER_STORE).get(record.customerId);
          const duplicateRequest = transaction.objectStore(RECEIPT_STORE)
            .index("businessIdempotency").get([record.businessId, record.idempotencyKey]);
          whenRequestsComplete(
            [businessRequest, customerRequest, duplicateRequest],
            ([businesses, customer, duplicate]) => {
              const business = paymentBusiness(businesses, fail, CustomerReceiptError);
              if (!business) return;
              if (business.id !== record.businessId) {
                fail(new CustomerReceiptError("Save the business profile before recording a receipt."));
                return;
              }
              if (duplicate) {
                if (!sameReceiptRequest(duplicate, record)) {
                  fail(new CustomerReceiptError(
                    "This receipt request key was already used for different receipt details.",
                  ));
                  return;
                }
                set(duplicate);
                return;
              }
              if (customer?.businessId !== record.businessId) {
                fail(new CustomerReceiptError("Choose a customer belonging to this business."));
                return;
              }
              const identitySnapshot = receiptIdentitySnapshot(business, customer, fail);
              if (!identitySnapshot) return;
              const saved = { ...record, identitySnapshot };
              transaction.objectStore(RECEIPT_STORE).add(saved);
              set(saved);
            },
          );
        },
      );
    },
    list(customerId) {
      return getBusinessId().then((businessId) => {
        if (!businessId) return [];
        return transact(database, [RECEIPT_STORE], "readonly", (transaction, set) => {
          const request = transaction.objectStore(RECEIPT_STORE)
            .index("businessCustomer").getAll([businessId, customerId]);
          request.onsuccess = () => set(request.result.sort(compareReceiptsNewestFirst));
        });
      });
    },
    getById(receiptId, businessId) {
      return transact(database, [RECEIPT_STORE], "readonly", (transaction, set) => {
        const request = transaction.objectStore(RECEIPT_STORE).get(receiptId);
        request.onsuccess = () =>
          set(request.result?.businessId === businessId ? request.result : null);
      });
    },
    total(customerId) {
      return getBusinessId().then((businessId) =>
        sumBusinessCustomerRecords(
          database,
          RECEIPT_STORE,
          businessId,
          customerId,
          "amount",
          CustomerReceiptError,
        ),
      );
    },
    allocatedTotal(customerId) {
      return getBusinessId().then((businessId) => {
        if (!businessId) return "0";
        return transact(database, [ALLOCATION_STORE], "readonly", (transaction, set, fail) => {
          const request = transaction.objectStore(ALLOCATION_STORE)
            .index("businessCustomer").getAll([businessId, customerId]);
          request.onsuccess = () => {
            try {
              set(formatPaise(activeAllocationPaise(request.result)));
            } catch (error) {
              fail(error);
            }
          };
        });
      });
    },
    adjustmentTotals(customerId) {
      return getBusinessId().then((businessId) => {
        if (!businessId) return { refundedAmount: "0", reversedReceiptAmount: "0" };
        return transact(database, [PAYMENT_ADJUSTMENT_STORE], "readonly", (transaction, set, fail) => {
          const request = transaction.objectStore(PAYMENT_ADJUSTMENT_STORE)
            .index("businessCustomer").getAll([businessId, customerId]);
          request.onsuccess = () => {
            try {
              set(adjustmentTotals(request.result));
            } catch (error) {
              fail(error);
            }
          };
        });
      });
    },
  };

  const allocationRepository = {
    getBusinessId,
    allocate(event) {
      return transact(
        database,
        [BUSINESS_STORE, DOCUMENT_STORE, RECEIPT_STORE, ALLOCATION_STORE, PAYMENT_ADJUSTMENT_STORE],
        "readwrite",
        (transaction, set, fail) => {
          const businessRequest = transaction.objectStore(BUSINESS_STORE).getAll();
          const duplicateRequest = transaction.objectStore(ALLOCATION_STORE)
            .index("businessIdempotency").get([event.businessId, event.idempotencyKey]);
          whenRequestsComplete([businessRequest, duplicateRequest], ([businesses, duplicate]) => {
            const business = paymentBusiness(businesses, fail, AllocationError);
            if (!business) return;
            if (business.id !== event.businessId) {
              fail(new AllocationError("Save the business profile before allocating receipts."));
              return;
            }
            if (duplicate) {
              if (duplicate.eventType !== "allocate" || duplicate.receiptId !== event.receiptId ||
                  duplicate.invoiceId !== event.invoiceId || duplicate.amount !== event.amount) {
                fail(new AllocationError(
                  "This allocation request key was already used for different details.",
                ));
                return;
              }
              set(duplicate);
              return;
            }
            const receiptRequest = transaction.objectStore(RECEIPT_STORE).get(event.receiptId);
            const invoiceRequest = transaction.objectStore(DOCUMENT_STORE).get(event.invoiceId);
            const receiptEventsRequest = transaction.objectStore(ALLOCATION_STORE)
              .index("businessReceipt").getAll([event.businessId, event.receiptId]);
            const invoiceEventsRequest = transaction.objectStore(ALLOCATION_STORE)
              .index("businessInvoice").getAll([event.businessId, event.invoiceId]);
            const receiptAdjustmentsRequest = transaction.objectStore(PAYMENT_ADJUSTMENT_STORE)
              .index("businessReceipt").getAll([event.businessId, event.receiptId]);
            whenRequestsComplete(
              [receiptRequest, invoiceRequest, receiptEventsRequest, invoiceEventsRequest, receiptAdjustmentsRequest],
              ([receipt, invoice, receiptEvents, invoiceEvents, adjustments]) => {
                if (receipt?.businessId !== event.businessId) {
                  fail(new AllocationError("That receipt was not found for this business."));
                  return;
                }
                if (invoice?.businessId !== event.businessId) {
                  fail(new AllocationError("That invoice was not found for this business."));
                  return;
                }
                if (receipt.customerId !== invoice.customerId) {
                  fail(new AllocationError("The receipt and invoice must belong to the same customer."));
                  return;
                }
                if (invoice.status !== "finalized") {
                  fail(new AllocationError("Only finalized invoices can receive an allocation."));
                  return;
                }
                if (!["tax_invoice", "non_gst_invoice", "bill_of_supply"].includes(invoice.documentType)) {
                  fail(new AllocationError(
                    "Choose a finalized invoice or bill of supply, not a quotation or receipt.",
                  ));
                  return;
                }
                const customerId = receipt.customerId;
                if (event.customerId && event.customerId !== customerId) {
                  fail(new AllocationError("The receipt customer does not match."));
                  return;
                }
                const receiptAmount = paymentAmountPaise(receipt.amount, fail, AllocationError);
                if (receiptAmount === null) return;
                const activeReceiptAllocations = activeAllocationPaise(receiptEvents);
                const refunded = netRefundedPaise(adjustments);
                const reversed = isReceiptReversed(adjustments) ? receiptAmount : 0n;
                const available = receiptAmount - activeReceiptAllocations - refunded - reversed;
                const requested = paymentAmountPaise(event.amount, fail, AllocationError);
                if (requested === null) return;
                if (requested > available) {
                  fail(new AllocationError("The allocation exceeds the receipt's available balance."));
                  return;
                }
                const invoiceTotal = paymentAmountPaise(invoice.grandTotal, fail, AllocationError);
                const outstanding = invoiceTotal === null
                  ? null
                  : invoiceTotal - activeAllocationPaise(invoiceEvents);
                if (outstanding === null) return;
                if (requested > outstanding) {
                  fail(new AllocationError("The allocation exceeds the invoice's outstanding amount."));
                  return;
                }
                const saved = { ...event, customerId };
                transaction.objectStore(ALLOCATION_STORE).add(saved);
                set(saved);
              },
              fail,
            );
          });
        },
      );
    },
    release(event) {
      return transact(
        database,
        [BUSINESS_STORE, ALLOCATION_STORE],
        "readwrite",
        (transaction, set, fail) => {
          const businessRequest = transaction.objectStore(BUSINESS_STORE).getAll();
          const duplicateRequest = transaction.objectStore(ALLOCATION_STORE)
            .index("businessIdempotency").get([event.businessId, event.idempotencyKey]);
          whenRequestsComplete([businessRequest, duplicateRequest], ([businesses, duplicate]) => {
            const business = paymentBusiness(businesses, fail, AllocationError);
            if (!business) return;
            if (business.id !== event.businessId) {
              fail(new AllocationError("Save the business profile before allocating receipts."));
              return;
            }
            if (duplicate) {
              if (duplicate.eventType !== "release" || duplicate.allocationId !== event.allocationId ||
                  duplicate.reason !== event.reason) {
                fail(new AllocationError(
                  "This release request key was already used for different details.",
                ));
                return;
              }
              set(duplicate);
              return;
            }
            const allocationRequest = transaction.objectStore(ALLOCATION_STORE).get(event.allocationId);
            const releaseRequest = transaction.objectStore(ALLOCATION_STORE)
              .index("releasedAllocationId").get(event.allocationId);
            whenRequestsComplete([allocationRequest, releaseRequest], ([allocation, previousRelease]) => {
              if (allocation?.businessId !== event.businessId || allocation.eventType !== "allocate") {
                fail(new AllocationError("That allocation was not found for this business."));
                return;
              }
              if (previousRelease) {
                fail(new AllocationError("That allocation has already been released."));
                return;
              }
              const saved = {
                ...event,
                customerId: allocation.customerId,
                receiptId: allocation.receiptId,
                invoiceId: allocation.invoiceId,
                amount: allocation.amount,
                releasedAllocationId: allocation.id,
              };
              transaction.objectStore(ALLOCATION_STORE).add(saved);
              set(saved);
            });
          });
        },
      );
    },
    listReceiptEvents(receiptId) {
      return getBusinessId().then((businessId) => {
        if (!businessId) return [];
        return transact(database, [ALLOCATION_STORE], "readonly", (transaction, set) => {
          const request = transaction.objectStore(ALLOCATION_STORE)
            .index("businessReceipt").getAll([businessId, receiptId]);
          request.onsuccess = () => set(request.result.sort(compareRecordedEvents));
        });
      });
    },
    getInvoiceSettlement(invoiceId) {
      return getBusinessId().then((businessId) => {
        if (!businessId) return null;
        return transact(database, [BUSINESS_STORE, DOCUMENT_STORE, ALLOCATION_STORE], "readonly", (transaction, set, fail) => {
          const businessRequest = transaction.objectStore(BUSINESS_STORE).getAll();
          const invoiceRequest = transaction.objectStore(DOCUMENT_STORE).get(invoiceId);
          whenRequestsComplete([businessRequest, invoiceRequest], ([businesses, invoice]) => {
            const business = paymentBusiness(businesses, fail, AllocationError);
            if (!business) return;
            if (business.id !== businessId || invoice?.businessId !== businessId) {
              set(null);
              return;
            }
            if (invoice.status !== "finalized" ||
                !["tax_invoice", "non_gst_invoice", "bill_of_supply"].includes(invoice.documentType)) {
              fail(new AllocationError(
                "Payment settlement is available only for finalized invoices and bills of supply.",
              ));
              return;
            }
            const eventsRequest = transaction.objectStore(ALLOCATION_STORE)
              .index("businessInvoice").getAll([businessId, invoiceId]);
            eventsRequest.onsuccess = () => {
              try {
                const total = paymentAmountPaise(invoice.grandTotal, fail, AllocationError);
                if (total === null) return;
                const allocated = activeAllocationPaise(eventsRequest.result);
                if (allocated > total) {
                  fail(new AllocationError(
                    "Saved allocations exceed the invoice total. Review the payment history.",
                  ));
                  return;
                }
                const outstanding = total - allocated;
                set({
                  invoiceId,
                  currency: "INR",
                  invoiceTotal: formatPaise(total),
                  allocatedAmount: formatPaise(allocated),
                  outstandingAmount: formatPaise(outstanding),
                  paymentStatus: allocated === 0n ? "unpaid" : outstanding === 0n ? "paid" : "partially_paid",
                });
              } catch (error) {
                fail(error instanceof Error ? error : new Error(String(error)));
              }
            };
          }, fail);
        });
      });
    },
    getCustomerAllocatedTotal(customerId) {
      return customerReceiptRepository.allocatedTotal(customerId);
    },
  };

  const paymentAdjustmentRepository = {
    getBusinessId,
    customerExists: customerReceiptRepository.customerExists,
    recordRefund(event) {
      return writeAdjustment(event, "refund");
    },
    reverseReceipt(event) {
      return writeAdjustment(event, "reverse_receipt");
    },
    reverseRefund(event) {
      return writeAdjustment(event, "reverse_refund");
    },
    list(receiptId) {
      return getBusinessId().then((businessId) => {
        if (!businessId) return [];
        return transact(database, [PAYMENT_ADJUSTMENT_STORE], "readonly", (transaction, set) => {
          const request = transaction.objectStore(PAYMENT_ADJUSTMENT_STORE)
            .index("businessReceipt").getAll([businessId, receiptId]);
          request.onsuccess = () => set(request.result.sort(compareRecordedEvents));
        });
      });
    },
    totals(customerId) {
      return customerReceiptRepository.adjustmentTotals(customerId);
    },
  };

  function writeAdjustment(event, type) {
    return transact(
      database,
      [BUSINESS_STORE, RECEIPT_STORE, ALLOCATION_STORE, PAYMENT_ADJUSTMENT_STORE],
      "readwrite",
      (transaction, set, fail) => {
        const businessRequest = transaction.objectStore(BUSINESS_STORE).getAll();
        const duplicateRequest = transaction.objectStore(PAYMENT_ADJUSTMENT_STORE)
          .index("businessIdempotency").get([event.businessId, event.idempotencyKey]);
        whenRequestsComplete([businessRequest, duplicateRequest], ([businesses, duplicate]) => {
          const business = paymentBusiness(businesses, fail, PaymentAdjustmentError);
          if (!business) return;
          if (business.id !== event.businessId) {
            fail(new PaymentAdjustmentError(
              "Save the business profile before recording a refund or reversal.",
            ));
            return;
          }
          if (duplicate) {
            if (!sameAdjustmentRequest(duplicate, event)) {
              fail(new PaymentAdjustmentError(
                "This payment adjustment key was already used for different details.",
              ));
              return;
            }
            set(duplicate);
            return;
          }
          const adjustments = transaction.objectStore(PAYMENT_ADJUSTMENT_STORE);
          if (type === "reverse_refund") {
            const refundRequest = adjustments.get(event.originalEventId);
            const reversedRefundRequest = adjustments.index("reversedRefundId").get(event.originalEventId);
            whenRequestsComplete([refundRequest, reversedRefundRequest], ([refund, reversedRefund]) => {
              if (refund?.businessId !== event.businessId || refund.eventType !== "refund") {
                fail(new PaymentAdjustmentError("That original refund was not found for this business."));
                return;
              }
              if (reversedRefund) {
                fail(new PaymentAdjustmentError("That refund entry has already been reversed."));
                return;
              }
              const saved = {
                ...event,
                customerId: refund.customerId,
                receiptId: refund.receiptId,
                amount: refund.amount,
                reversedRefundId: refund.id,
              };
              adjustments.add(saved);
              set(saved);
            });
            return;
          }
          const receiptRequest = transaction.objectStore(RECEIPT_STORE).get(event.receiptId);
          const allocationRequest = transaction.objectStore(ALLOCATION_STORE)
            .index("businessReceipt").getAll([event.businessId, event.receiptId]);
          const receiptAdjustmentsRequest = adjustments.index("businessReceipt")
            .getAll([event.businessId, event.receiptId]);
          const reversedReceiptRequest = adjustments.index("reversedReceiptId").get(event.receiptId);
          whenRequestsComplete(
            [receiptRequest, allocationRequest, receiptAdjustmentsRequest, reversedReceiptRequest],
            ([receipt, allocations, priorAdjustments, reversedReceipt]) => {
              if (receipt?.businessId !== event.businessId) {
                fail(new PaymentAdjustmentError("That receipt was not found for this business."));
                return;
              }
              if (event.customerId && event.customerId !== receipt.customerId) {
                fail(new PaymentAdjustmentError("The receipt customer does not match."));
                return;
              }
              const activeAllocations = activeAllocationPaise(allocations);
              if (type === "refund") {
                if (isReceiptReversed(priorAdjustments)) {
                  fail(new PaymentAdjustmentError("A reversed receipt cannot be refunded."));
                  return;
                }
                if (activeAllocations > 0n) {
                  fail(new PaymentAdjustmentError(
                    "Release the receipt's active invoice allocations before recording a refund.",
                  ));
                  return;
                }
                const receiptAmount = paymentAmountPaise(receipt.amount, fail, PaymentAdjustmentError);
                const requested = paymentAmountPaise(event.amount, fail, PaymentAdjustmentError);
                if (receiptAmount === null || requested === null) return;
                const refundable = receiptAmount - netRefundedPaise(priorAdjustments);
                if (requested > refundable) {
                  fail(new PaymentAdjustmentError(
                    "The refund exceeds the receipt's remaining refundable amount.",
                  ));
                  return;
                }
              } else {
                if (activeAllocations > 0n) {
                  fail(new PaymentAdjustmentError(
                    "Release the receipt's active invoice allocations before reversing it.",
                  ));
                  return;
                }
                if (netRefundedPaise(priorAdjustments) > 0n) {
                  fail(new PaymentAdjustmentError(
                    "Reverse or resolve the receipt's refunds before reversing the receipt.",
                  ));
                  return;
                }
                if (reversedReceipt || isReceiptReversed(priorAdjustments)) {
                  fail(new PaymentAdjustmentError("That receipt has already been reversed."));
                  return;
                }
              }
              const saved = {
                ...event,
                customerId: receipt.customerId,
                amount: type === "reverse_receipt" ? receipt.amount : event.amount,
                reversedReceiptId: type === "reverse_receipt" ? receipt.id : undefined,
              };
              adjustments.add(saved);
              set(saved);
            },
            fail,
          );
        });
      },
    );
  }

  const customerPaymentActivityRepository = {
    readSnapshot(customerId) {
      return transact(
        database,
        [BUSINESS_STORE, CUSTOMER_STORE, RECEIPT_STORE, ALLOCATION_STORE, PAYMENT_ADJUSTMENT_STORE],
        "readonly",
        (transaction, set, fail) => {
          const businessRequest = transaction.objectStore(BUSINESS_STORE).getAll();
          const customerRequest = transaction.objectStore(CUSTOMER_STORE).get(customerId);
          businessRequest.onsuccess = () => {
            if (businessRequest.result.length === 0) {
              set(null);
              return;
            }
            const business = paymentBusiness(businessRequest.result, fail, PaymentAdjustmentError);
            if (!business) return;
            const businessId = business.id;
            const receipts = transaction.objectStore(RECEIPT_STORE)
              .index("businessCustomer").getAll([businessId, customerId]);
            const allocations = transaction.objectStore(ALLOCATION_STORE)
              .index("businessCustomer").getAll([businessId, customerId]);
            const adjustments = transaction.objectStore(PAYMENT_ADJUSTMENT_STORE)
              .index("businessCustomer").getAll([businessId, customerId]);
            whenRequestsComplete(
              [customerRequest, receipts, allocations, adjustments],
              ([customer, customerReceipts, customerAllocations, customerAdjustments]) => {
                if (customer?.businessId !== businessId) {
                  set(null);
                  return;
                }
                const totalReceived = formatPaise(sumAmounts(customerReceipts.map((item) => item.amount)));
                const totalAllocated = formatPaise(activeAllocationPaise(customerAllocations));
                const totals = adjustmentTotals(customerAdjustments);
                const unallocatedPaise =
                  amountToPaise(totalReceived) -
                  amountToPaise(totalAllocated) -
                  amountToPaise(totals.refundedAmount) -
                  amountToPaise(totals.reversedReceiptAmount);
                if (unallocatedPaise < 0n) {
                  fail(new CustomerReceiptError("Customer allocations exceed the available receipts."));
                  return;
                }
                const unallocatedAdvance = formatPaise(unallocatedPaise);
                set({
                  receipts: customerReceipts.sort(compareReceiptsNewestFirst),
                  allocations: customerAllocations.sort(compareRecordedEvents),
                  adjustments: customerAdjustments.sort(compareRecordedEvents),
                  totalReceived,
                  totalAllocated,
                  adjustmentTotals: totals,
                  unallocatedAdvance,
                });
              },
              fail,
            );
          };
        },
      );
    },
  };

  return {
    customerReceiptRepository,
    allocationRepository,
    paymentAdjustmentRepository,
    customerPaymentActivityRepository,
  };
}

function whenRequestsComplete(requests, callback, onError) {
  const results = new Array(requests.length);
  let completed = 0;
  requests.forEach((request, index) => {
    request.onsuccess = () => {
      results[index] = request.result;
      completed += 1;
      if (completed === requests.length) {
        try {
          callback(results);
        } catch (error) {
          if (!onError) throw error;
          onError(error instanceof Error ? error : new Error(String(error)));
        }
      }
    };
  });
}

function paymentBusiness(businesses, fail, ErrorType) {
  if (businesses.length > 1) {
    fail(new ErrorType("More than one business profile is stored."));
    return null;
  }
  if (!businesses[0]) {
    fail(new ErrorType("Save the business profile before recording payment activity."));
    return null;
  }
  return businesses[0];
}

function receiptIdentitySnapshot(business, customer, fail) {
  const businessState = STATE_UTS.find((state) => state.id === business.stateId);
  const customerState = STATE_UTS.find((state) => state.id === customer.stateId);
  if (!businessState || !customerState) {
    fail(new CustomerReceiptError("Business or customer identity could not be captured."));
    return null;
  }
  if (customer.registrationType !== "registered" && customer.registrationType !== "unregistered") {
    fail(new CustomerReceiptError("The customer registration type is invalid."));
    return null;
  }
  return {
    business: {
      legalName: business.legalName,
      displayName: business.displayName,
      address: business.address,
      stateId: business.stateId,
      stateName: businessState.name,
      pinCode: business.pinCode,
      gstRegistered: business.gstRegistered,
      gstin: business.gstin,
      businessType: business.businessType,
      phone: business.phone,
      email: business.email,
    },
    customer: {
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      gstin: customer.gstin,
      registrationType: customer.registrationType,
      billingAddress: customer.billingAddress,
      shippingAddress: customer.shippingAddress,
      stateId: customer.stateId,
      stateName: customerState.name,
      pinCode: customer.pinCode,
    },
  };
}

function sameReceiptRequest(saved, requested) {
  return saved.businessId === requested.businessId &&
    saved.customerId === requested.customerId &&
    saved.amount === requested.amount &&
    saved.paymentDate === requested.paymentDate &&
    saved.method === requested.method &&
    saved.reference === requested.reference &&
    saved.notes === requested.notes;
}

function sameAdjustmentRequest(saved, requested) {
  if (saved.eventType !== requested.eventType || saved.reason !== requested.reason) return false;
  if (requested.eventType === "reverse_refund") {
    return saved.originalEventId === requested.originalEventId;
  }
  if (saved.receiptId !== requested.receiptId) return false;
  return requested.eventType !== "refund" ||
    (saved.amount === requested.amount &&
      saved.paymentDate === requested.paymentDate &&
      saved.method === requested.method);
}

function compareReceiptsNewestFirst(left, right) {
  return right.paymentDate.localeCompare(left.paymentDate) ||
    right.recordedAt.localeCompare(left.recordedAt) ||
    right.id.localeCompare(left.id);
}

function compareRecordedEvents(left, right) {
  return left.recordedAt.localeCompare(right.recordedAt) || left.id.localeCompare(right.id);
}

function sumBusinessCustomerRecords(database, storeName, businessId, customerId, amountKey, ErrorType) {
  if (!businessId) return Promise.resolve("0");
  return transact(database, [storeName], "readonly", (transaction, set, fail) => {
    const request = transaction.objectStore(storeName)
      .index("businessCustomer").getAll([businessId, customerId]);
    request.onsuccess = () => {
      try {
        set(formatPaise(sumAmounts(request.result.map((record) => record[amountKey]))));
      } catch (error) {
        fail(error instanceof Error ? error : new ErrorType(String(error)));
      }
    };
  });
}

function sumAmounts(values) {
  return values.reduce((total, value) => total + amountToPaise(value), 0n);
}

function paymentAmountPaise(value, fail, ErrorType) {
  try {
    return amountToPaise(value);
  } catch {
    fail(new ErrorType("A saved financial amount is invalid."));
    return null;
  }
}

function amountToPaise(value) {
  if (typeof value !== "string" || !/^\d+(?:\.\d{1,2})?$/.test(value)) {
    throw new CustomerReceiptError("A saved financial amount is invalid.");
  }
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}

function activeAllocationPaise(events) {
  return events.reduce(
    (total, event) => total + (event.eventType === "allocate"
      ? amountToPaise(event.amount)
      : -amountToPaise(event.amount)),
    0n,
  );
}

function netRefundedPaise(events) {
  const reversedRefunds = new Set(
    events.filter((event) => event.eventType === "reverse_refund")
      .map((event) => event.originalEventId),
  );
  return events.reduce((total, event) =>
    event.eventType === "refund" && !reversedRefunds.has(event.id)
      ? total + amountToPaise(event.amount)
      : total, 0n);
}

function isReceiptReversed(events) {
  return events.some((event) => event.eventType === "reverse_receipt");
}

function adjustmentTotals(events) {
  const reversedRefunds = new Set(
    events.filter((event) => event.eventType === "reverse_refund")
      .map((event) => event.originalEventId),
  );
  const refunded = events.reduce((total, event) =>
    event.eventType === "refund" && !reversedRefunds.has(event.id)
      ? total + amountToPaise(event.amount)
      : total, 0n);
  const reversedReceipts = events.reduce((total, event) =>
    event.eventType === "reverse_receipt"
      ? total + amountToPaise(event.amount)
      : total, 0n);
  return {
    refundedAmount: formatPaise(refunded),
    reversedReceiptAmount: formatPaise(reversedReceipts),
  };
}

function formatPaise(value) {
  const whole = value / 100n;
  const fraction = (value % 100n).toString().padStart(2, "0");
  return fraction === "00" ? whole.toString() : `${whole}.${fraction}`;
}

function createDocumentRepository(database, businessRepository, templateRepository) {
  const getBusinessId = () =>
    businessRepository.get().then((business) => business?.id ?? null);

  return {
    getBusinessId,
    async getBusiness() {
      const business = await businessRepository.get();
      return business
        ? {
            id: business.id,
            stateId: business.stateId,
            gstRegistered: business.gstRegistered,
            gstin: business.gstin,
            legalName: business.legalName,
            address: business.address,
            pinCode: business.pinCode,
            phone: business.phone,
            email: business.email,
          }
        : null;
    },
    getCustomer(id) {
      return getBusinessId().then((businessId) => {
        if (!businessId) return null;
        return transact(database, [CUSTOMER_STORE], "readonly", (transaction, set) => {
          const request = transaction.objectStore(CUSTOMER_STORE).get(id);
          request.onsuccess = () => {
            const customer = request.result;
            set(
              customer?.businessId === businessId
                ? {
                    id: customer.id,
                    active: customer.active,
                    stateId: customer.stateId,
                    registrationType: customer.registrationType,
                    gstin: customer.gstin,
                    name: customer.name,
                    billingAddress: customer.billingAddress,
                    shippingAddress: customer.shippingAddress,
                    pinCode: customer.pinCode,
                    phone: customer.phone,
                    email: customer.email,
                  }
                : null,
            );
          };
        });
      });
    },
    getCustomerContact(id) {
      return getBusinessId().then((businessId) => {
        if (!businessId) return null;
        return transact(database, [CUSTOMER_STORE], "readonly", (transaction, set) => {
          const request = transaction.objectStore(CUSTOMER_STORE).get(id);
          request.onsuccess = () => {
            const customer = request.result;
            set(
              customer?.businessId === businessId
                ? { name: customer.name, phone: customer.phone, email: customer.email }
                : null,
            );
          };
        });
      });
    },
    getProduct(id) {
      return getBusinessId().then((businessId) => {
        if (!businessId) return null;
        return transact(
          database,
          [PRODUCT_STORE, SAVED_GST_RATE_STORE],
          "readonly",
          (transaction, set) => {
            const productRequest = transaction.objectStore(PRODUCT_STORE).get(id);
            productRequest.onsuccess = () => {
              const product = productRequest.result;
              if (product?.businessId !== businessId) {
                set(null);
                return;
              }
              if (!product.savedGstRateId) {
                set(productRef(product, null));
                return;
              }
              const rateRequest = transaction
                .objectStore(SAVED_GST_RATE_STORE)
                .get(product.savedGstRateId);
              rateRequest.onsuccess = () => set(productRef(product, rateRequest.result));
            };
          },
        );
      });
    },
    listGstRuleVersions() {
      return Promise.resolve(GST_RULE_VERSIONS.map((rule) => ({ ...rule })));
    },
    list() {
      return getBusinessId().then((businessId) => {
        if (!businessId) return [];
        return transact(database, [DOCUMENT_STORE], "readonly", (transaction, set) => {
          const request = transaction
            .objectStore(DOCUMENT_STORE)
            .index("businessId")
            .getAll(businessId);
          request.onsuccess = () =>
            set(
              request.result.sort(
                (left, right) =>
                  right.documentDate.localeCompare(left.documentDate) ||
                  left.id.localeCompare(right.id),
              ),
            );
        });
      });
    },
    get(id) {
      return getBusinessId().then((businessId) => {
        if (!businessId) return null;
        return transact(database, [DOCUMENT_STORE], "readonly", (transaction, set) => {
          const request = transaction.objectStore(DOCUMENT_STORE).get(id);
          request.onsuccess = () =>
            set(request.result?.businessId === businessId ? request.result : null);
        });
      });
    },
    insert(record) {
      return writeDocument(database, record, false);
    },
    replaceDraft(record) {
      return writeDocument(database, record, true);
    },
    finalize(id, finalizedAt) {
      return finalizeBrowserDocument(database, id, finalizedAt);
    },
    cancel(id, updatedAt) {
      return updateDocumentStatus(database, id, updatedAt);
    },
    getNumberSeries(documentType, financialYear) {
      return getBusinessId().then((businessId) => {
        if (!businessId) return null;
        return transact(database, [NUMBER_SERIES_STORE], "readonly", (transaction, set) => {
          const request = transaction
            .objectStore(NUMBER_SERIES_STORE)
            .index("businessTypeYear")
            .get([businessId, documentType, financialYear]);
          request.onsuccess = () => set(request.result ?? null);
        });
      });
    },
    saveNumberSeries(record) {
      return saveBrowserNumberSeries(database, record);
    },
    hasIssuedNumber(documentType, financialYear) {
      return getBusinessId().then((businessId) => {
        if (!businessId) return false;
        return transact(database, [DOCUMENT_STORE], "readonly", (transaction, set) => {
          const request = transaction
            .objectStore(DOCUMENT_STORE)
            .index("businessTypeYear")
            .getAll([businessId, documentType, financialYear]);
          request.onsuccess = () =>
            set(request.result.some((document) => document.documentNumber !== null));
        });
      });
    },
    resolveTemplate(documentType, templateId, now) {
      return getBusinessId().then(async (businessId) => {
        if (!businessId) {
          throw new BillingError("Save the business profile before creating a document.");
        }
        await templateRepository.ensureBuiltIns(businessId, now);
        const available = (await templateRepository.list(businessId)).filter(
          (template) => template.documentType === documentType && template.active,
        );
        const selected = templateId
          ? available.find((template) => template.id === templateId)
          : available.find((template) => template.isDefault);
        if (!selected) {
          throw new BillingError(
            templateId
              ? "That template does not apply to this document."
              : "Choose a template for this document.",
          );
        }
        return selected.id;
      });
    },
    listCustomFields(templateId) {
      return getBusinessId().then(async (businessId) => {
        if (!businessId) return [];
        const template = await templateRepository.get(businessId, templateId);
        if (!template?.active) return [];
        return template.customFields.map(({ id: _id, ...field }) => field);
      });
    },
  };
}

function productRef(product, savedRate) {
  return {
    id: product.id,
    type: product.type,
    taxCategoryId: product.taxCategoryId,
    savedGstRatePercent:
      savedRate?.businessId === product.businessId ? savedRate.percentage : null,
  };
}

function writeDocument(database, record, replacingDraft) {
  const stores = [
    BUSINESS_STORE,
    CUSTOMER_STORE,
    PRODUCT_STORE,
    DOCUMENT_STORE,
  ];
  return transact(database, stores, "readwrite", (transaction, set, fail) => {
    const businessRequest = transaction.objectStore(BUSINESS_STORE).getAll();
    businessRequest.onsuccess = () => {
      const business = activeBusiness(businessRequest.result, fail);
      if (!business) return;
      if (business.id !== record.businessId) {
        fail(new BillingError("Save the business profile before creating a document."));
        return;
      }

      const documents = transaction.objectStore(DOCUMENT_STORE);
      const existingRequest = documents.get(record.id);
      existingRequest.onsuccess = () => {
        const existing = existingRequest.result;
        if (replacingDraft && (existing?.businessId !== business.id || existing.status !== "draft")) {
          fail(
            existing?.businessId === business.id
              ? new BillingError("A finalized document cannot be changed.")
              : new BillingError("That document was not found."),
          );
          return;
        }
        if (!replacingDraft && existing) {
          fail(new BillingError("A document with this ID already exists."));
          return;
        }

        const customerRequest = transaction.objectStore(CUSTOMER_STORE).get(record.customerId);
        customerRequest.onsuccess = () => {
          if (customerRequest.result?.businessId !== business.id) {
            fail(new BillingError("Choose a customer."));
            return;
          }
          const productRequest = transaction
            .objectStore(PRODUCT_STORE)
            .index("businessId")
            .getAll(business.id);
          productRequest.onsuccess = () => {
            const productIds = new Set(productRequest.result.map((product) => product.id));
            if (record.lines.some((line) => line.productId && !productIds.has(line.productId))) {
              fail(new BillingError("That product was not found."));
              return;
            }
            documents.put(record);
            set(undefined);
          };
        };
      };
    };
  });
}

function saveBrowserNumberSeries(database, record) {
  return transact(
    database,
    [BUSINESS_STORE, DOCUMENT_STORE, NUMBER_SERIES_STORE],
    "readwrite",
    (transaction, set, fail) => {
      const businessRequest = transaction.objectStore(BUSINESS_STORE).getAll();
      businessRequest.onsuccess = () => {
        const business = activeBusiness(businessRequest.result, fail);
        if (!business) return;
        if (business.id !== record.businessId) {
          fail(new BillingError("Save the business profile before creating a document."));
          return;
        }
        const seriesStore = transaction.objectStore(NUMBER_SERIES_STORE);
        const key = [business.id, record.documentType, record.financialYear];
        const seriesRequest = seriesStore.index("businessTypeYear").get(key);
        seriesRequest.onsuccess = () => {
          const existing = seriesRequest.result;
          const documentsRequest = transaction
            .objectStore(DOCUMENT_STORE)
            .index("businessTypeYear")
            .getAll(key);
          documentsRequest.onsuccess = () => {
            const hasIssued = documentsRequest.result.some(
              (document) => document.documentNumber !== null,
            );
            if (existing && hasIssued && record.nextNumber < existing.nextNumber) {
              fail(
                new BillingError(
                  "The next number can only move forward after a document is issued.",
                ),
              );
              return;
            }
            seriesStore.put({ ...record, id: existing?.id ?? record.id });
            set(undefined);
          };
        };
      };
    },
  );
}

function finalizeBrowserDocument(database, id, finalizedAt) {
  return transact(
    database,
    [
      BUSINESS_STORE,
      CUSTOMER_STORE,
      PRODUCT_STORE,
      SAVED_GST_RATE_STORE,
      DOCUMENT_STORE,
      NUMBER_SERIES_STORE,
    ],
    "readwrite",
    (transaction, set, fail) => {
      const businessRequest = transaction.objectStore(BUSINESS_STORE).getAll();
      businessRequest.onsuccess = () => {
        const business = activeBusiness(businessRequest.result, fail);
        if (!business) return;
        const documentStore = transaction.objectStore(DOCUMENT_STORE);
        const documentRequest = documentStore.get(id);
        documentRequest.onsuccess = () => {
          const draft = documentRequest.result;
          if (draft?.businessId !== business.id) {
            fail(new BillingError("That document was not found."));
            return;
          }
          if (draft.status !== "draft") {
            if (draft.status === "finalized") {
              set(draft);
              return;
            }
            fail(new BillingError("Only a draft can be finalized."));
            return;
          }
          try {
            assertRequiredCustomFields(draft.customFields);
          } catch (error) {
            fail(error);
            return;
          }

          const customerRequest = transaction.objectStore(CUSTOMER_STORE).get(draft.customerId);
          customerRequest.onsuccess = () => {
            const customer = customerRequest.result;
            if (customer?.businessId !== business.id) {
              fail(new BillingError("That document was not found."));
              return;
            }
            const productsRequest = transaction
              .objectStore(PRODUCT_STORE)
              .index("businessId")
              .getAll(business.id);
            const ratesRequest = transaction
              .objectStore(SAVED_GST_RATE_STORE)
              .index("businessId")
              .getAll(business.id);
            productsRequest.onsuccess = () => {
              ratesRequest.onsuccess = () => {
                try {
                  const current = recalculateBrowserDocument(
                    draft,
                    business,
                    customer,
                    productsRequest.result,
                    ratesRequest.result,
                  );
                  const seriesStore = transaction.objectStore(NUMBER_SERIES_STORE);
                  const key = [business.id, current.documentType, current.financialYear];
                  const seriesRequest = seriesStore.index("businessTypeYear").get(key);
                  seriesRequest.onsuccess = () => {
                    const series = seriesRequest.result ?? defaultBrowserSeries(
                      business.id,
                      current.documentType,
                      current.financialYear,
                    );
                    const number = formatDocumentNumber(
                      series.prefix,
                      series.financialYear,
                      series.nextNumber,
                      series.padding,
                    );
                    const issuedRequest = documentStore
                      .index("businessTypeYear")
                      .getAll(key);
                    issuedRequest.onsuccess = () => {
                      if (
                        issuedRequest.result.some(
                          (document) => document.documentNumber === number,
                        )
                      ) {
                        fail(new BillingError("That document number has already been issued."));
                        return;
                      }
                      const finalized = {
                        ...current,
                        status: "finalized",
                        documentNumber: number,
                        finalizedAt,
                        updatedAt: finalizedAt,
                      };
                      seriesStore.put({ ...series, nextNumber: series.nextNumber + 1 });
                      documentStore.put(finalized);
                      set(finalized);
                    };
                  };
                } catch (error) {
                  fail(error);
                }
              };
            };
          };
        };
      };
    },
  );
}

function recalculateBrowserDocument(draft, business, customer, products, rates) {
  const productsById = new Map(products.map((product) => [product.id, product]));
  const ratesById = new Map(rates.map((rate) => [rate.id, rate]));
  const productRates = {};
  const productCategories = {};
  for (const line of draft.lines) {
    if (!line.productId || line.productId in productRates) continue;
    const product = productsById.get(line.productId);
    if (!product) throw new BillingError("That product was not found.");
    const rate = product.savedGstRateId ? ratesById.get(product.savedGstRateId) : null;
    productRates[line.productId] =
      rate?.businessId === business.id ? rate.percentage : null;
    productCategories[line.productId] = product.taxCategoryId;
  }
  const calculated = calculateGstDocument({
    documentType: draft.documentType,
    documentDate: draft.documentDate,
    gstEnabled: draft.gstEnabled,
    reverseCharge: draft.reverseCharge,
    placeOfSupplyStateId: draft.placeOfSupplyStateId,
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
    lines: draft.lines.map((line) => ({
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
    })),
    charges: draft.charges.map((charge) => ({
      description: charge.description,
      amount: charge.amount,
      taxable: charge.taxable,
      taxCategoryId: charge.taxCategoryId,
      gstRatePercent: charge.gstRatePercent,
    })),
    rules: GST_RULE_VERSIONS,
    states: STATE_UTS,
    productRates,
    productCategories,
  });
  if (
    calculated.lines.length !== draft.lines.length ||
    calculated.charges.length !== draft.charges.length
  ) {
    throw new BillingError("The GST calculation did not match the document lines.");
  }
  const lineIds = draft.lines.map((line) => line.id);
  const chargeIds = draft.charges.map((charge) => charge.id);
  const taxes = calculated.taxes.map((tax) => {
    const sourceId = tax.source === "line" ? lineIds[tax.sourceIndex] : chargeIds[tax.sourceIndex];
    if (!sourceId) throw new BillingError("The GST calculation did not match the document lines.");
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
  });
  return {
    ...draft,
    reverseCharge: calculated.reverseCharge,
    supplierStateId: calculated.supplierStateId,
    supplierGstRegistered: business.gstRegistered,
    supplierGstin: business.gstin,
    recipientStateId: calculated.recipientStateId,
    recipientRegistrationType: customer.registrationType,
    recipientGstin: customer.gstin,
    lines: calculated.lines.map((line, index) => ({ ...line, id: lineIds[index] })),
    charges: calculated.charges.map((charge, index) => ({ ...charge, id: chargeIds[index] })),
    taxes,
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
  };
}

function defaultBrowserSeries(businessId, documentType, financialYear) {
  return {
    id: `ns:${businessId}:${documentType}:${financialYear}`,
    businessId,
    documentType,
    financialYear,
    prefix: defaultDocumentPrefix(documentType),
    nextNumber: 1,
    padding: 4,
    active: true,
  };
}

function updateDocumentStatus(database, id, updatedAt) {
  return transact(database, [BUSINESS_STORE, DOCUMENT_STORE], "readwrite", (transaction, set, fail) => {
    const businessRequest = transaction.objectStore(BUSINESS_STORE).getAll();
    businessRequest.onsuccess = () => {
      const business = activeBusiness(businessRequest.result, fail);
      if (!business) return;
      const store = transaction.objectStore(DOCUMENT_STORE);
      const request = store.get(id);
      request.onsuccess = () => {
        const document = request.result;
        if (document?.businessId !== business.id) {
          fail(new BillingError("That document was not found."));
          return;
        }
        if (document.status !== "draft" && document.status !== "finalized") {
          fail(new BillingError(
            document.status === "cancelled"
              ? "This document is already cancelled."
              : "This document cannot be cancelled.",
          ));
          return;
        }
        const cancelled = { ...document, status: "cancelled", updatedAt };
        store.put(cancelled);
        set(cancelled);
      };
    };
  });
}

function writeProduct(database, record, updating) {
  return transact(
    database,
    [BUSINESS_STORE, SAVED_GST_RATE_STORE, PRODUCT_STORE],
    "readwrite",
    (transaction, set, fail) => {
      const businessRequest = transaction.objectStore(BUSINESS_STORE).getAll();
      businessRequest.onsuccess = () => {
        const business = activeBusiness(businessRequest.result, fail);
        if (!business) return;
        if (!business || business.id !== record.businessId) {
          fail(new ProductError("Save the business profile before adding a product."));
          return;
        }

        const products = transaction.objectStore(PRODUCT_STORE);
        const productsRequest = products.index("businessId").getAll(business.id);
        productsRequest.onsuccess = () => {
          const existing = productsRequest.result.find((product) => product.id === record.id);
          if (updating && !existing) {
            fail(new ProductError("That product was not found."));
            return;
          }
          if (
            record.code &&
            productsRequest.result.some(
              (product) => product.id !== record.id && product.code === record.code,
            )
          ) {
            fail(new ProductError("A product with this code already exists."));
            return;
          }
          if (!record.savedGstRateId) {
            storeProduct(products, record, updating, set);
            return;
          }

          const rateRequest = transaction
            .objectStore(SAVED_GST_RATE_STORE)
            .get(record.savedGstRateId);
          rateRequest.onsuccess = () => {
            const rate = rateRequest.result;
            if (rate?.businessId !== business.id) {
              fail(new ProductError("The saved GST rate for this item is missing."));
              return;
            }
            if (
              !rate.active &&
              (!updating || existing.savedGstRateId !== rate.id)
            ) {
              fail(new ProductError("Choose an active saved GST rate."));
              return;
            }
            storeProduct(products, record, updating, set);
          };
        };
      };
    },
  );
}

function storeProduct(store, record, updating, set) {
  (updating ? store.put(record) : store.add(record));
  set(undefined);
}

function activeBusiness(records, fail) {
  if (records.length > 1) {
    fail(new ProductError("More than one business profile is stored."));
    return null;
  }
  return records[0] ?? null;
}

function byNameAndId(left, right) {
  return left.name.localeCompare(right.name) || left.id.localeCompare(right.id);
}

function writeCustomer(database, record, updating) {
  return transact(
    database,
    [BUSINESS_STORE, CUSTOMER_STORE],
    "readwrite",
    (transaction, set, fail) => {
      const businessRequest = transaction.objectStore(BUSINESS_STORE).getAll();
      businessRequest.onsuccess = () => {
        if (businessRequest.result.length > 1) {
          fail(new Error("More than one business profile is stored."));
          return;
        }
        const activeBusiness = businessRequest.result[0];
        if (!activeBusiness || activeBusiness.id !== record.businessId) {
          fail(new Error("Save the business profile before adding a customer."));
          return;
        }
        const store = transaction.objectStore(CUSTOMER_STORE);
        if (updating) {
          const existingRequest = store.get(record.id);
          existingRequest.onsuccess = () => {
            const existing = existingRequest.result;
            if (!existing || existing.businessId !== activeBusiness.id) {
              fail(new Error("That customer was not found."));
              return;
            }
            store.put(record);
            set(undefined);
          };
          return;
        }
        store.add(record);
        set(undefined);
      };
    },
  );
}

function transact(database, stores, mode, action) {
  return new Promise((resolve, reject) => {
    let result;
    let failure;
    let settled = false;
    let transaction;
    try {
      transaction = database.transaction(stores, mode);
    } catch (error) {
      reject(storageError(error, "The local database transaction could not be started."));
      return;
    }

    const fail = (error) => {
      failure = error;
      try {
        transaction.abort();
      } catch {
        if (!settled) {
          settled = true;
          reject(error);
        }
      }
    };
    transaction.oncomplete = () => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    transaction.onabort = () => {
      if (settled) return;
      settled = true;
      reject(failure ?? storageError(transaction.error, "The local database transaction was aborted."));
    };
    transaction.onerror = () => {
      if (failure) return;
      failure = storageError(transaction.error, "The local database transaction failed.");
    };

    try {
      action(transaction, (value) => {
        result = value;
      }, fail);
    } catch (error) {
      fail(error);
    }
  });
}

function storageError(error, fallback) {
  if (error instanceof Error && error.message) {
    return new BrowserStorageError(error.message);
  }
  return new BrowserStorageError(fallback);
}
