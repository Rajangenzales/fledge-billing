import {
  seriesId,
  type BillingDocument,
  type BusinessRef,
  type CustomerRef,
  type DocumentCharge,
  type DocumentLine,
  type DocumentRepository,
  type DocumentStatus,
  type DocumentTax,
  type NumberSeries,
  type ProductRef,
} from "@fledge/application";
import {
  BillingError,
  GstError,
  calculateGstDocument,
  defaultDocumentPrefix,
  formatDocumentNumber,
  type DiscountType,
  type DocumentType,
  type TaxCategoryId,
} from "@fledge/domain";
import type { SchemaDatabase, SqlValue } from "./connection.js";
import { readGstRuleVersions } from "./gst.js";
import { resolveTemplateId } from "./template.js";
import type { Migration } from "./migrate.js";
import { listStateUts } from "./state-ut.js";

export const billingDocument: Migration = {
  version: 5,
  name: "billing-document",
  up(db) {
    db.exec(`
      CREATE TABLE document (
        id TEXT PRIMARY KEY,
        business_id TEXT NOT NULL REFERENCES business(id),
        customer_id TEXT NOT NULL REFERENCES customer(id),
        document_type TEXT NOT NULL CHECK (
          document_type IN (
            'tax_invoice',
            'non_gst_invoice',
            'bill_of_supply',
            'quotation',
            'receipt'
          )
        ),
        status TEXT NOT NULL CHECK (
          status IN ('draft', 'finalized', 'partial', 'paid', 'cancelled')
        ),
        document_number TEXT,
        financial_year TEXT NOT NULL,
        document_date TEXT NOT NULL,
        place_of_supply_state_id TEXT REFERENCES state_ut(id),
        gst_enabled INTEGER NOT NULL CHECK (gst_enabled IN (0, 1)),
        gst_rule_version_id TEXT,
        template_id TEXT,
        subtotal TEXT NOT NULL,
        discount_total TEXT NOT NULL,
        taxable_total TEXT NOT NULL,
        tax_total TEXT NOT NULL,
        grand_total TEXT NOT NULL,
        created_at TEXT NOT NULL,
        finalized_at TEXT,
        updated_at TEXT NOT NULL,
        UNIQUE (business_id, document_number),
        CHECK (
          (document_type = 'tax_invoice' AND gst_enabled = 1)
          OR (
            document_type IN ('non_gst_invoice', 'bill_of_supply', 'receipt')
            AND gst_enabled = 0
          )
          OR document_type = 'quotation'
        ),
        CHECK (
          (gst_enabled = 1 AND place_of_supply_state_id IS NOT NULL)
          OR (gst_enabled = 0 AND place_of_supply_state_id IS NULL)
        )
      )
    `);
    db.exec(`
      CREATE TABLE document_item (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL REFERENCES document(id),
        product_service_id TEXT REFERENCES product_service(id),
        description_snapshot TEXT NOT NULL,
        hsn_sac_snapshot TEXT,
        quantity TEXT NOT NULL,
        unit TEXT NOT NULL,
        rate TEXT NOT NULL,
        discount_type TEXT NOT NULL CHECK (discount_type IN ('none', 'amount', 'percent')),
        discount_value TEXT NOT NULL,
        discount_amount TEXT NOT NULL,
        line_amount TEXT NOT NULL,
        taxable_value TEXT NOT NULL,
        gst_rate_snapshot TEXT,
        tax_inclusive INTEGER NOT NULL CHECK (tax_inclusive IN (0, 1)),
        sort_order INTEGER NOT NULL
      )
    `);
    db.exec(`
      CREATE TABLE document_charge (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL REFERENCES document(id),
        description TEXT NOT NULL,
        amount TEXT NOT NULL,
        taxable INTEGER NOT NULL CHECK (taxable IN (0, 1)),
        sort_order INTEGER NOT NULL
      )
    `);
    db.exec(`
      CREATE TABLE number_series (
        id TEXT PRIMARY KEY,
        business_id TEXT NOT NULL REFERENCES business(id),
        document_type TEXT NOT NULL CHECK (
          document_type IN (
            'tax_invoice',
            'non_gst_invoice',
            'bill_of_supply',
            'quotation',
            'receipt'
          )
        ),
        financial_year TEXT NOT NULL,
        prefix TEXT NOT NULL,
        next_number INTEGER NOT NULL CHECK (next_number >= 1),
        padding INTEGER NOT NULL CHECK (padding BETWEEN 3 AND 6),
        active INTEGER NOT NULL CHECK (active IN (0, 1)),
        UNIQUE (business_id, document_type, financial_year)
      )
    `);
  },
};

export function createDocumentRepository(db: SchemaDatabase): DocumentRepository {
  return {
    getBusinessId() {
      return readBusinessId(db);
    },
    getBusiness() {
      return readBusinessRef(db);
    },
    getCustomer(id) {
      const businessId = readBusinessId(db);
      if (!businessId) {
        return null;
      }
      return readCustomerRef(db, id, businessId);
    },
    getProduct(id) {
      const businessId = readBusinessId(db);
      if (!businessId) {
        return null;
      }
      return readProductRef(db, id, businessId);
    },
    listGstRuleVersions() {
      return readGstRuleVersions(db);
    },
    list() {
      const businessId = readBusinessId(db);
      if (!businessId) {
        return [];
      }
      return db
        .prepare(
          `SELECT id FROM document
           WHERE business_id = ?
           ORDER BY document_date DESC, id ASC`,
        )
        .all(businessId)
        .map((row) => readDocument(db, text(row.id, "id")));
    },
    get(id) {
      const businessId = readBusinessId(db);
      if (!businessId) {
        return null;
      }
      const row = db.prepare("SELECT id FROM document WHERE id = ? AND business_id = ?").get(id, businessId);
      return row ? readDocument(db, id) : null;
    },
    insert(record) {
      withTransaction(db, () => {
        assertBusiness(db, record.businessId);
        writeDocument(db, record, false);
      });
    },
    replaceDraft(record) {
      withTransaction(db, () => {
        assertBusiness(db, record.businessId);
        const status = readStatus(db, record.id, record.businessId);
        if (status !== "draft") {
          throw new BillingError("A finalized document cannot be changed.");
        }
        deleteChildren(db, record.id);
        writeDocument(db, record, true);
      });
    },
    finalize(id, finalizedAt) {
      return withTransaction(db, () => {
        const businessId = readBusinessId(db);
        if (!businessId) {
          throw new BillingError("Save the business profile before creating a document.");
        }
        const existing = db
          .prepare("SELECT id FROM document WHERE id = ? AND business_id = ?")
          .get(id, businessId);
        if (!existing) {
          throw new BillingError("That document was not found.");
        }
        const status = readStatus(db, id, businessId);
        if (status !== "draft") {
          throw new BillingError("Only a draft can be finalized.");
        }
        const current = recalculate(db, readDocument(db, id));
        const series = readSeries(db, businessId, current.documentType, current.financialYear) ??
          insertDefaultSeries(db, businessId, current.documentType, current.financialYear);
        const documentNumber = formatDocumentNumber(
          series.prefix,
          series.financialYear,
          series.nextNumber,
          series.padding,
        );
        db.prepare(
          `UPDATE number_series
           SET next_number = ?
           WHERE id = ? AND business_id = ?`,
        ).run(series.nextNumber + 1, series.id, businessId);
        deleteChildren(db, id);
        writeDocument(
          db,
          {
            ...current,
            status: "finalized",
            documentNumber,
            finalizedAt,
            updatedAt: finalizedAt,
          },
          true,
        );
        return readDocument(db, id);
      });
    },
    cancel(id, updatedAt) {
      return withTransaction(db, () => {
        const businessId = readBusinessId(db);
        if (!businessId) {
          throw new BillingError("Save the business profile before creating a document.");
        }
        const existing = db
          .prepare("SELECT id FROM document WHERE id = ? AND business_id = ?")
          .get(id, businessId);
        if (!existing) {
          throw new BillingError("That document was not found.");
        }
        const status = readStatus(db, id, businessId);
        if (status !== "draft" && status !== "finalized") {
          throw new BillingError(
            status === "cancelled"
              ? "This document is already cancelled."
              : "This document cannot be cancelled.",
          );
        }
        db.prepare(
          `UPDATE document SET status = 'cancelled', updated_at = ?
           WHERE id = ? AND business_id = ?`,
        ).run(updatedAt, id, businessId);
        return readDocument(db, id);
      });
    },
    getNumberSeries(documentType, financialYear) {
      const businessId = readBusinessId(db);
      if (!businessId) {
        return null;
      }
      return readSeries(db, businessId, documentType, financialYear);
    },
    saveNumberSeries(record) {
      withTransaction(db, () => {
        assertBusiness(db, record.businessId);
        const issued = issuedNumber(db, record.businessId, record.documentType, record.financialYear);
        const existing = readSeries(db, record.businessId, record.documentType, record.financialYear);
        if (existing && issued && record.nextNumber < existing.nextNumber) {
          throw new BillingError("The next number can only move forward after a document is issued.");
        }
        if (existing) {
          db.prepare(
            `UPDATE number_series
             SET prefix = ?, next_number = ?, padding = ?, active = ?
             WHERE id = ? AND business_id = ?`,
          ).run(
            record.prefix,
            record.nextNumber,
            record.padding,
            record.active ? 1 : 0,
            existing.id,
            record.businessId,
          );
        } else {
          db.prepare(
            `INSERT INTO number_series (
              id, business_id, document_type, financial_year, prefix, next_number, padding, active
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          ).run(
            record.id,
            record.businessId,
            record.documentType,
            record.financialYear,
            record.prefix,
            record.nextNumber,
            record.padding,
            record.active ? 1 : 0,
          );
        }
      });
    },
    hasIssuedNumber(documentType, financialYear) {
      const businessId = readBusinessId(db);
      if (!businessId) {
        return false;
      }
      return issuedNumber(db, businessId, documentType, financialYear);
    },
    resolveTemplate(documentType, templateId, now) {
      const businessId = readBusinessId(db);
      if (!businessId) {
        throw new BillingError("Save the business profile before creating a document.");
      }
      return resolveTemplateId(db, businessId, documentType, templateId, now);
    },
  };
}

function writeDocument(db: SchemaDatabase, record: BillingDocument, updating: boolean): void {
  const values: SqlValue[] = [
    record.customerId,
    record.documentType,
    record.status,
    record.documentNumber,
    record.financialYear,
    record.documentDate,
    record.placeOfSupplyStateId,
    record.gstEnabled ? 1 : 0,
    record.ruleVersionId,
    record.templateId,
    record.subtotal,
    record.discountTotal,
    record.taxableTotal,
    record.taxTotal,
    record.grandTotal,
    record.finalizedAt,
    record.updatedAt,
    record.supplierStateId,
    record.supplierGstRegistered ? 1 : 0,
    record.supplierGstin,
    record.recipientStateId,
    record.recipientRegistrationType,
    record.recipientGstin,
    record.reverseCharge ? 1 : 0,
    record.exemptTotal,
    record.nonGstTotal,
    record.roundingResidual,
    record.cessTotal,
    record.notices.join("\n"),
  ];
  if (updating) {
    db.prepare(
      `UPDATE document SET
        customer_id = ?, document_type = ?, status = ?, document_number = ?,
        financial_year = ?, document_date = ?, place_of_supply_state_id = ?,
        gst_enabled = ?, gst_rule_version_id = ?, template_id = ?, subtotal = ?, discount_total = ?,
        taxable_total = ?, tax_total = ?, grand_total = ?, finalized_at = ?, updated_at = ?,
        supplier_state_id = ?, supplier_gst_registered = ?, supplier_gstin = ?,
        recipient_state_id = ?, recipient_registration_type = ?, recipient_gstin = ?,
        reverse_charge = ?, exempt_total = ?, non_gst_total = ?, rounding_residual = ?,
        cess_total = ?, calculation_notes = ?
       WHERE id = ? AND business_id = ?`,
    ).run(...values, record.id, record.businessId);
  } else {
    db.prepare(
      `INSERT INTO document (
        customer_id, document_type, status, document_number, financial_year, document_date,
        place_of_supply_state_id, gst_enabled, gst_rule_version_id, template_id,
        subtotal, discount_total, taxable_total, tax_total, grand_total,
        finalized_at, updated_at, supplier_state_id, supplier_gst_registered, supplier_gstin,
        recipient_state_id, recipient_registration_type, recipient_gstin, reverse_charge,
        exempt_total, non_gst_total, rounding_residual, cess_total, calculation_notes,
        id, business_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(...values, record.id, record.businessId, record.createdAt);
  }
  const insertLine = db.prepare(
    `INSERT INTO document_item (
      id, document_id, product_service_id, description_snapshot, hsn_sac_snapshot,
      quantity, unit, rate, discount_type, discount_value, discount_amount, line_amount,
      taxable_value, gst_rate_snapshot, tax_inclusive, sort_order, tax_category_id, supply_nature
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const line of record.lines) {
    insertLine.run(
      line.id,
      record.id,
      line.productId,
      line.description,
      line.hsnSac,
      line.quantity,
      line.unit,
      line.rate,
      line.discountType,
      line.discountValue,
      line.discountAmount,
      line.lineAmount,
      line.taxableValue,
      line.gstRatePercent,
      line.taxInclusive ? 1 : 0,
      line.sortOrder,
      line.taxCategoryId,
      line.supplyNature,
    );
  }
  const insertCharge = db.prepare(
    `INSERT INTO document_charge (
      id, document_id, description, amount, taxable, sort_order, tax_category_id, gst_rate_snapshot
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const charge of record.charges) {
    insertCharge.run(
      charge.id,
      record.id,
      charge.description,
      charge.amount,
      charge.taxable ? 1 : 0,
      charge.sortOrder,
      charge.taxCategoryId,
      charge.gstRatePercent,
    );
  }
  const insertTax = db.prepare(
    `INSERT INTO document_tax (
      id, document_id, document_item_id, document_charge_id, tax_type, rate, taxable_value,
      amount, jurisdiction_state_id, rule_version_id, reverse_charge
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const tax of record.taxes) {
    insertTax.run(
      tax.id,
      record.id,
      tax.documentItemId,
      tax.documentChargeId,
      tax.taxType,
      tax.rate,
      tax.taxableValue,
      tax.amount,
      tax.jurisdictionStateId,
      tax.ruleVersionId,
      tax.reverseCharge ? 1 : 0,
    );
  }
}

function deleteChildren(db: SchemaDatabase, documentId: string): void {
  db.prepare("DELETE FROM document_tax WHERE document_id = ?").run(documentId);
  db.prepare("DELETE FROM document_charge WHERE document_id = ?").run(documentId);
  db.prepare("DELETE FROM document_item WHERE document_id = ?").run(documentId);
}

function readDocument(db: SchemaDatabase, id: string): BillingDocument {
  const row = db
    .prepare(
      `SELECT id, business_id, customer_id, document_type, status, document_number,
              financial_year, document_date, place_of_supply_state_id, gst_enabled,
              gst_rule_version_id, template_id, subtotal, discount_total, taxable_total, tax_total,
              grand_total, created_at, finalized_at, updated_at, supplier_state_id,
              supplier_gst_registered, supplier_gstin, recipient_state_id,
              recipient_registration_type, recipient_gstin, reverse_charge, exempt_total,
              non_gst_total, rounding_residual, cess_total, calculation_notes
       FROM document WHERE id = ?`,
    )
    .get(id);
  if (!row) {
    throw new BillingError("That document was not found.");
  }
  const lines = db
    .prepare(
      `SELECT id, product_service_id, description_snapshot, hsn_sac_snapshot, quantity, unit,
              rate, discount_type, discount_value, discount_amount, line_amount, taxable_value,
              gst_rate_snapshot, tax_inclusive, sort_order, tax_category_id, supply_nature
       FROM document_item
       WHERE document_id = ?
       ORDER BY sort_order ASC, id ASC`,
    )
    .all(id)
    .map(toLine);
  const charges = db
    .prepare(
      `SELECT id, description, amount, taxable, sort_order, tax_category_id, gst_rate_snapshot
       FROM document_charge
       WHERE document_id = ?
       ORDER BY sort_order ASC, id ASC`,
    )
    .all(id)
    .map(toCharge);
  const taxes = db
    .prepare(
      `SELECT id, document_item_id, document_charge_id, tax_type, rate, taxable_value, amount,
              jurisdiction_state_id, rule_version_id, reverse_charge
       FROM document_tax
       WHERE document_id = ?
       ORDER BY id ASC`,
    )
    .all(id)
    .map(toTax);
  const registration = row.recipient_registration_type;
  if (registration !== "registered" && registration !== "unregistered") {
    throw new BillingError("The stored customer registration is invalid.");
  }
  return {
    id: text(row.id, "id"),
    businessId: text(row.business_id, "business_id"),
    customerId: text(row.customer_id, "customer_id"),
    documentType: documentType(row.document_type),
    status: documentStatus(row.status),
    documentNumber: nullableText(row.document_number),
    financialYear: text(row.financial_year, "financial_year"),
    documentDate: text(row.document_date, "document_date"),
    placeOfSupplyStateId: nullableText(row.place_of_supply_state_id),
    gstEnabled: row.gst_enabled === 1,
    reverseCharge: row.reverse_charge === 1,
    supplierStateId: text(row.supplier_state_id, "supplier_state_id"),
    supplierGstRegistered: row.supplier_gst_registered === 1,
    supplierGstin: nullableText(row.supplier_gstin),
    recipientStateId: text(row.recipient_state_id, "recipient_state_id"),
    recipientRegistrationType: registration,
    recipientGstin: nullableText(row.recipient_gstin),
    lines,
    charges,
    taxes,
    subtotal: text(row.subtotal, "subtotal"),
    discountTotal: text(row.discount_total, "discount_total"),
    taxableTotal: text(row.taxable_total, "taxable_total"),
    exemptTotal: text(row.exempt_total, "exempt_total"),
    nonGstTotal: text(row.non_gst_total, "non_gst_total"),
    taxTotal: text(row.tax_total, "tax_total"),
    cessTotal: text(row.cess_total, "cess_total"),
    roundingResidual: text(row.rounding_residual, "rounding_residual"),
    grandTotal: text(row.grand_total, "grand_total"),
    ruleVersionId: nullableText(row.gst_rule_version_id),
    notices: noticesFrom(row.calculation_notes),
    templateId: nullableText(row.template_id),
    createdAt: text(row.created_at, "created_at"),
    finalizedAt: nullableText(row.finalized_at),
    updatedAt: text(row.updated_at, "updated_at"),
  };
}

function readSeries(
  db: SchemaDatabase,
  businessId: string,
  documentType: DocumentType,
  financialYear: string,
): NumberSeries | null {
  const row = db
    .prepare(
      `SELECT id, business_id, document_type, financial_year, prefix, next_number, padding, active
       FROM number_series
       WHERE business_id = ? AND document_type = ? AND financial_year = ?`,
    )
    .get(businessId, documentType, financialYear);
  if (!row) {
    return null;
  }
  return {
    id: text(row.id, "id"),
    businessId: text(row.business_id, "business_id"),
    documentType: documentTypeOf(row.document_type),
    financialYear: text(row.financial_year, "financial_year"),
    prefix: text(row.prefix, "prefix"),
    nextNumber: wholeNumber(row.next_number, "next_number"),
    padding: wholeNumber(row.padding, "padding"),
    active: row.active === 1,
  };
}

function insertDefaultSeries(
  db: SchemaDatabase,
  businessId: string,
  documentType: DocumentType,
  financialYear: string,
): NumberSeries {
  const series: NumberSeries = {
    id: seriesId(businessId, documentType, financialYear),
    businessId,
    documentType,
    financialYear,
    prefix: defaultDocumentPrefix(documentType),
    nextNumber: 1,
    padding: 4,
    active: true,
  };
  db.prepare(
    `INSERT INTO number_series (
      id, business_id, document_type, financial_year, prefix, next_number, padding, active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
  ).run(
    series.id,
    series.businessId,
    series.documentType,
    series.financialYear,
    series.prefix,
    series.nextNumber,
    series.padding,
  );
  return series;
}

function issuedNumber(
  db: SchemaDatabase,
  businessId: string,
  documentType: DocumentType,
  financialYear: string,
): boolean {
  const row = db
    .prepare(
      `SELECT id FROM document
       WHERE business_id = ? AND document_type = ? AND financial_year = ? AND document_number IS NOT NULL
       LIMIT 1`,
    )
    .get(businessId, documentType, financialYear);
  return row !== undefined;
}

function readStatus(db: SchemaDatabase, id: string, businessId: string): DocumentStatus {
  const row = db
    .prepare("SELECT status FROM document WHERE id = ? AND business_id = ?")
    .get(id, businessId);
  if (!row) {
    throw new BillingError("That document was not found.");
  }
  return documentStatus(row.status);
}

function recalculate(db: SchemaDatabase, stored: BillingDocument): BillingDocument {
  const business = readBusinessRef(db);
  const customer = readCustomerRef(db, stored.customerId, stored.businessId);
  if (!business || !customer) {
    throw new BillingError("That document was not found.");
  }
  const rates: Record<string, string | null> = {};
  const categories: Record<string, TaxCategoryId> = {};
  for (const line of stored.lines) {
    if (!line.productId || line.productId in rates) {
      continue;
    }
    const product = readProductRef(db, line.productId, stored.businessId);
    if (product) {
      rates[line.productId] = product.savedGstRatePercent;
      categories[line.productId] = product.taxCategoryId;
    }
  }
  const calculated = calculateGstDocument({
    documentType: stored.documentType,
    documentDate: stored.documentDate,
    gstEnabled: stored.gstEnabled,
    reverseCharge: stored.reverseCharge,
    placeOfSupplyStateId: stored.placeOfSupplyStateId,
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
      taxCategoryId: line.taxCategoryId,
      supplyNature: line.supplyNature,
    })),
    charges: stored.charges.map((charge) => ({
      description: charge.description,
      amount: charge.amount,
      taxable: charge.taxable,
      taxCategoryId: charge.taxCategoryId,
      gstRatePercent: charge.gstRatePercent,
    })),
    rules: readGstRuleVersions(db),
    states: listStateUts(db),
    productRates: rates,
    productCategories: categories,
  });
  if (
    calculated.lines.length !== stored.lines.length ||
    calculated.charges.length !== stored.charges.length
  ) {
    throw new GstError("The GST calculation did not match the document lines.");
  }
  const lineIds = stored.lines.map((line) => line.id);
  const chargeIds = stored.charges.map((charge) => charge.id);
  const taxes: DocumentTax[] = calculated.taxes.map((tax) => {
    const sourceId = tax.source === "line" ? lineIds[tax.sourceIndex] : chargeIds[tax.sourceIndex];
    if (!sourceId) {
      throw new GstError("The GST calculation did not match the document lines.");
    }
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
    ...stored,
    reverseCharge: calculated.reverseCharge,
    supplierStateId: calculated.supplierStateId,
    supplierGstRegistered: business.gstRegistered,
    supplierGstin: business.gstin,
    recipientStateId: calculated.recipientStateId,
    recipientRegistrationType: customer.registrationType,
    recipientGstin: customer.gstin,
    lines: calculated.lines.map((line, index) => ({ ...line, id: lineIds[index]! })),
    charges: calculated.charges.map((charge, index) => ({ ...charge, id: chargeIds[index]! })),
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

function readBusinessRef(db: SchemaDatabase): BusinessRef | null {
  const row = db
    .prepare("SELECT id, state_id, gst_registered, gstin FROM business")
    .get();
  if (!row || typeof row.id !== "string") {
    return null;
  }
  return {
    id: row.id,
    stateId: text(row.state_id, "state_id"),
    gstRegistered: row.gst_registered === 1,
    gstin: nullableText(row.gstin),
  };
}

function readCustomerRef(db: SchemaDatabase, id: string, businessId: string): CustomerRef | null {
  const row = db
    .prepare(
      `SELECT id, active, state_ut_id, registration_type, gstin
       FROM customer WHERE id = ? AND business_id = ?`,
    )
    .get(id, businessId);
  if (!row || typeof row.id !== "string") {
    return null;
  }
  const registration = row.registration_type;
  if (registration !== "registered" && registration !== "unregistered") {
    throw new BillingError("The stored customer registration is invalid.");
  }
  return {
    id: row.id,
    active: row.active === 1,
    stateId: text(row.state_ut_id, "state_ut_id"),
    registrationType: registration,
    gstin: nullableText(row.gstin),
  };
}

function readProductRef(db: SchemaDatabase, id: string, businessId: string): ProductRef | null {
  const row = db
    .prepare(
      `SELECT product_service.id, product_service.type, product_service.tax_category_id, saved_gst_rate.percentage
       FROM product_service
       LEFT JOIN saved_gst_rate ON saved_gst_rate.id = product_service.saved_gst_rate_id
       WHERE product_service.id = ? AND product_service.business_id = ?`,
    )
    .get(id, businessId);
  if (!row || typeof row.id !== "string") {
    return null;
  }
  const type = row.type;
  if (type !== "goods" && type !== "service") {
    throw new BillingError("The stored product type is invalid.");
  }
  return {
    id: row.id,
    type,
    taxCategoryId: taxCategory(row.tax_category_id),
    savedGstRatePercent: nullableText(row.percentage),
  };
}

function toLine(row: Record<string, unknown>): DocumentLine {
  const nature = row.supply_nature;
  if (nature !== null && nature !== undefined && nature !== "goods" && nature !== "service") {
    throw new BillingError("The stored supply nature is invalid.");
  }
  return {
    id: text(row.id, "id"),
    productId: nullableText(row.product_service_id),
    description: text(row.description_snapshot, "description_snapshot"),
    hsnSac: nullableText(row.hsn_sac_snapshot),
    quantity: text(row.quantity, "quantity"),
    unit: text(row.unit, "unit"),
    rate: text(row.rate, "rate"),
    discountType: discountType(row.discount_type),
    discountValue: text(row.discount_value, "discount_value"),
    discountAmount: text(row.discount_amount, "discount_amount"),
    lineAmount: text(row.line_amount, "line_amount"),
    taxableValue: text(row.taxable_value, "taxable_value"),
    gstRatePercent: nullableText(row.gst_rate_snapshot),
    taxInclusive: row.tax_inclusive === 1,
    taxCategoryId: taxCategory(row.tax_category_id),
    supplyNature: nature === "goods" || nature === "service" ? nature : null,
    sortOrder: wholeNumber(row.sort_order, "sort_order"),
  };
}

function toCharge(row: Record<string, unknown>): DocumentCharge {
  return {
    id: text(row.id, "id"),
    description: text(row.description, "description"),
    amount: text(row.amount, "amount"),
    taxable: row.taxable === 1,
    taxCategoryId: taxCategory(row.tax_category_id),
    gstRatePercent: nullableText(row.gst_rate_snapshot),
    sortOrder: wholeNumber(row.sort_order, "sort_order"),
  };
}

function toTax(row: Record<string, unknown>): DocumentTax {
  const taxType = row.tax_type;
  if (taxType !== "CGST" && taxType !== "SGST" && taxType !== "UTGST" && taxType !== "IGST" && taxType !== "CESS") {
    throw new BillingError("The stored tax type is invalid.");
  }
  return {
    id: text(row.id, "id"),
    documentItemId: nullableText(row.document_item_id),
    documentChargeId: nullableText(row.document_charge_id),
    taxType,
    rate: text(row.rate, "rate"),
    taxableValue: text(row.taxable_value, "taxable_value"),
    amount: text(row.amount, "amount"),
    jurisdictionStateId: text(row.jurisdiction_state_id, "jurisdiction_state_id"),
    ruleVersionId: text(row.rule_version_id, "rule_version_id"),
    reverseCharge: row.reverse_charge === 1,
  };
}

function taxCategory(value: unknown): TaxCategoryId {
  if (value === "taxable" || value === "exempt" || value === "nil-rated" || value === "non-gst") {
    return value;
  }
  throw new BillingError("The stored tax category is missing.");
}

function noticesFrom(value: unknown): string[] {
  if (value === null || value === undefined || value === "") {
    return [];
  }
  if (typeof value !== "string") {
    throw new BillingError("The stored calculation notes are invalid.");
  }
  return value.split("\n").filter((notice) => notice.length > 0);
}

function assertBusiness(db: SchemaDatabase, businessId: string): void {
  const stored = readBusinessId(db);
  if (!stored || stored !== businessId) {
    throw new BillingError("Save the business profile before creating a document.");
  }
}

function readBusinessId(db: SchemaDatabase): string | null {
  const rows = db.prepare("SELECT id FROM business").all();
  const row = rows[0];
  if (!row) {
    return null;
  }
  if (rows.length > 1) {
    throw new BillingError("More than one business profile is stored.");
  }
  if (typeof row.id !== "string" || row.id.length === 0) {
    throw new BillingError("The stored business profile is invalid.");
  }
  return row.id;
}

function documentType(value: unknown): DocumentType {
  return documentTypeOf(value);
}

function documentTypeOf(value: unknown): DocumentType {
  if (
    value === "tax_invoice" ||
    value === "non_gst_invoice" ||
    value === "bill_of_supply" ||
    value === "quotation" ||
    value === "receipt"
  ) {
    return value;
  }
  throw new BillingError("The stored document type is invalid.");
}

function documentStatus(value: unknown): DocumentStatus {
  if (
    value === "draft" ||
    value === "finalized" ||
    value === "partial" ||
    value === "paid" ||
    value === "cancelled"
  ) {
    return value;
  }
  throw new BillingError("The stored document status is invalid.");
}

function discountType(value: unknown): DiscountType {
  if (value === "none" || value === "amount" || value === "percent") {
    return value;
  }
  throw new BillingError("The stored discount is invalid.");
}

function text(value: unknown, column: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new BillingError(`Stored document column ${column} is invalid.`);
  }
  return value;
}

function nullableText(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    throw new BillingError("A stored document field is invalid.");
  }
  return value.length === 0 ? null : value;
}

function wholeNumber(value: unknown, column: string): number {
  const number = typeof value === "bigint" ? Number(value) : value;
  if (typeof number !== "number" || !Number.isInteger(number)) {
    throw new BillingError(`Stored document column ${column} is invalid.`);
  }
  return number;
}

function withTransaction<T>(db: SchemaDatabase, work: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    rollback(db);
    if (error instanceof Error && error.message.includes("UNIQUE")) {
      throw new BillingError("That document number is already used.");
    }
    throw error;
  }
}

function rollback(db: SchemaDatabase): void {
  try {
    db.exec("ROLLBACK");
  } catch {
    // The failed statement may already have ended the transaction.
  }
}
