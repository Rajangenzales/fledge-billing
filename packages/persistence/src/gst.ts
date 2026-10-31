import { GST_RULE_VERSIONS, type GstRuleVersion } from "@fledge/domain";
import type { SchemaDatabase } from "./connection.js";
import type { Migration } from "./migrate.js";

export const gstEngine: Migration = {
  version: 6,
  name: "gst-engine",
  up(db) {
    db.exec(`
      CREATE TABLE gst_rule_version (
        id TEXT PRIMARY KEY,
        version TEXT NOT NULL,
        effective_from TEXT NOT NULL,
        effective_to TEXT,
        source_reference TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('active', 'superseded')),
        notes TEXT NOT NULL
      )
    `);
    db.exec(`
      CREATE TABLE gst_rule_utgst_territory (
        rule_version_id TEXT NOT NULL REFERENCES gst_rule_version(id),
        gst_state_code TEXT NOT NULL,
        PRIMARY KEY (rule_version_id, gst_state_code)
      )
    `);
    const insertRule = db.prepare(
      `INSERT INTO gst_rule_version (
        id, version, effective_from, effective_to, source_reference, status, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertTerritory = db.prepare(
      `INSERT INTO gst_rule_utgst_territory (rule_version_id, gst_state_code) VALUES (?, ?)`,
    );
    for (const rule of GST_RULE_VERSIONS) {
      insertRule.run(
        rule.id,
        rule.version,
        rule.effectiveFrom,
        rule.effectiveTo,
        rule.sourceReference,
        rule.status,
        rule.notes,
      );
      for (const code of rule.utgstStateCodes) {
        insertTerritory.run(rule.id, code);
      }
    }

    db.exec("ALTER TABLE document ADD COLUMN supplier_state_id TEXT REFERENCES state_ut(id)");
    db.exec("ALTER TABLE document ADD COLUMN supplier_gst_registered INTEGER NOT NULL DEFAULT 0");
    db.exec("ALTER TABLE document ADD COLUMN supplier_gstin TEXT");
    db.exec("ALTER TABLE document ADD COLUMN recipient_state_id TEXT REFERENCES state_ut(id)");
    db.exec("ALTER TABLE document ADD COLUMN recipient_registration_type TEXT");
    db.exec("ALTER TABLE document ADD COLUMN recipient_gstin TEXT");
    db.exec("ALTER TABLE document ADD COLUMN reverse_charge INTEGER NOT NULL DEFAULT 0");
    db.exec("ALTER TABLE document ADD COLUMN exempt_total TEXT NOT NULL DEFAULT '0'");
    db.exec("ALTER TABLE document ADD COLUMN non_gst_total TEXT NOT NULL DEFAULT '0'");
    db.exec("ALTER TABLE document ADD COLUMN rounding_residual TEXT NOT NULL DEFAULT '0'");
    db.exec("ALTER TABLE document ADD COLUMN cess_total TEXT NOT NULL DEFAULT '0'");
    db.exec("ALTER TABLE document ADD COLUMN calculation_notes TEXT NOT NULL DEFAULT ''");
    db.exec(`
      UPDATE document SET
        supplier_state_id = (SELECT state_id FROM business WHERE business.id = document.business_id),
        supplier_gst_registered = (SELECT gst_registered FROM business WHERE business.id = document.business_id),
        supplier_gstin = (SELECT gstin FROM business WHERE business.id = document.business_id),
        recipient_state_id = (SELECT state_ut_id FROM customer WHERE customer.id = document.customer_id),
        recipient_registration_type = (
          SELECT registration_type FROM customer WHERE customer.id = document.customer_id
        ),
        recipient_gstin = (SELECT gstin FROM customer WHERE customer.id = document.customer_id)
    `);

    db.exec("ALTER TABLE document_item ADD COLUMN tax_category_id TEXT REFERENCES tax_category(id)");
    db.exec("ALTER TABLE document_item ADD COLUMN supply_nature TEXT");
    db.exec(`
      UPDATE document_item
      SET tax_category_id = CASE
        WHEN gst_rate_snapshot IS NOT NULL THEN 'taxable'
        ELSE 'non-gst'
      END
    `);
    db.exec("ALTER TABLE document_charge ADD COLUMN tax_category_id TEXT REFERENCES tax_category(id)");
    db.exec("ALTER TABLE document_charge ADD COLUMN gst_rate_snapshot TEXT");
    db.exec(`
      UPDATE document_charge
      SET tax_category_id = CASE WHEN taxable = 1 THEN 'taxable' ELSE 'non-gst' END
    `);

    db.exec(`
      CREATE TABLE document_tax (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL REFERENCES document(id),
        document_item_id TEXT REFERENCES document_item(id),
        document_charge_id TEXT REFERENCES document_charge(id),
        tax_type TEXT NOT NULL CHECK (tax_type IN ('CGST', 'SGST', 'UTGST', 'IGST', 'CESS')),
        rate TEXT NOT NULL,
        taxable_value TEXT NOT NULL,
        amount TEXT NOT NULL,
        jurisdiction_state_id TEXT NOT NULL REFERENCES state_ut(id),
        rule_version_id TEXT NOT NULL REFERENCES gst_rule_version(id),
        reverse_charge INTEGER NOT NULL CHECK (reverse_charge IN (0, 1)),
        CHECK (
          (document_item_id IS NOT NULL AND document_charge_id IS NULL)
          OR (document_item_id IS NULL AND document_charge_id IS NOT NULL)
        )
      )
    `);
    db.exec("CREATE INDEX document_tax_document ON document_tax(document_id)");
  },
};

export function readGstRuleVersions(db: SchemaDatabase): GstRuleVersion[] {
  const rules = db
    .prepare(
      `SELECT id, version, effective_from, effective_to, source_reference, status, notes
       FROM gst_rule_version
       ORDER BY effective_from ASC, id ASC`,
    )
    .all();
  return rules.map((row) => {
    const id = text(row.id);
    const status = row.status;
    if (status !== "active" && status !== "superseded") {
      throw new Error("The stored GST rule status is invalid.");
    }
    const codes = db
      .prepare(
        `SELECT gst_state_code FROM gst_rule_utgst_territory
         WHERE rule_version_id = ?
         ORDER BY gst_state_code ASC`,
      )
      .all(id)
      .map((territory) => text(territory.gst_state_code));
    return {
      id,
      version: text(row.version),
      effectiveFrom: text(row.effective_from),
      effectiveTo: row.effective_to === null ? null : text(row.effective_to),
      sourceReference: text(row.source_reference),
      status,
      notes: text(row.notes),
      utgstStateCodes: codes,
    };
  });
}

function text(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("A stored GST rule field is invalid.");
  }
  return value;
}
