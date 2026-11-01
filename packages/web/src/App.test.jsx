import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import App from "./App.jsx";

describe("Fledge browser shell", () => {
  it("waits for the local database before showing workspace data", () => {
    const html = renderToStaticMarkup(React.createElement(App));

    expect(html).toContain("Opening your local workspace");
    expect(html).toContain("IndexedDB database");
    expect(html).toContain("Opening local storage");
    expect(html).not.toContain("Set up your workspace");
  });
});
