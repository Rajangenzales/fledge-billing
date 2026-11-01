import type { Migration } from "./migrate.js";

export const documentDueDate: Migration = {
  version: 13,
  name: "document-due-date",
  up(db) {
    db.exec("ALTER TABLE document ADD COLUMN due_date TEXT");
  },
};
