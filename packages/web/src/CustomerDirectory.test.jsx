import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CustomerDirectory } from "./App.jsx";

describe("browser customer directory", () => {
  it("requires a saved business profile before customer records can be added", () => {
    const html = renderToStaticMarkup(React.createElement(CustomerDirectory, {
      business: null,
      customers: [],
      onSave: () => undefined,
      onNavigate: () => undefined,
    }));

    expect(html).toContain("Set up your business first");
    expect(html).toContain("Add business details");
    expect(html).not.toContain("Add customer</button>");
  });

  it("shows saved and inactive customers with their credit terms", () => {
    const html = renderToStaticMarkup(React.createElement(CustomerDirectory, {
      business: { id: "business-1", stateId: "IN-KL" },
      customers: [
        {
          id: "customer-1",
          name: "Harbour Stores",
          stateUt: { name: "Kerala" },
          registrationType: "registered",
          creditDays: 30,
          active: true,
          phone: "9876543210",
          billingAddress: "Beach Road, Kochi",
        },
        {
          id: "customer-2",
          name: "Old Market Shop",
          stateUt: { name: "Tamil Nadu" },
          registrationType: "unregistered",
          creditDays: 0,
          active: false,
          phone: null,
          email: null,
          billingAddress: "Market Street",
        },
      ],
      onSave: () => undefined,
      onNavigate: () => undefined,
    }));

    expect(html).toContain("Harbour Stores");
    expect(html).toContain("Kerala");
    expect(html).toContain("Net 30");
    expect(html).toContain("Old Market Shop");
    expect(html).toContain("Inactive");
    expect(html).toContain("Due immediately");
    expect(html).toContain("Market Street");
  });
});
