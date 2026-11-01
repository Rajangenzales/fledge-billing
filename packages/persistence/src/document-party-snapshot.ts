import type { Migration } from "./migrate.js";

export const documentPartySnapshot: Migration = {
  version: 14,
  name: "document-party-snapshot",
  up(db) {
    db.exec(`
      ALTER TABLE document ADD COLUMN supplier_snapshot TEXT;
      ALTER TABLE document ADD COLUMN recipient_snapshot TEXT;
    `);
  },
};
