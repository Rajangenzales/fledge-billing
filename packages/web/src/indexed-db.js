import {
  BUILT_IN_TEMPLATES,
  BillingError,
  GST_RULE_VERSIONS,
  ProductError,
  STATE_UTS,
  TAX_CATEGORIES,
  assertRequiredCustomFields,
  calculateGstDocument,
  defaultDocumentPrefix,
  formatDocumentNumber,
} from "@fledge/domain";

const DATABASE_NAME = "fledge-billing";
const DATABASE_VERSION = 3;
const BUSINESS_STORE = "business";
const CUSTOMER_STORE = "customers";
const SAVED_GST_RATE_STORE = "savedGstRates";
const PRODUCT_STORE = "products";
const DOCUMENT_STORE = "documents";
const NUMBER_SERIES_STORE = "numberSeries";

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

  const documentRepository = createDocumentRepository(database, businessRepository);

  return {
    businessRepository,
    customerRepository,
    productRepository,
    documentRepository,
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

function createDocumentRepository(database, businessRepository) {
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
    resolveTemplate(documentType, templateId) {
      return getBusinessId().then((businessId) => {
        if (!businessId) {
          throw new BillingError("Save the business profile before creating a document.");
        }
        const available = BUILT_IN_TEMPLATES.filter(
          (template) => template.documentType === documentType,
        );
        const selected = templateId
          ? available.find((template) => browserTemplateId(businessId, template) === templateId)
          : available.find((template) => template.isDefault);
        if (!selected) {
          throw new BillingError(
            templateId
              ? "That template does not apply to this document."
              : "Choose a template for this document.",
          );
        }
        return browserTemplateId(businessId, selected);
      });
    },
    listCustomFields() {
      return Promise.resolve([]);
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

function browserTemplateId(businessId, template) {
  return `tpl:${businessId}:${template.key}:1`;
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
