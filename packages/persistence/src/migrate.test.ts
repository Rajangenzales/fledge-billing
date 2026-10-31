import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase, type SchemaDatabase } from "./connection.js";
import { MigrationError, migrate, readSchemaVersion, type Migration } from "./migrate.js";
import { migrations } from "./migrations.js";

const openDatabases: SchemaDatabase[] = [];
const tempDirs: string[] = [];

function memoryDatabase(): SchemaDatabase {
  const db = openDatabase(":memory:");
  openDatabases.push(db);
  return db;
}

function migration(version: number, name: string, up: Migration["up"] = () => {}): Migration {
  return { version, name, up };
}

afterEach(() => {
  for (const db of openDatabases.splice(0)) {
    db.close();
  }
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("migrate", () => {
  it("ships the State and UT master as the first migration", () => {
    expect(migrations.map((migration) => migration.name)).toEqual([
      "state-ut-master",
      "business-profile",
      "customer",
      "product-service",
      "billing-document",
      "gst-engine",
      "invoice-template",
      "custom-field",
      "customer-receipt",
      "payment-allocation-events",\n      "payment-refund-reversal-events",
    ]);
  });

  it("leaves an empty database at schema version 0", () => {
    const db = memoryDatabase();
    const first = migrate(db, []);
    const second = migrate(db, []);

    expect(first).toEqual({ fromVersion: 0, toVersion: 0, appliedVersions: [] });
    expect(second).toEqual({ fromVersion: 0, toVersion: 0, appliedVersions: [] });
    expect(readSchemaVersion(db)).toBe(0);
  });

  it("applies only pending migrations when the database is already partially current", () => {
    const db = memoryDatabase();
    const steps: Migration[] = [
      migration(1, "first", (database) => {
        database.exec("CREATE TABLE kept (id INTEGER PRIMARY KEY)");
      }),
      migration(2, "second", (database) => {
        database.exec("ALTER TABLE kept ADD COLUMN label TEXT");
      }),
    ];

    const initial = migrate(db, [steps[0]!], { now: () => "2026-10-30T00:00:00.000Z" });
    const pending = migrate(db, steps, { now: () => "2026-10-30T00:01:00.000Z" });
    const current = migrate(db, steps);

    expect(initial.appliedVersions).toEqual([1]);
    expect(pending).toEqual({ fromVersion: 1, toVersion: 2, appliedVersions: [2] });
    expect(current.appliedVersions).toEqual([]);
    expect(readSchemaVersion(db)).toBe(2);
    const row = db
      .prepare("SELECT name, applied_at FROM schema_migration WHERE version = 1")
      .get();
    expect(row).toMatchObject({ name: "first", applied_at: "2026-10-30T00:00:00.000Z" });
  });

  it("rolls back a failed migration and keeps earlier versions", () => {
    const db = memoryDatabase();
    const steps: Migration[] = [
      migration(1, "first", (database) => {
        database.exec("CREATE TABLE kept (id INTEGER PRIMARY KEY)");
      }),
      migration(2, "second", (database) => {
        database.exec("CREATE TABLE partial (id INTEGER PRIMARY KEY)");
        database.exec("INSERT INTO partial (id) VALUES (1)");
        throw new Error("disk full");
      }),
    ];

    expect(() => migrate(db, steps)).toThrow(MigrationError);
    try {
      migrate(db, steps);
    } catch (error) {
      expect(error).toBeInstanceOf(MigrationError);
      expect((error as MigrationError).userMessage).toContain("schema version 1");
    }
    expect(readSchemaVersion(db)).toBe(1);
    expect(tableNames(db)).toContain("kept");
    expect(tableNames(db)).not.toContain("partial");
  });

  it("refuses a gapped migration list before changing the database", () => {
    const db = memoryDatabase();
    expect(() =>
      migrate(db, [migration(1, "first"), migration(3, "third")]),
    ).toThrow(MigrationError);
    expect(tableNames(db)).toEqual([]);
  });

  it("refuses a database newer than this application without modifying it", () => {
    const db = memoryDatabase();
    const steps = [migration(1, "first"), migration(2, "second")];
    migrate(db, steps);

    expect(() => migrate(db, [steps[0]!])).toThrow(MigrationError);
    expect(readSchemaVersion(db)).toBe(2);
    expect(
      db.prepare("SELECT COUNT(*) AS count FROM schema_migration").get(),
    ).toMatchObject({ count: 2 });
  });

  it("refuses a renamed installed migration without applying later ones", () => {
    const db = memoryDatabase();
    migrate(db, [migration(1, "first")]);

    expect(() =>
      migrate(db, [
        migration(1, "renamed"),
        migration(2, "second", (database) => {
          database.exec("CREATE TABLE should_not_exist (id INTEGER)");
        }),
      ]),
    ).toThrow(MigrationError);
    expect(readSchemaVersion(db)).toBe(1);
    expect(tableNames(db)).not.toContain("should_not_exist");
  });

  it("reopens a file database at the current schema version", () => {
    const dir = mkdtempSync(join(tmpdir(), "fledge-m0b-"));
    tempDirs.push(dir);
    const path = join(dir, "nested", "fledge.sqlite");
    const created = openDatabase(path);
    migrate(created, [
      migration(1, "first", (database) => {
        database.exec("CREATE TABLE kept (id INTEGER PRIMARY KEY)");
      }),
    ]);
    created.close();

    const reopened = openDatabase(path);
    openDatabases.push(reopened);
    const result = migrate(reopened, [
      migration(1, "first"),
      migration(2, "second"),
    ]);
    expect(result).toEqual({ fromVersion: 1, toVersion: 2, appliedVersions: [2] });
    const foreignKeys = reopened.prepare("PRAGMA foreign_keys").get();
    expect(foreignKeys).toMatchObject({ foreign_keys: 1 });
  });
});

function tableNames(db: SchemaDatabase): string[] {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map((row) => String(row.name));
}
