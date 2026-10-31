import { type ProductRepository, type SavedGstRate, type StoredProduct, type TaxCategory } from "@fledge/application";
import { ProductError, TAX_CATEGORIES, type TaxCategoryId } from "@fledge/domain";
import type { SchemaDatabase } from "./connection.js";
import type { Migration } from "./migrate.js";

export const productService: Migration = {
  version: 4,
  name: "product-service",
  up(db) {
    db.exec(`
      CREATE TABLE tax_category (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        code TEXT NOT NULL UNIQUE
      )
    `);
    const insertCategory = db.prepare(
      "INSERT INTO tax_category (id, name, code) VALUES (?, ?, ?)",
    );
    for (const category of TAX_CATEGORIES) {
      insertCategory.run(category.id, category.name, category.code);
    }
    db.exec(`
      CREATE TABLE saved_gst_rate (
        id TEXT PRIMARY KEY,
        business_id TEXT NOT NULL REFERENCES business(id),
        name TEXT NOT NULL,
        percentage TEXT NOT NULL,
        active INTEGER NOT NULL CHECK (active IN (0, 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (business_id, name)
      )
    `);
    db.exec(`
      CREATE TABLE product_service (
        id TEXT PRIMARY KEY,
        business_id TEXT NOT NULL REFERENCES business(id),
        type TEXT NOT NULL CHECK (type IN ('goods', 'service')),
        name TEXT NOT NULL,
        code TEXT,
        description TEXT,
        hsn_sac TEXT,
        unit TEXT NOT NULL,
        default_price TEXT NOT NULL,
        default_discount TEXT NOT NULL,
        tax_category_id TEXT NOT NULL REFERENCES tax_category(id),
        saved_gst_rate_id TEXT REFERENCES saved_gst_rate(id),
        tax_inclusive INTEGER NOT NULL CHECK (tax_inclusive IN (0, 1)),
        active INTEGER NOT NULL CHECK (active IN (0, 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (business_id, code),
        CHECK (
          (tax_category_id = 'taxable' AND saved_gst_rate_id IS NOT NULL)
          OR (
            tax_category_id <> 'taxable'
            AND saved_gst_rate_id IS NULL
            AND tax_inclusive = 0
          )
        )
      )
    `);
  },
};

export function createProductRepository(db: SchemaDatabase): ProductRepository {
  return {
    getBusinessId() {
      return readBusinessId(db);
    },
    listTaxCategories() {
      return db
        .prepare("SELECT id, name, code FROM tax_category")
        .all()
        .map(toTaxCategory);
    },
    listSavedGstRates() {
      const businessId = readBusinessId(db);
      if (!businessId) {
        return [];
      }
      return db
        .prepare(
          `SELECT id, business_id, name, percentage, active, created_at, updated_at
           FROM saved_gst_rate
           WHERE business_id = ?
           ORDER BY name COLLATE NOCASE ASC, id ASC`,
        )
        .all(businessId)
        .map(toSavedGstRate);
    },
    getSavedGstRate(id) {
      const businessId = readBusinessId(db);
      if (!businessId) {
        return null;
      }
      const row = db
        .prepare(
          `SELECT id, business_id, name, percentage, active, created_at, updated_at
           FROM saved_gst_rate
           WHERE id = ? AND business_id = ?`,
        )
        .get(id, businessId);
      return row ? toSavedGstRate(row) : null;
    },
    insertSavedGstRate(record) {
      writeSavedGstRate(db, record, false);
    },
    updateSavedGstRate(record) {
      writeSavedGstRate(db, record, true);
    },
    listProducts() {
      const businessId = readBusinessId(db);
      if (!businessId) {
        return [];
      }
      return db
        .prepare(`${productSelect} WHERE business_id = ? ORDER BY name COLLATE NOCASE ASC, id ASC`)
        .all(businessId)
        .map(toStoredProduct);
    },
    getProduct(id) {
      const businessId = readBusinessId(db);
      if (!businessId) {
        return null;
      }
      const row = db
        .prepare(`${productSelect} WHERE id = ? AND business_id = ?`)
        .get(id, businessId);
      return row ? toStoredProduct(row) : null;
    },
    insertProduct(record) {
      writeProduct(db, record, false);
    },
    updateProduct(record) {
      writeProduct(db, record, true);
    },
  };
}

const productSelect = `
  SELECT id, business_id, type, name, code, description, hsn_sac, unit,
         default_price, default_discount, tax_category_id, saved_gst_rate_id,
         tax_inclusive, active, created_at, updated_at
  FROM product_service
`;

function writeSavedGstRate(db: SchemaDatabase, record: SavedGstRate, updating: boolean): void {
  db.exec("BEGIN IMMEDIATE");
  try {
    assertBusiness(db, record.businessId);
    if (updating) {
      const existing = db
        .prepare("SELECT id FROM saved_gst_rate WHERE id = ? AND business_id = ?")
        .get(record.id, record.businessId);
      if (!existing) {
        throw new ProductError("That saved GST rate was not found.");
      }
      db.prepare(
        `UPDATE saved_gst_rate SET
          name = ?, percentage = ?, active = ?, updated_at = ?
         WHERE id = ? AND business_id = ?`,
      ).run(
        record.name,
        record.percentage,
        record.active ? 1 : 0,
        record.updatedAt,
        record.id,
        record.businessId,
      );
    } else {
      db.prepare(
        `INSERT INTO saved_gst_rate (
          id, business_id, name, percentage, active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        record.id,
        record.businessId,
        record.name,
        record.percentage,
        record.active ? 1 : 0,
        record.createdAt,
        record.updatedAt,
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    rollback(db);
    throw error;
  }
}

function writeProduct(db: SchemaDatabase, record: StoredProduct, updating: boolean): void {
  db.exec("BEGIN IMMEDIATE");
  try {
    assertBusiness(db, record.businessId);
    if (updating) {
      const existing = db
        .prepare("SELECT id FROM product_service WHERE id = ? AND business_id = ?")
        .get(record.id, record.businessId);
      if (!existing) {
        throw new ProductError("That product was not found.");
      }
      db.prepare(
        `UPDATE product_service SET
          type = ?, name = ?, code = ?, description = ?, hsn_sac = ?, unit = ?,
          default_price = ?, default_discount = ?, tax_category_id = ?,
          saved_gst_rate_id = ?, tax_inclusive = ?, active = ?, updated_at = ?
         WHERE id = ? AND business_id = ?`,
      ).run(...productValues(record), record.updatedAt, record.id, record.businessId);
    } else {
      db.prepare(
        `INSERT INTO product_service (
          id, business_id, type, name, code, description, hsn_sac, unit,
          default_price, default_discount, tax_category_id, saved_gst_rate_id,
          tax_inclusive, active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        record.id,
        record.businessId,
        ...productValues(record),
        record.createdAt,
        record.updatedAt,
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    rollback(db);
    throw error;
  }
}

function productValues(record: StoredProduct): Array<string | number | null> {
  return [
    record.type,
    record.name,
    record.code,
    record.description,
    record.hsnSac,
    record.unit,
    record.defaultPrice,
    record.defaultDiscount,
    record.taxCategoryId,
    record.savedGstRateId,
    record.taxInclusive ? 1 : 0,
    record.active ? 1 : 0,
  ];
}

function assertBusiness(db: SchemaDatabase, businessId: string): void {
  const stored = readBusinessId(db);
  if (!stored || stored !== businessId) {
    throw new ProductError("Save the business profile before adding a product.");
  }
}

function readBusinessId(db: SchemaDatabase): string | null {
  const rows = db.prepare("SELECT id FROM business").all();
  const row = rows[0];
  if (!row) {
    return null;
  }
  if (rows.length > 1) {
    throw new ProductError("More than one business profile is stored.");
  }
  if (typeof row.id !== "string" || row.id.length === 0) {
    throw new ProductError("The stored business profile is invalid.");
  }
  return row.id;
}

function toTaxCategory(row: Record<string, unknown>): TaxCategory {
  const id = text(row.id, "id");
  if (!isTaxCategoryId(id)) {
    throw new ProductError("The saved tax category is missing.");
  }
  return {
    id,
    name: text(row.name, "name"),
    code: text(row.code, "code"),
  };
}

function toSavedGstRate(row: Record<string, unknown>): SavedGstRate {
  return {
    id: text(row.id, "id"),
    businessId: text(row.business_id, "business_id"),
    name: text(row.name, "name"),
    percentage: text(row.percentage, "percentage"),
    active: row.active === 1,
    createdAt: text(row.created_at, "created_at"),
    updatedAt: text(row.updated_at, "updated_at"),
  };
}

function toStoredProduct(row: Record<string, unknown>): StoredProduct {
  const type = row.type;
  if (type !== "goods" && type !== "service") {
    throw new ProductError("The stored product type is invalid.");
  }
  const taxCategoryId = text(row.tax_category_id, "tax_category_id");
  if (!isTaxCategoryId(taxCategoryId)) {
    throw new ProductError("The saved tax category is missing.");
  }
  return {
    id: text(row.id, "id"),
    businessId: text(row.business_id, "business_id"),
    type,
    name: text(row.name, "name"),
    code: nullableText(row.code),
    description: nullableText(row.description),
    hsnSac: nullableText(row.hsn_sac),
    unit: text(row.unit, "unit"),
    defaultPrice: text(row.default_price, "default_price"),
    defaultDiscount: text(row.default_discount, "default_discount"),
    taxCategoryId,
    savedGstRateId: nullableText(row.saved_gst_rate_id),
    taxInclusive: row.tax_inclusive === 1,
    active: row.active === 1,
    createdAt: text(row.created_at, "created_at"),
    updatedAt: text(row.updated_at, "updated_at"),
  };
}

function isTaxCategoryId(value: string): value is TaxCategoryId {
  return TAX_CATEGORIES.some((category) => category.id === value);
}

function text(value: unknown, column: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ProductError(`Stored product column ${column} is invalid.`);
  }
  return value;
}

function nullableText(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    throw new ProductError("A stored product field is invalid.");
  }
  return value;
}

function rollback(db: SchemaDatabase): void {
  try {
    db.exec("ROLLBACK");
  } catch {
    // The failed statement may already have ended the transaction.
  }
}
