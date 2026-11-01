import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import PaymentsDirectory from "./PaymentsDirectory.jsx";

describe("browser payments directory", () => {
  it("distinguishes ordinary payment receipts from statutory GST vouchers", () => {
    const html = renderToStaticMarkup(React.createElement(PaymentsDirectory, {
      business: { id: "business-1" },
      customers: [{ id: "customer-1", name: "Harbour Stores", active: true }],
      documents: [],
      onLoadActivity: async () => ({ activity: null, receipts: [] }),
      onGetInvoiceSettlement: async () => null,
      onRecordReceipt: async () => undefined,
      onAllocate: async () => undefined,
      onReleaseAllocation: async () => undefined,
      onRecordRefund: async () => undefined,
      onReverseReceipt: async () => undefined,
      onReverseRefund: async () => undefined,
    }));

    expect(html).toContain("Receipts &amp; advances");
    expect(html).toContain("not statutory GST receipt vouchers");
    expect(html).toContain("Record payment");
    expect(html).toContain("Allocate receipt");
    expect(html).toContain("Reverse refund entry");
  });
});
