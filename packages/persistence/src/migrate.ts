import type { SchemaDatabase } from "./connection.js";

export class MigrationError extends Error {
  readonly userMessage: string;

  constructor(userMessage: string, cause?: unknown) {
    super(userMessage);
    this.name = "MigrationError";
    this.userMessage = userMessage;
    if (cause instanceof Error) {
      this.cause = cause;
    }
  }
}

export type Migration = {
  version: number;
  name: string;
  up: (db: SchemaDatabase) => void;
};

export type MigrateResult = {
  fromVersion: number;
  toVersion: number;
  appliedVersions: number[];
};

export type MigrateOptions = {
  now?: () => string;
};

const MIGRATION_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Applies pending schema migrations in order.
 * Each migration runs in one transaction together with its version row.
 * A failure rolls that migration back and leaves earlier versions in place.
 * The migration list contains no business tables until a later milestone.
 */
export function migrate(
  db: SchemaDatabase,
  migrations: readonly Migration[],
  options: MigrateOptions = {},
): MigrateResult {
  assertMigrationList(migrations);
  ensureMetadata(db);
  const applied = readApplied(db);
  assertHistory(applied, migrations);

  const pending = migrations.slice(applied.length);
  const now = options.now ?? (() => new Date().toISOString());
  for (const migration of pending) {
    applyOne(db, migration, now());
  }

  return {
    fromVersion: applied.length,
    toVersion: applied.length + pending.length,
    appliedVersions: pending.map((migration) => migration.version),
  };
}

/** Highest applied migration version, or 0 when the metadata table is absent or empty. */
export function readSchemaVersion(db: SchemaDatabase): number {
  const table = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migration'",
    )
    .get();
  if (!table) {
    return 0;
  }
  const row = db
    .prepare("SELECT MAX(version) AS version FROM schema_migration")
    .get();
  if (!row || row.version === null || row.version === undefined) {
    return 0;
  }
  return asVersion(row.version);
}

function ensureMetadata(db: SchemaDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migration (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);
}

function applyOne(
  db: SchemaDatabase,
  migration: Migration,
  appliedAt: string,
): void {
  db.exec("BEGIN IMMEDIATE");
  try {
    migration.up(db);
    db.prepare(
      "INSERT INTO schema_migration (version, name, applied_at) VALUES (?, ?, ?)",
    ).run(migration.version, migration.name, appliedAt);
    db.exec("COMMIT");
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // The failed statement may already have ended the transaction.
    }
    throw new MigrationError(
      `Migration "${migration.name}" (version ${migration.version}) failed and was rolled back. The database is still at schema version ${migration.version - 1}.`,
      error,
    );
  }
}

function assertMigrationList(migrations: readonly Migration[]): void {
  const names = new Set<string>();
  for (let index = 0; index < migrations.length; index += 1) {
    const migration = migrations[index];
    const expected = index + 1;
    if (!migration || !Number.isInteger(migration.version) || migration.version !== expected) {
      throw new MigrationError(
        "Migrations must be numbered 1, 2, 3, and so on, without gaps or duplicates.",
      );
    }
    if (typeof migration.name !== "string" || !MIGRATION_NAME.test(migration.name)) {
      throw new MigrationError(
        `Migration version ${expected} needs a lowercase name such as "business-profile".`,
      );
    }
    if (names.has(migration.name)) {
      throw new MigrationError(`Migration name "${migration.name}" is used more than once.`);
    }
    names.add(migration.name);
    if (typeof migration.up !== "function") {
      throw new MigrationError(`Migration "${migration.name}" does not define an upgrade.`);
    }
  }
}

type AppliedMigration = {
  version: number;
  name: string;
};

function readApplied(db: SchemaDatabase): AppliedMigration[] {
  return db
    .prepare("SELECT version, name FROM schema_migration ORDER BY version ASC")
    .all()
    .map((row) => ({
      version: asVersion(row.version),
      name: asName(row.name),
    }));
}

function assertHistory(applied: readonly AppliedMigration[], migrations: readonly Migration[]): void {
  if (applied.length > migrations.length) {
    const installed = applied[applied.length - 1]?.version ?? applied.length;
    throw new MigrationError(
      `This database schema (version ${installed}) is newer than this application (version ${migrations.length}). Open it with a compatible version of Fledge.`,
    );
  }
  for (let index = 0; index < applied.length; index += 1) {
    const row = applied[index];
    const migration = migrations[index];
    if (!row || !migration || row.version !== index + 1) {
      throw new MigrationError(
        "Schema migration history is incomplete. The database was not modified.",
      );
    }
    if (row.version !== migration.version || row.name !== migration.name) {
      throw new MigrationError(
        `Installed migration version ${row.version} is "${row.name}", but this application expects "${migration.name}". The database was not modified.`,
      );
    }
  }
}

function asVersion(value: unknown): number {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  throw new MigrationError("Schema version metadata is unreadable.");
}

function asName(value: unknown): string {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  throw new MigrationError("Schema version metadata is unreadable.");
}
