import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import App, { BusinessSettings } from "./App.jsx";

describe("business settings form", () => {
  it("loads and exposes business type, payment details and invoice preferences", () => {
    const html = renderToStaticMarkup(React.createElement(BusinessSettings, {
      business: {
        legalName: "Fledge Traders",
        displayName: "Fledge",
        address: "Market Road",
        stateId: "IN-KL",
        gstRegistered: false,
        businessType: "Wholesale",
        paymentDetails: "UPI: fledge@example",
        invoicePreferences: "Payment due within 30 days",
      },
      onSave: () => undefined,
    }));

    expect(html).toContain("Business type");
    expect(html).toContain("Wholesale");
    expect(html).toContain("Payment details");
    expect(html).toContain("UPI: fledge@example");
    expect(html).toContain("Default invoice notes and preferences");
    expect(html).toContain("Payment due within 30 days");
  });
  it("offers the seven ready-to-bill business sectors", () => {
    const html = renderToStaticMarkup(React.createElement(BusinessSettings, {
      business: {
        legalName: "Taxi Services",
        address: "Market Road",
        stateId: "IN-KL",
        gstRegistered: false,
        businessType: "Taxi / Cab Operator",
      },
      onSave: () => undefined,
    }));

    expect(html).toContain("Taxi / Cab Operator");
    expect(html).toContain("Goods Transport Agency");
    expect(html).toContain("Other / custom");
  });
});

describe("Fledge browser shell", () => {
  it("waits for the local database before showing workspace data", () => {
    const html = renderToStaticMarkup(React.createElement(App));

    expect(html).toContain("Opening your local workspace");
    expect(html).toContain("IndexedDB database");
    expect(html).toContain("Opening local storage");
    expect(html).not.toContain("Set up your workspace");
  });
});
