import type { Migration } from "./migrate.js";

/** Adds a per-customer commercial credit period. Existing customers are due immediately. */
export const customerCreditPeriod: Migration = {
  version: 15,
  name: "customer-credit-period",
  up(db) {
    db.exec(`
      ALTER TABLE customer
      ADD COLUMN credit_days INTEGER NOT NULL DEFAULT 0
      CHECK (credit_days BETWEEN 0 AND 365)
    `);
  },
};
