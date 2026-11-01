import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import App from "./App.jsx";

describe("Fledge browser shell", () => {
  it("renders the local-first overview without pretending billing data exists", () => {
    const html = renderToStaticMarkup(React.createElement(App));

    expect(html).toContain("Fledge");
    expect(html).toContain("Good morning.");
    expect(html).toContain("Set up your workspace");
    expect(html).toContain("No data yet");
    expect(html).toContain("No data sync");
  });
});
