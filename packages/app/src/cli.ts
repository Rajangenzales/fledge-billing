#!/usr/bin/env node
import {
  loadConfig,
  createLogger,
  toUserFacingMessage,
} from "@fledge/application";
import { migrate, migrations, openDatabase } from "@fledge/persistence";
import { getShellStatus, startShellServer } from "./shell.js";
import { APP_NAME, APP_VERSION } from "./version.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const serve = args.includes("--serve");

  let config;
  try {
    config = loadConfig();
  } catch (error) {
    console.error(toUserFacingMessage(error));
    process.exit(1);
  }

  const log = createLogger(config);

  if (!serve) {
    const status = getShellStatus(config);
    log.info(`${APP_NAME} shell ready`, status);
    console.log(
      JSON.stringify({ ok: true, message: `${APP_NAME} ${APP_VERSION}` }),
    );
    return;
  }

  const database = openDatabase(config.databasePath);
  try {
    const schema = migrate(database, migrations);
    log.info("Database schema ready", { schemaVersion: schema.toVersion });
    const server = await startShellServer(config, log, schema.toVersion);

    const shutdown = async () => {
      log.info("Shutting down application shell");
      await server.close();
      database.close();
      process.exit(0);
    };

    process.on("SIGINT", () => {
      void shutdown();
    });
    process.on("SIGTERM", () => {
      void shutdown();
    });
  } catch (error) {
    database.close();
    throw error;
  }
}

main().catch((error) => {
  console.error(toUserFacingMessage(error));
  process.exit(1);
});
