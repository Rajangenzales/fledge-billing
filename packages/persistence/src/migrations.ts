import type { Migration } from "./migrate.js";

/**
 * Schema changes shipped with this application build.
 * M0-B establishes the runner only. Business tables start in a later milestone.
 */
export const migrations: readonly Migration[] = [];
