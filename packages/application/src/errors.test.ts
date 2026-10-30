import { describe, expect, it } from "vitest";
import { toUserFacingMessage } from "./errors.js";

describe("toUserFacingMessage", () => {
  it("returns a message carried by a domain or persistence error", () => {
    const error = new Error("Migration failed and was rolled back.");
    Object.assign(error, {
      userMessage: "Migration failed and was rolled back.",
    });
    expect(toUserFacingMessage(error)).toBe(
      "Migration failed and was rolled back.",
    );
  });

  it("hides unexpected errors", () => {
    expect(toUserFacingMessage(new Error("sqlite syntax"))).toBe(
      "Something went wrong. Check the logs for details.",
    );
  });
});