import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { buildCustomerReceiptPdf } from "./customer-receipt-pdf.js";
import type { PrintableCustomerReceipt } from "./customer-receipt.js";

const receipt: PrintableCustomerReceipt = {
  receiptId: "receipt-001",
  paymentDate: "2026-10-30",
  amount: "1250.50",
  method: "upi",
  externalReference: "UPI-REF-1",
  notes: "Advance for order",
  businessName: "Fledge Traders",
  businessAddress: "Market Road, Kochi, Kerala, 682001",
  businessPhone: "9876543210",
  businessEmail: "accounts@example.test",
  businessGstin: null,
  customerName: "Harbour Stores",
  customerAddress: "Beach Road, Kochi, Kerala, 682002",
  customerPhone: null,
  customerEmail: null,
  customerGstin: null,
};

describe("payment receipt PDF", () => {
  it("creates a readable A4 PDF from saved receipt details", async () => {
    const bytes = await buildCustomerReceiptPdf(receipt);
    expect(Buffer.from(bytes).subarray(0, 5).toString("ascii")).toBe("%PDF-");
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getTitle()).toBe("Payment Receipt receipt-001");
  });
});
