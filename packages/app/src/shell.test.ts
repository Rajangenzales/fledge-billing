import { describe, expect, it } from "vitest";
import { loadConfig } from "@fledge/application";
import { getShellStatus } from "./shell.js";

describe("application shell", () => {
  it("reports M0 status from configuration", () => {
    const status = getShellStatus(loadConfig({ NODE_ENV: "test" }));
    expect(status.name).toBe("Fledge Billing");
    expect(status.version).toBe("0.0.0-m0");
    expect(status.domainLayer).toBe("domain");
    expect(status.nodeEnv).toBe("test");
  });
});
