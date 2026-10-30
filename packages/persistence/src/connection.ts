import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type SqlValue = string | number | bigint | null;

export type SqlStatement = {
  run: (...params: SqlValue[]) => void;
  get: (...params: SqlValue[]) => Record<string, unknown> | undefined;
  all: (...params: SqlValue[]) => Record<string, unknown>[];
};

/** Local SQLite connection used by the migration runner and, later, repositories. */
export type SchemaDatabase = {
  exec: (sql: string) => void;
  prepare: (sql: string) => SqlStatement;
  close: () => void;
};

/**
 * Opens a local database. `:memory:` stays in memory. Any other path creates
 * the parent directory and stores a file. The driver is Node's built-in SQLite.
 */
export function openDatabase(path: string): SchemaDatabase {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }
  const sqlite = new DatabaseSync(path);
  sqlite.exec("PRAGMA foreign_keys = ON");
  return {
    exec(sql) {
      sqlite.exec(sql);
    },
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      return {
        run(...params) {
          statement.run(...(params as Parameters<typeof statement.run>));
        },
        get(...params) {
          return statement.get(...(params as Parameters<typeof statement.get>)) as
            | Record<string, unknown>
            | undefined;
        },
        all(...params) {
          return statement.all(...(params as Parameters<typeof statement.all>)) as Record<
            string,
            unknown
          >[];
        },
      };
    },
    close() {
      sqlite.close();
    },
  };
}
