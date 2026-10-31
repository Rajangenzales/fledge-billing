import type { Migration } from "./migrate.js";

export const customField: Migration = {
  version: 8,
  name: "custom-field",
  up(db) {
    db.exec(`
      CREATE TABLE template_custom_field (
        id TEXT PRIMARY KEY,
        template_id TEXT NOT NULL REFERENCES invoice_template(id),
        field_key TEXT NOT NULL,
        section_key TEXT NOT NULL CHECK (
          section_key IN (
            'header', 'business', 'customer', 'custom-details', 'payment', 'notes-terms', 'footer'
          )
        ),
        label TEXT NOT NULL,
        field_type TEXT NOT NULL CHECK (
          field_type IN (
            'short_text', 'long_text', 'number', 'date', 'phone', 'email', 'url', 'checkbox'
          )
        ),
        helper_text TEXT,
        required INTEGER NOT NULL CHECK (required IN (0, 1)),
        visible INTEGER NOT NULL CHECK (visible IN (0, 1)),
        sort_order INTEGER NOT NULL,
        default_value TEXT,
        UNIQUE (template_id, field_key)
      )
    `);
    db.exec(`
      CREATE TABLE document_custom_field (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL REFERENCES document(id),
        field_key TEXT NOT NULL,
        section_key TEXT NOT NULL CHECK (
          section_key IN (
            'header', 'business', 'customer', 'custom-details', 'payment', 'notes-terms', 'footer'
          )
        ),
        label TEXT NOT NULL,
        field_type TEXT NOT NULL CHECK (
          field_type IN (
            'short_text', 'long_text', 'number', 'date', 'phone', 'email', 'url', 'checkbox'
          )
        ),
        helper_text TEXT,
        required INTEGER NOT NULL CHECK (required IN (0, 1)),
        visible INTEGER NOT NULL CHECK (visible IN (0, 1)),
        sort_order INTEGER NOT NULL,
        value TEXT,
        UNIQUE (document_id, field_key)
      )
    `);
  },
};
