import type { AppConfig } from "./config.js";

const LEVEL_ORDER = { debug: 0, info: 1, warn: 2, error: 3 } as const;

export type Logger = {
  debug: (message: string, meta?: Record<string, unknown>) => void;
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
};

function shouldLog(
  configLevel: AppConfig["logLevel"],
  messageLevel: keyof typeof LEVEL_ORDER,
): boolean {
  return LEVEL_ORDER[messageLevel] >= LEVEL_ORDER[configLevel];
}

function write(
  level: string,
  message: string,
  meta?: Record<string, unknown>,
): void {
  const line = JSON.stringify({
    time: new Date().toISOString(),
    level,
    message,
    ...meta,
  });
  if (level === "error") {
    console.error(line);
  } else {
    console.log(line);
  }
}

export function createLogger(config: AppConfig): Logger {
  return {
    debug: (message, meta) => {
      if (shouldLog(config.logLevel, "debug")) write("debug", message, meta);
    },
    info: (message, meta) => {
      if (shouldLog(config.logLevel, "info")) write("info", message, meta);
    },
    warn: (message, meta) => {
      if (shouldLog(config.logLevel, "warn")) write("warn", message, meta);
    },
    error: (message, meta) => {
      if (shouldLog(config.logLevel, "error")) write("error", message, meta);
    },
  };
}
