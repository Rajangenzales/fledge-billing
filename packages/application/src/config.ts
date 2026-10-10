import { AppError } from "./errors.js";

const LOG_LEVELS = new Set(["debug", "info", "warn", "error"]);

export type AppConfig = {
  nodeEnv: string;
  logLevel: "debug" | "info" | "warn" | "error";
  port: number;
};

function parsePort(raw: string | undefined): number {
  if (raw === undefined || raw === "") {
    return 3847;
  }
  const port = Number.parseInt(raw, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new AppError(
      "CONFIG_INVALID",
      "FLEDGE_PORT must be an integer between 1 and 65535.",
    );
  }
  return port;
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
