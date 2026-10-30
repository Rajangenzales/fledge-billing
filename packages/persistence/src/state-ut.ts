import { STATE_UTS, type StateUt, type StateUtType } from "@fledge/domain";
import type { SchemaDatabase } from "./connection.js";
import type { Migration } from "./migrate.js";

export const stateUtMaster: Migration = {
  version: 1,
  name: "state-ut-master",
  up(db) {
    db.exec(`
      CREATE TABLE state_ut (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        code TEXT NOT NULL UNIQUE,
        gst_state_code TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL CHECK (type IN ('state', 'union_territory')),
        country_code TEXT NOT NULL CHECK (country_code = 'IN'),
        active INTEGER NOT NULL CHECK (active IN (0, 1))
      )
    `);
    const insert = db.prepare(`
      INSERT INTO state_ut (
        id, name, code, gst_state_code, type, country_code, active
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const record of STATE_UTS) {
      insert.run(
        record.id,
        record.name,
        record.code,
        record.gstStateCode,
        record.type,
        record.countryCode,
        record.active ? 1 : 0,
      );
    }
  },
};

/** Reads the seeded master. Rows are ordered by GST state code. */
export function listStateUts(db: SchemaDatabase): StateUt[] {
  return db
    .prepare(
      `SELECT id, name, code, gst_state_code, type, country_code, active
       FROM state_ut
       ORDER BY gst_state_code ASC`,
    )
    .all()
    .map(toStateUt);
}

function toStateUt(row: Record<string, unknown>): StateUt {
  const type = row.type;
  if (type !== "state" && type !== "union_territory") {
    throw new Error("Stored State/UT type is invalid.");
  }
  if (row.country_code !== "IN") {
    throw new Error("Stored State/UT country is invalid.");
  }
  return {
    id: requiredString(row.id, "id"),
    name: requiredString(row.name, "name"),
    code: requiredString(row.code, "code"),
    gstStateCode: requiredString(row.gst_state_code, "gst_state_code"),
    type: type as StateUtType,
    countryCode: "IN",
    active: row.active === 1,
  };
}

function requiredString(value: unknown, column: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Stored State/UT column ${column} is invalid.`);
  }
  return value;
}
