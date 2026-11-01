import { describe, expect, it } from "vitest";
import { formatOutstandingBalance, sumOutstandingAmounts } from "./dashboard.js";

describe("dashboard outstanding balance", () => {
  it("adds balances using integer paise", () => {
    expect(sumOutstandingAmounts([
      { outstandingAmount: "1250.50" },
      { outstandingAmount: "0.25" },
      { outstandingAmount: "10" },
    ])).toBe("1260.75");
  });

  it("returns zero for an empty invoice set", () => {
    expect(sumOutstandingAmounts([])).toBe("0");
  });

  it("rejects malformed stored amounts", () => {
    expect(() => sumOutstandingAmounts([{ outstandingAmount: "12.345" }])).toThrow(
      "An invoice outstanding balance is invalid.",
    );
  });

  it("formats a valid balance for the dashboard", () => {
    expect(formatOutstandingBalance("1260.75")).toContain("1,260.75");
  });

  it("shows an unavailable state for invalid values", () => {
    expect(formatOutstandingBalance(null)).toBe("Unavailable");
  });
});
