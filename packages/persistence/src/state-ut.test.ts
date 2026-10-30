import { STATE_UTS } from "@fledge/domain";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase, type SchemaDatabase } from "./connection.js";
import { migrate, readSchemaVersion } from "./migrate.js";
import { migrations } from "./migrations.js";
import { listStateUts } from "./state-ut.js";

const openDatabases: SchemaDatabase[] = [];

afterEach(() => {
  for (const db of openDatabases.splice(0)) {
    db.close();
  }
});

describe("state and UT migration", () => {
  it("seeds the domain master and does not insert it again", () => {
    const db = openDatabase(":memory:");
    openDatabases.push(db);

    const first = migrate(db, migrations);
    const stored = listStateUts(db);
    const second = migrate(db, migrations);

    expect(first).toEqual({ fromVersion: 0, toVersion: 2, appliedVersions: [1, 2] });
    expect(second.appliedVersions).toEqual([]);
    expect(readSchemaVersion(db)).toBe(2);
    expect(stored).toEqual(STATE_UTS);
    expect(stored.find((record) => record.id === "IN-KL")).toMatchObject({
      gstStateCode: "32",
      active: true,
    });
    expect(stored.find((record) => record.gstStateCode === "25")?.active).toBe(false);
  });
});
