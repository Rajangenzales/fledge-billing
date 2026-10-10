#!/usr/bin/env node
import {
  loadConfig,
  createLogger,
  toUserFacingMessage,
  AppError,
} from "@fledge/application";
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

  const { close } = await startShellServer(config, log);

  const shutdown = async () => {
    log.info("Shutting down application shell");
    await close();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((error) => {
  const message =
    error instanceof AppError
      ? error.userMessage
      : toUserFacingMessage(error);
  console.error(message);
  process.exit(1);
});
