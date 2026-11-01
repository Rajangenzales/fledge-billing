import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ProductDirectory from "./ProductDirectory.jsx";

describe("browser product directory", () => {
  it("shows business products and user-configured saved rates", () => {
    const html = renderToStaticMarkup(React.createElement(ProductDirectory, {
      business: { id: "business-1", displayName: "Fledge Traders" },
      products: [{
        id: "product-1",
        name: "Notebook",
        type: "goods",
        active: true,
        taxCategory: { name: "Taxable" },
        savedGstRate: { percentage: "18" },
        defaultPrice: "100.5",
        unit: "nos",
      }],
      rates: [{
        id: "rate-1",
        name: "GST 18",
        percentage: "18",
        active: true,
      }],
      categories: [{ id: "taxable", name: "Taxable" }],
      onNavigate: () => undefined,
      onSaveProduct: () => undefined,
      onSaveRate: () => undefined,
    }));

    expect(html).toContain("Products &amp; services");
    expect(html).toContain("Notebook");
    expect(html).toContain("GST 18");
    expect(html).toContain("Business-configured rates");
    expect(html).toContain("not a statutory reference or tax calculation");
  });

  it("prompts for business setup before allowing catalog work", () => {
    const html = renderToStaticMarkup(React.createElement(ProductDirectory, {
      business: null,
      products: [],
      rates: [],
      categories: [],
      onNavigate: () => undefined,
      onSaveProduct: () => undefined,
      onSaveRate: () => undefined,
    }));

    expect(html).toContain("Set up your business first");
    expect(html).not.toContain("Add product");
  });
});
