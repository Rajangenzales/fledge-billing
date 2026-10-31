import type {
  InvoiceTemplate,
  TemplateCustomField,
  TemplateField,
  TemplateRepository,
  TemplateSection,
} from "@fledge/application";
import {
  BUILT_IN_TEMPLATES,
  TemplateError,
  type BuiltInTemplate,
  type TemplateDensity,
  type TemplateFamily,
  type CustomFieldDefinition,
  type TemplateFieldDefinition,
  type TemplateFontFamily,
  type TemplateSectionDefinition,
} from "@fledge/domain";
import type { SchemaDatabase } from "./connection.js";
import type { Migration } from "./migrate.js";

export const invoiceTemplate: Migration = {
  version: 7,
  name: "invoice-template",
  up(db) {
    db.exec(`
      CREATE TABLE invoice_template (
        id TEXT PRIMARY KEY,
        business_id TEXT NOT NULL REFERENCES business(id),
        builtin_key TEXT NOT NULL,
        family TEXT NOT NULL CHECK (
          family IN ('standard', 'gst', 'service', 'retail', 'quotation', 'receipt', 'bill-of-supply')
        ),
        name TEXT NOT NULL,
        purpose TEXT NOT NULL,
        document_type TEXT NOT NULL CHECK (
          document_type IN (
            'tax_invoice', 'non_gst_invoice', 'bill_of_supply', 'quotation', 'receipt'
          )
        ),
        version INTEGER NOT NULL CHECK (version >= 1),
        brand_color TEXT NOT NULL,
        font_family TEXT NOT NULL CHECK (font_family IN ('source-sans', 'system')),
        density TEXT NOT NULL CHECK (density IN ('comfortable', 'compact')),
        is_default INTEGER NOT NULL CHECK (is_default IN (0, 1)),
        active INTEGER NOT NULL CHECK (active IN (0, 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (business_id, builtin_key, version)
      )
    `);
    db.exec(`
      CREATE UNIQUE INDEX invoice_template_one_default
      ON invoice_template (business_id, document_type)
      WHERE is_default = 1 AND active = 1
    `);
    db.exec(`
      CREATE TABLE template_section (
        id TEXT PRIMARY KEY,
        template_id TEXT NOT NULL REFERENCES invoice_template(id),
        section_key TEXT NOT NULL,
        label TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        visible INTEGER NOT NULL CHECK (visible IN (0, 1)),
        protected INTEGER NOT NULL CHECK (protected IN (0, 1)),
        UNIQUE (template_id, section_key)
      )
    `);
    db.exec(`
      CREATE TABLE template_field (
        id TEXT PRIMARY KEY,
        template_id TEXT NOT NULL REFERENCES invoice_template(id),
        section_key TEXT NOT NULL,
        field_key TEXT NOT NULL,
        label TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        visible INTEGER NOT NULL CHECK (visible IN (0, 1)),
        required INTEGER NOT NULL CHECK (required IN (0, 1)),
        protected INTEGER NOT NULL CHECK (protected IN (0, 1)),
        UNIQUE (template_id, field_key)
      )
    `);
  },
};

export function createTemplateRepository(db: SchemaDatabase): TemplateRepository {
  return {
    getBusinessId() {
      return readBusinessId(db);
    },
    ensureBuiltIns(businessId, now) {
      ensureBuiltInTemplates(db, businessId, now);
    },
    list(businessId) {
      return listTemplates(db, businessId);
    },
    get(businessId, id) {
      return readTemplate(db, businessId, id);
    },
    setDefault(businessId, id, now) {
      db.exec("BEGIN IMMEDIATE");
      try {
        const template = readTemplate(db, businessId, id);
        if (!template || !template.active) {
          throw new TemplateError("That template was not found.");
        }
        db.prepare(
          `UPDATE invoice_template
           SET is_default = 0, updated_at = ?
           WHERE business_id = ? AND document_type = ? AND is_default = 1`,
        ).run(now, businessId, template.documentType);
        db.prepare(
          `UPDATE invoice_template SET is_default = 1, updated_at = ? WHERE id = ? AND business_id = ?`,
        ).run(now, id, businessId);
        db.exec("COMMIT");
      } catch (error) {
        rollback(db);
        throw error;
      }
    },
    saveRevision(businessId, sourceId, sections, fields, customFields, now) {
      db.exec("BEGIN IMMEDIATE");
      try {
        const revisedId = insertRevision(db, businessId, sourceId, sections, fields, customFields, now);
        db.exec("COMMIT");
        return revisedId;
      } catch (error) {
        rollback(db);
        throw error;
      }
    },
  };
}

export function ensureBuiltInTemplates(db: SchemaDatabase, businessId: string, now: string): void {
  db.exec("BEGIN IMMEDIATE");
  try {
    insertMissingTemplates(db, businessId, now);
    db.exec("COMMIT");
  } catch (error) {
    rollback(db);
    throw error;
  }
}

function insertMissingTemplates(db: SchemaDatabase, businessId: string, now: string): void {
  const existing = new Set(
    db
      .prepare("SELECT builtin_key FROM invoice_template WHERE business_id = ? AND version = 1")
      .all(businessId)
      .map((row) => text(row.builtin_key, "builtin_key")),
  );
  const insertTemplate = db.prepare(
    `INSERT INTO invoice_template (
      id, business_id, builtin_key, family, name, purpose, document_type, version,
      brand_color, font_family, density, is_default, active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, 1, ?, ?)`,
  );
  const insertSection = db.prepare(
    `INSERT INTO template_section (
      id, template_id, section_key, label, sort_order, visible, protected
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertField = db.prepare(
    `INSERT INTO template_field (
      id, template_id, section_key, field_key, label, sort_order, visible, required, protected
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const builtin of BUILT_IN_TEMPLATES) {
    if (existing.has(builtin.key)) {
      continue;
    }
    const id = templateId(businessId, builtin);
    insertTemplate.run(
      id,
      businessId,
      builtin.key,
      builtin.family,
      builtin.name,
      builtin.purpose,
      builtin.documentType,
      builtin.brandColor,
      builtin.fontFamily,
      builtin.density,
      builtin.isDefault ? 1 : 0,
      now,
      now,
    );
    for (const section of builtin.sections) {
      insertSection.run(
        `${id}:${section.key}`,
        id,
        section.key,
        section.label,
        section.sortOrder,
        section.visible ? 1 : 0,
        section.protected ? 1 : 0,
      );
    }
    for (const field of builtin.fields) {
      insertField.run(
        `${id}:${field.key}`,
        id,
        field.sectionKey,
        field.key,
        field.label,
        field.sortOrder,
        field.visible ? 1 : 0,
        field.required ? 1 : 0,
        field.protected ? 1 : 0,
      );
    }
  }
}

function insertRevision(
  db: SchemaDatabase,
  businessId: string,
  sourceId: string,
  sections: readonly TemplateSectionDefinition[],
  fields: readonly TemplateFieldDefinition[],
  customFields: readonly CustomFieldDefinition[],
  now: string,
): string {
  const source = readTemplate(db, businessId, sourceId);
  if (!source || !source.active) {
    throw new TemplateError("That template was not found.");
  }
  const latest = db
    .prepare(
      `SELECT MAX(version) AS version FROM invoice_template
       WHERE business_id = ? AND builtin_key = ?`,
    )
    .get(businessId, source.key);
  if (wholeNumber(latest?.version) !== source.version) {
    throw new TemplateError("Edit the current version of this template.");
  }
  const version = source.version + 1;
  const id = `tpl:${businessId}:${source.key}:${version}`;
  if (source.isDefault) {
    db.prepare(
      `UPDATE invoice_template SET is_default = 0
       WHERE business_id = ? AND document_type = ? AND is_default = 1`,
    ).run(businessId, source.documentType);
  }
  db.prepare(
    `INSERT INTO invoice_template (
      id, business_id, builtin_key, family, name, purpose, document_type, version,
      brand_color, font_family, density, is_default, active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
  ).run(
    id,
    businessId,
    source.key,
    source.family,
    source.name,
    source.purpose,
    source.documentType,
    version,
    source.brandColor,
    source.fontFamily,
    source.density,
    source.isDefault ? 1 : 0,
    now,
    now,
  );
  const insertSection = db.prepare(
    `INSERT INTO template_section (
      id, template_id, section_key, label, sort_order, visible, protected
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const section of sections) {
    insertSection.run(
      `${id}:${section.key}`,
      id,
      section.key,
      section.label,
      section.sortOrder,
      section.visible ? 1 : 0,
      section.protected ? 1 : 0,
    );
  }
  const insertField = db.prepare(
    `INSERT INTO template_field (
      id, template_id, section_key, field_key, label, sort_order, visible, required, protected
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const field of fields) {
    insertField.run(
      `${id}:${field.key}`,
      id,
      field.sectionKey,
      field.key,
      field.label,
      field.sortOrder,
      field.visible ? 1 : 0,
      field.required ? 1 : 0,
      field.protected ? 1 : 0,
    );
  }
  insertCustomFields(db, id, customFields);
  return id;
}

function insertCustomFields(db: SchemaDatabase, templateId: string, customFields: readonly CustomFieldDefinition[]): void {
  const insertCustomField = db.prepare(
    `INSERT INTO template_custom_field (
      id, template_id, field_key, section_key, label, field_type, helper_text,
      required, visible, sort_order, default_value
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const field of customFields) {
    insertCustomField.run(
      `tcf:${templateId}:${field.key}`,
      templateId,
      field.key,
      field.sectionKey,
      field.label,
      field.type,
      field.helperText,
      field.required ? 1 : 0,
      field.visible ? 1 : 0,
      field.sortOrder,
      field.defaultValue,
    );
  }
}

export function resolveTemplateId(
  db: SchemaDatabase,
  businessId: string,
  documentType: BuiltInTemplate["documentType"],
  requested: string | null,
  now: string,
): string {
  ensureBuiltInTemplates(db, businessId, now);
  if (requested) {
    const template = readTemplate(db, businessId, requested);
    if (!template || !template.active) {
      throw new TemplateError("That template was not found.");
    }
    if (template.documentType !== documentType) {
      throw new TemplateError("That template does not apply to this document.");
    }
    return template.id;
  }
  const row = db
    .prepare(
      `SELECT id FROM invoice_template
       WHERE business_id = ? AND document_type = ? AND is_default = 1 AND active = 1`,
    )
    .get(businessId, documentType);
  if (!row || typeof row.id !== "string") {
    throw new TemplateError("Choose a template for this document.");
  }
  return row.id;
}

function listTemplates(db: SchemaDatabase, businessId: string): InvoiceTemplate[] {
  return db
    .prepare(
      `SELECT id FROM invoice_template
       WHERE business_id = ?
       ORDER BY document_type ASC, is_default DESC, name ASC, version ASC`,
    )
    .all(businessId)
    .map((row) => {
      const template = readTemplate(db, businessId, text(row.id, "id"));
      if (!template) {
        throw new TemplateError("That template was not found.");
      }
      return template;
    });
}

function readTemplate(db: SchemaDatabase, businessId: string, id: string): InvoiceTemplate | null {
  const row = db
    .prepare(
      `SELECT id, business_id, builtin_key, family, name, purpose, document_type, version,
              brand_color, font_family, density, is_default, active, created_at, updated_at
       FROM invoice_template WHERE id = ? AND business_id = ?`,
    )
    .get(id, businessId);
  if (!row) {
    return null;
  }
  const sections = db
    .prepare(
      `SELECT id, section_key, label, sort_order, visible, protected
       FROM template_section WHERE template_id = ? ORDER BY sort_order ASC, id ASC`,
    )
    .all(id)
    .map(toSection);
  const fields = db
    .prepare(
      `SELECT id, section_key, field_key, label, sort_order, visible, required, protected
       FROM template_field WHERE template_id = ? ORDER BY sort_order ASC, id ASC`,
    )
    .all(id)
    .map(toField);
  return {
    id: text(row.id, "id"),
    businessId: text(row.business_id, "business_id"),
    key: text(row.builtin_key, "builtin_key"),
    family: family(row.family),
    name: text(row.name, "name"),
    purpose: text(row.purpose, "purpose"),
    documentType: documentType(row.document_type),
    version: wholeNumber(row.version),
    brandColor: text(row.brand_color, "brand_color"),
    fontFamily: fontFamily(row.font_family),
    density: density(row.density),
    isDefault: row.is_default === 1,
    active: row.active === 1,
    sections,
    fields,
    customFields: readCustomFields(db, id),
    createdAt: text(row.created_at, "created_at"),
    updatedAt: text(row.updated_at, "updated_at"),
  };
}

function templateId(businessId: string, builtin: BuiltInTemplate): string {
  return `tpl:${businessId}:${builtin.key}:1`;
}

function readCustomFields(db: SchemaDatabase, templateId: string): TemplateCustomField[] {
  return db
    .prepare(
      `SELECT id, field_key, section_key, label, field_type, helper_text, required, visible, sort_order, default_value
       FROM template_custom_field WHERE template_id = ? ORDER BY sort_order ASC, id ASC`,
    )
    .all(templateId)
    .map(toCustomField);
}

function toCustomField(row: Record<string, unknown>): TemplateCustomField {
  const type = text(row.field_type, "field_type");
  if (
    type !== "short_text" &&
    type !== "long_text" &&
    type !== "number" &&
    type !== "date" &&
    type !== "phone" &&
    type !== "email" &&
    type !== "url" &&
    type !== "checkbox"
  ) {
    throw new TemplateError("The stored template is invalid.");
  }
  return {
    id: text(row.id, "id"),
    key: text(row.field_key, "field_key"),
    sectionKey: customFieldSection(text(row.section_key, "section_key")),
    label: text(row.label, "label"),
    type,
    helperText: nullableText(row.helper_text),
    required: row.required === 1,
    visible: row.visible === 1,
    sortOrder: wholeNumber(row.sort_order),
    defaultValue: nullableText(row.default_value),
  };
}

function customFieldSection(value: string): TemplateCustomField["sectionKey"] {
  if (
    value === "header" ||
    value === "business" ||
    value === "customer" ||
    value === "custom-details" ||
    value === "payment" ||
    value === "notes-terms" ||
    value === "footer"
  ) {
    return value;
  }
  throw new TemplateError("The stored template is invalid.");
}

function nullableText(value: unknown): string | null {
  if (value === null) {
    return null;
  }
  if (typeof value !== "string" || value.length === 0) {
    throw new TemplateError("The stored template is invalid.");
  }
  return value;
}

function toSection(row: Record<string, unknown>): TemplateSection {
  return {
    id: text(row.id, "id"),
    key: text(row.section_key, "section_key"),
    label: text(row.label, "label"),
    sortOrder: wholeNumber(row.sort_order),
    visible: row.visible === 1,
    protected: row.protected === 1,
  };
}

function toField(row: Record<string, unknown>): TemplateField {
  return {
    id: text(row.id, "id"),
    key: text(row.field_key, "field_key"),
    sectionKey: text(row.section_key, "section_key"),
    label: text(row.label, "label"),
    sortOrder: wholeNumber(row.sort_order),
    visible: row.visible === 1,
    required: row.required === 1,
    protected: row.protected === 1,
  };
}

function readBusinessId(db: SchemaDatabase): string | null {
  const rows = db.prepare("SELECT id FROM business").all();
  const row = rows[0];
  if (!row || typeof row.id !== "string") {
    return null;
  }
  if (rows.length > 1) {
    throw new TemplateError("More than one business profile is stored.");
  }
  return row.id;
}

function family(value: unknown): TemplateFamily {
  if (
    value === "standard" ||
    value === "gst" ||
    value === "service" ||
    value === "retail" ||
    value === "quotation" ||
    value === "receipt" ||
    value === "bill-of-supply"
  ) {
    return value;
  }
  throw new TemplateError("The stored template is invalid.");
}

function documentType(value: unknown): BuiltInTemplate["documentType"] {
  if (
    value === "tax_invoice" ||
    value === "non_gst_invoice" ||
    value === "bill_of_supply" ||
    value === "quotation" ||
    value === "receipt"
  ) {
    return value;
  }
  throw new TemplateError("The stored template is invalid.");
}

function fontFamily(value: unknown): TemplateFontFamily {
  if (value === "source-sans" || value === "system") {
    return value;
  }
  throw new TemplateError("The stored template is invalid.");
}

function density(value: unknown): TemplateDensity {
  if (value === "comfortable" || value === "compact") {
    return value;
  }
  throw new TemplateError("The stored template is invalid.");
}

function text(value: unknown, column: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TemplateError(`Stored template column ${column} is invalid.`);
  }
  return value;
}

function wholeNumber(value: unknown): number {
  const number = typeof value === "bigint" ? Number(value) : value;
  if (typeof number !== "number" || !Number.isInteger(number)) {
    throw new TemplateError("The stored template is invalid.");
  }
  return number;
}

function rollback(db: SchemaDatabase): void {
  try {
    db.exec("ROLLBACK");
  } catch {
    // The failed statement may already have ended the transaction.
  }
}
