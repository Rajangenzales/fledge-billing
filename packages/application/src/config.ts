import { AppError } from "./errors.js";

const LOG_LEVELS = new Set(["debug", "info", "warn", "error"]);

export type AppConfig = {
  nodeEnv: string;
  logLevel: "debug" | "info" | "warn" | "error";
  port: number;
  databasePath: string;
};

function parsePort(raw: string | undefined): number {
  if (raw === undefined || raw === "") {
    return 3847;
  }
  const port = Number.parseInt(raw, 10);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new AppError(
      "CONFIG_INVALID",
      "FLEDGE_PORT must be an integer from 0 to 65535. Use 0 to let the system choose a port.",
    );
  }
  return port;
}

function parseDatabasePath(raw: string | undefined): string {
  const path = (raw ?? "data/fledge.sqlite").trim();
  if (path.length === 0 || path.includes("\0")) {
    throw new AppError(
      "CONFIG_INVALID",
      "FLEDGE_DATABASE must be a file path or :memory:.",
    );
  }
  return path;
}

function parseLogLevel(raw: string | undefined): AppConfig["logLevel"] {
  const level = (raw ?? "info").toLowerCase();
  if (!LOG_LEVELS.has(level)) {
    throw new AppError(
      "CONFIG_INVALID",
      "LOG_LEVEL must be one of: debug, info, warn, error.",
    );
  }
  return level as AppConfig["logLevel"];
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  try {
    return {
      nodeEnv: env.NODE_ENV ?? "development",
      logLevel: parseLogLevel(env.LOG_LEVEL),
      port: parsePort(env.FLEDGE_PORT),
      databasePath: parseDatabasePath(env.FLEDGE_DATABASE),
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(
      "CONFIG_INVALID",
      "Application configuration could not be loaded.",
      error,
    );
  }
}
