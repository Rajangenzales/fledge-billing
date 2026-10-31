import type { Migration } from "./migrate.js";

/**
 * Adds an immutable receipt-time identity payload.
 * Existing rows remain NULL: current master data is not historical evidence.
 */
export const receiptIdentitySnapshot: Migration = {
  version: 12,
  name: "receipt-identity-snapshot",
  up(db) {
    db.exec("ALTER TABLE customer_receipt ADD COLUMN identity_snapshot_json TEXT");
  },
};
