import { describe, expect, it } from "vitest";
import { DOMAIN_LAYER } from "./index.js";

describe("domain layer", () => {
  it("is wired for future billing and GST modules", () => {
    expect(DOMAIN_LAYER).toBe("domain");
  });
});
