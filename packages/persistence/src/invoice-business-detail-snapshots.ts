import type { Migration } from "./migrate.js";

/** Snapshot invoice payment instructions and default notes at draft-save time. */
export const invoiceBusinessDetailSnapshots: Migration = {
  version: 16,
  name: "invoice-business-detail-snapshots",
  up(db) {
    db.exec(`
      ALTER TABLE document ADD COLUMN payment_details_snapshot TEXT;
      ALTER TABLE document ADD COLUMN invoice_preferences_snapshot TEXT;
    `);
  },
};
