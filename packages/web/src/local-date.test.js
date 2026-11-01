import { afterEach, describe, expect, it } from "vitest";
import { localDateInputValue } from "./local-date.js";

describe("local date input values", () => {
  const originalTimeZone = process.env.TZ;

  afterEach(() => {
    if (originalTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimeZone;
  });

  it("uses the local calendar date around midnight rather than the UTC date", () => {
    process.env.TZ = "Asia/Kolkata";
    const justAfterMidnightInIndia = new Date("2026-10-31T18:35:00.000Z");
    expect(localDateInputValue(justAfterMidnightInIndia)).toBe("2026-11-01");
  });

  it("pads single-digit months and days", () => {
    const date = new Date(2026, 0, 2, 12, 0, 0);
    expect(localDateInputValue(date)).toBe("2026-01-02");
  });
});
