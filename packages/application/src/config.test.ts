import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";
import { AppError } from "./errors.js";

describe("loadConfig", () => {
  it("applies defaults for a minimal environment", () => {
    const config = loadConfig({});
    expect(config.port).toBe(3847);
    expect(config.logLevel).toBe("info");
    expect(config.nodeEnv).toBe("development");
  });

  it("rejects invalid port values with a safe message", () => {
    expect(() => loadConfig({ FLEDGE_PORT: "not-a-port" })).toThrow(AppError);
    try {
      loadConfig({ FLEDGE_PORT: "0" });
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).userMessage).toContain("FLEDGE_PORT");
    }
  });
});
