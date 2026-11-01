import { ProductError, TAX_CATEGORIES } from "@fledge/domain";

const DATABASE_NAME = "fledge-billing";
const DATABASE_VERSION = 2;
const BUSINESS_STORE = "business";
const CUSTOMER_STORE = "customers";
const SAVED_GST_RATE_STORE = "savedGstRates";
const PRODUCT_STORE = "products";

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

  return { businessRepository, customerRepository, productRepository };
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
