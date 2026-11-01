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
  getBusinessId: () => Promise<string | null>;
  listTaxCategories: () => Promise<TaxCategory[]>;
  listSavedGstRates: () => Promise<SavedGstRate[]>;
  getSavedGstRate: (id: string) => Promise<SavedGstRate | null>;
  insertSavedGstRate: (record: SavedGstRate) => Promise<void>;
  updateSavedGstRate: (record: SavedGstRate) => Promise<void>;
  listProducts: () => Promise<StoredProduct[]>;
  getProduct: (id: string) => Promise<StoredProduct | null>;
  insertProduct: (record: StoredProduct) => Promise<void>;
  updateProduct: (record: StoredProduct) => Promise<void>;
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

export async function listTaxCategories(deps: ProductDeps): Promise<TaxCategory[]> {
  const categories = await deps.repository.listTaxCategories();
  return [...categories].sort(
    (left, right) => categoryOrder(left.id) - categoryOrder(right.id),
  );
}

function categoryOrder(id: TaxCategoryId): number {
  const index = TAX_CATEGORIES.findIndex((category) => category.id === id);
  return index === -1 ? TAX_CATEGORIES.length : index;
}

export async function listSavedGstRates(
  deps: ProductDeps,
  options: { includeInactive?: boolean } = {},
): Promise<SavedGstRate[]> {
  const rates = await deps.repository.listSavedGstRates();
  return rates.filter((rate) => options.includeInactive || rate.active);
}

export async function createSavedGstRate(
  input: SaveSavedGstRateInput,
  deps: ProductDeps,
): Promise<SavedGstRate> {
  const businessId = await requireBusiness(deps);
  const normalized = validateSavedGstRate(input);
  await assertUniqueRateName(normalized.name, null, deps);
  const timestamp = deps.now();
  const record: SavedGstRate = {
    ...normalized,
    id: deps.createId(),
    businessId,
    active: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await deps.repository.insertSavedGstRate(record);
  return record;
}

export async function updateSavedGstRate(
  id: string,
  input: UpdateSavedGstRateInput,
  deps: ProductDeps,
): Promise<SavedGstRate> {
  const existing = await deps.repository.getSavedGstRate(id);
  if (!existing) {
    throw new ProductError("That saved GST rate was not found.");
  }
  const normalized = validateSavedGstRate(input);
  await assertUniqueRateName(normalized.name, existing.id, deps);
  const record: SavedGstRate = {
    ...normalized,
    id: existing.id,
    businessId: existing.businessId,
    active: input.active ?? existing.active,
    createdAt: existing.createdAt,
    updatedAt: deps.now(),
  };
  await deps.repository.updateSavedGstRate(record);
  return record;
}

export async function listProducts(
  deps: ProductDeps,
  options: { includeInactive?: boolean } = {},
): Promise<Product[]> {
  const products = await deps.repository.listProducts();
  const selected = products.filter((product) => options.includeInactive || product.active);
  const result: Product[] = [];
  for (const product of selected) {
    result.push(await toProduct(product, deps));
  }
  return result;
}

export async function getProduct(id: string, deps: ProductDeps): Promise<Product | null> {
  const stored = await deps.repository.getProduct(id);
  if (!stored) {
    return null;
  }
  return toProduct(stored, deps);
}

export async function createProduct(
  input: SaveProductInput,
  deps: ProductDeps,
): Promise<Product> {
  const businessId = await requireBusiness(deps);
  const savedRate = input.savedGstRateId
    ? await deps.repository.getSavedGstRate(input.savedGstRateId)
    : null;
  const normalized = validateProductInput(input, savedRate);
  await assertUniqueCode(normalized.code, null, deps);
  const timestamp = deps.now();
  const stored: StoredProduct = {
    ...normalized,
    id: deps.createId(),
    businessId,
    active: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await deps.repository.insertProduct(stored);
  return toProduct(stored, deps);
}

export async function updateProduct(
  id: string,
  input: UpdateProductInput,
  deps: ProductDeps,
): Promise<Product> {
  const existing = await deps.repository.getProduct(id);
  if (!existing) {
    throw new ProductError("That product was not found.");
  }
  const savedRate = input.savedGstRateId
    ? await deps.repository.getSavedGstRate(input.savedGstRateId)
    : null;
  const normalized = validateProductInput(input, savedRate, {
    allowInactiveSavedRate: existing.savedGstRateId === input.savedGstRateId,
  });
  await assertUniqueCode(normalized.code, existing.id, deps);
  const stored: StoredProduct = {
    ...normalized,
    id: existing.id,
    businessId: existing.businessId,
    active: input.active ?? existing.active,
    createdAt: existing.createdAt,
    updatedAt: deps.now(),
  };
  await deps.repository.updateProduct(stored);
  return toProduct(stored, deps);
}

async function toProduct(stored: StoredProduct, deps: ProductDeps): Promise<Product> {
  const categories = await deps.repository.listTaxCategories();
  const taxCategory = categories.find((category) => category.id === stored.taxCategoryId);
  if (!taxCategory) {
    throw new ProductError("The saved tax category is missing.");
  }
  const savedGstRate = stored.savedGstRateId
    ? await deps.repository.getSavedGstRate(stored.savedGstRateId)
    : null;
  if (stored.savedGstRateId && !savedGstRate) {
    throw new ProductError("The saved GST rate for this item is missing.");
  }
  return { ...stored, taxCategory, savedGstRate };
}

async function requireBusiness(deps: ProductDeps): Promise<string> {
  const businessId = await deps.repository.getBusinessId();
  if (!businessId) {
    throw new ProductError("Save the business profile before adding a product.");
  }
  return businessId;
}

async function assertUniqueRateName(
  name: string,
  currentId: string | null,
  deps: ProductDeps,
): Promise<void> {
  const rates = await deps.repository.listSavedGstRates();
  const clash = rates.some((rate) => rate.id !== currentId && rate.name === name);
  if (clash) {
    throw new ProductError("A saved GST rate with this name already exists.");
  }
}

async function assertUniqueCode(
  code: string | null,
  currentId: string | null,
  deps: ProductDeps,
): Promise<void> {
  if (!code) {
    return;
  }
  const products = await deps.repository.listProducts();
  const clash = products.some((product) => product.id !== currentId && product.code === code);
  if (clash) {
    throw new ProductError("A product with this code already exists.");
  }
}

export type { ProductType };
