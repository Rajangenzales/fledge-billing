import type { Migration } from "./migrate.js";

/** Stores descriptive promotional terms separately from taxable invoice lines. */
export const documentPromotionalOffers: Migration = {
  version: 17,
  name: "document-promotional-offers",
  up(db) {
    db.exec(`ALTER TABLE document ADD COLUMN promotional_offers_snapshot TEXT NOT NULL DEFAULT '[]'`);
  },
};
