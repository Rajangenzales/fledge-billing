import type { Migration } from "./migrate.js";
import { stateUtMaster } from "./state-ut.js";

/** Schema changes shipped with this application build. */
export const migrations: readonly Migration[] = [stateUtMaster];
