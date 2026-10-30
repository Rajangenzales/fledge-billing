import { describe, expect, it } from "vitest";
import { createLogger, loadConfig } from "@fledge/application";
import { getShellStatus, startShellServer } from "./shell.js";

describe("application shell", () => {
  it("reports M0 status from configuration", () => {
    const status = getShellStatus(loadConfig({ NODE_ENV: "test" }));
    expect(status.name).toBe("Fledge Billing");
    expect(status.version).toBe("0.0.0-m0");
    expect(status.domainLayer).toBe("domain");
    expect(status.nodeEnv).toBe("test");
  });

  it("reports the schema version from the health endpoint", async () => {
    const config = loadConfig({ NODE_ENV: "test", LOG_LEVEL: "error", FLEDGE_PORT: "0" });
    const server = await startShellServer(config, createLogger(config), 0);
    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/health`);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        ok: true,
        name: "Fledge Billing",
        schemaVersion: 0,
      });
    } finally {
      await server.close();
    }
  });
});
