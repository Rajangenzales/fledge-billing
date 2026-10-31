import type { NormalizedProductInput, NormalizedSavedGstRate, ProductType, TaxCategoryId } from "@fledge/domain";
import {
  ProductError,
  TAX_CATEGORIES,
  validateProductInput,
  validateSavedGstRate,
  type SaveProductInput,
  type SaveSavedGstRateInput,
} from "@fledge/domain";

export type TaxCategory = {
  id: TaxCategoryId;
  name: string;
  code: string;
};

export type SavedGstRate = NormalizedSavedGstRate & {
  id: string;
  businessId: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Product = NormalizedProductInput & {
  id: string;
  businessId: string;
  taxCategory: TaxCategory;
  savedGstRate: SavedGstRate | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type StoredProduct = NormalizedProductInput & {
  id: string;
  businessId: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ProductRepository = {
  getBusinessId: () => string | null;
  listTaxCategories: () => TaxCategory[];
  listSavedGstRates: () => SavedGstRate[];
  getSavedGstRate: (id: string) => SavedGstRate | null;
  insertSavedGstRate: (record: SavedGstRate) => void;
  updateSavedGstRate: (record: SavedGstRate) => void;
  listProducts: () => StoredProduct[];
  getProduct: (id: string) => StoredProduct | null;
  insertProduct: (record: StoredProduct) => void;
  updateProduct: (record: StoredProduct) => void;
};

export type ProductDeps = {
  repository: ProductRepository;
  now: () => string;
  createId: () => string;
};

export type UpdateProductInput = SaveProductInput & {
  active?: boolean;
};

export type UpdateSavedGstRateInput = SaveSavedGstRateInput & {
  active?: boolean;
};

export function listTaxCategories(deps: ProductDeps): TaxCategory[] {
  return [...deps.repository.listTaxCategories()].sort(
    (left, right) => categoryOrder(left.id) - categoryOrder(right.id),
  );
}

function categoryOrder(id: TaxCategoryId): number {
  const index = TAX_CATEGORIES.findIndex((category) => category.id === id);
  return index === -1 ? TAX_CATEGORIES.length : index;
}

export function listSavedGstRates(
  deps: ProductDeps,
  options: { includeInactive?: boolean } = {},
): SavedGstRate[] {
  return deps.repository
    .listSavedGstRates()
    .filter((rate) => options.includeInactive || rate.active);
}

export function createSavedGstRate(input: SaveSavedGstRateInput, deps: ProductDeps): SavedGstRate {
  const businessId = requireBusiness(deps);
  const normalized = validateSavedGstRate(input);
  assertUniqueRateName(normalized.name, null, deps);
  const timestamp = deps.now();
  const record: SavedGstRate = {
    ...normalized,
    id: deps.createId(),
    businessId,
    active: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  deps.repository.insertSavedGstRate(record);
  return record;
}

export function updateSavedGstRate(
  id: string,
  input: UpdateSavedGstRateInput,
  deps: ProductDeps,
): SavedGstRate {
  const existing = deps.repository.getSavedGstRate(id);
  if (!existing) {
    throw new ProductError("That saved GST rate was not found.");
  }
  const normalized = validateSavedGstRate(input);
  assertUniqueRateName(normalized.name, existing.id, deps);
  const record: SavedGstRate = {
    ...normalized,
    id: existing.id,
    businessId: existing.businessId,
    active: input.active ?? existing.active,
    createdAt: existing.createdAt,
    updatedAt: deps.now(),
  };
  deps.repository.updateSavedGstRate(record);
  return record;
}

export function listProducts(
  deps: ProductDeps,
  options: { includeInactive?: boolean } = {},
): Product[] {
  return deps.repository
    .listProducts()
    .filter((product) => options.includeInactive || product.active)
    .map((product) => toProduct(product, deps));
}

export function getProduct(id: string, deps: ProductDeps): Product | null {
  const stored = deps.repository.getProduct(id);
  if (!stored) {
    return null;
  }
  return toProduct(stored, deps);
}

export function createProduct(input: SaveProductInput, deps: ProductDeps): Product {
  const businessId = requireBusiness(deps);
  const savedRate = input.savedGstRateId ? deps.repository.getSavedGstRate(input.savedGstRateId) : null;
  const normalized = validateProductInput(input, savedRate);
  assertUniqueCode(normalized.code, null, deps);
  const timestamp = deps.now();
  const stored: StoredProduct = {
    ...normalized,
    id: deps.createId(),
    businessId,
    active: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  deps.repository.insertProduct(stored);
  return toProduct(stored, deps);
}

export function updateProduct(id: string, input: UpdateProductInput, deps: ProductDeps): Product {
  const existing = deps.repository.getProduct(id);
  if (!existing) {
    throw new ProductError("That product was not found.");
  }
  const savedRate = input.savedGstRateId ? deps.repository.getSavedGstRate(input.savedGstRateId) : null;
  const normalized = validateProductInput(input, savedRate, {
    allowInactiveSavedRate: existing.savedGstRateId === input.savedGstRateId,
  });
  assertUniqueCode(normalized.code, existing.id, deps);
  const stored: StoredProduct = {
    ...normalized,
    id: existing.id,
    businessId: existing.businessId,
    active: input.active ?? existing.active,
    createdAt: existing.createdAt,
    updatedAt: deps.now(),
  };
  deps.repository.updateProduct(stored);
  return toProduct(stored, deps);
}

function toProduct(stored: StoredProduct, deps: ProductDeps): Product {
  const taxCategory = deps.repository.listTaxCategories().find((category) => category.id === stored.taxCategoryId);
  if (!taxCategory) {
    throw new ProductError("The saved tax category is missing.");
  }
  const savedGstRate = stored.savedGstRateId
    ? deps.repository.getSavedGstRate(stored.savedGstRateId)
    : null;
  if (stored.savedGstRateId && !savedGstRate) {
    throw new ProductError("The saved GST rate for this item is missing.");
  }
  return { ...stored, taxCategory, savedGstRate };
}

function requireBusiness(deps: ProductDeps): string {
  const businessId = deps.repository.getBusinessId();
  if (!businessId) {
    throw new ProductError("Save the business profile before adding a product.");
  }
  return businessId;
}

function assertUniqueRateName(name: string, currentId: string | null, deps: ProductDeps): void {
  const clash = deps.repository
    .listSavedGstRates()
    .some((rate) => rate.id !== currentId && rate.name === name);
  if (clash) {
    throw new ProductError("A saved GST rate with this name already exists.");
  }
}

function assertUniqueCode(code: string | null, currentId: string | null, deps: ProductDeps): void {
  if (!code) {
    return;
  }
  const clash = deps.repository
    .listProducts()
    .some((product) => product.id !== currentId && product.code === code);
  if (clash) {
    throw new ProductError("A product with this code already exists.");
  }
}

export type { ProductType };
