import { describe, expect, it } from "vitest";
import { GST_RULE_VERSIONS, calculateGstDocument } from "./gst.js";
import { gstinCheckCharacter } from "./gstin.js";
import { PREVIEW_NOTICE, renderTemplatePreview } from "./preview.js";
import { STATE_UTS } from "./state-ut.js";
import { BUILT_IN_TEMPLATES } from "./template.js";

const kerala = STATE_UTS.find((state) => state.id === "IN-KL");
const keralaGstin = `32AABCU9603R1Z${gstinCheckCharacter("32AABCU9603R1Z")}`;

describe("template preview", () => {
  it("shows sample GST amounts under the template labels and marks itself as a preview", () => {
    const template = BUILT_IN_TEMPLATES.find((item) => item.key === "gst:tax_invoice");
    expect(template).toBeDefined();
    expect(kerala).toBeDefined();
    const calculation = calculateGstDocument({
      documentType: "tax_invoice",
      documentDate: "2026-10-31",
      gstEnabled: true,
      reverseCharge: false,
      placeOfSupplyStateId: "IN-KL",
      supplier: { stateId: "IN-KL", gstRegistered: true, gstin: keralaGstin },
      recipient: { stateId: "IN-KL", registrationType: "unregistered" },
      lines: [
        {
          description: "Sample consulting",
          quantity: "1",
          unit: "nos",
          rate: "1000",
          discountType: "none",
          taxInclusive: false,
          gstRatePercent: "18",
          taxCategoryId: "taxable",
          hsnSac: "998314",
        },
      ],
      rules: GST_RULE_VERSIONS,
      states: STATE_UTS,
    });
    const preview = renderTemplatePreview({
      template: { ...template!, id: "tpl:sample", version: 1, customFields: [] },
      saved: true,
      supplier: { legalName: "Fledge Traders", gstin: keralaGstin },
      placeOfSupplyName: kerala!.name,
      documentDate: "2026-10-31",
      customer: { name: "Sample Customer", phone: "9847000111", email: "buyer@example.com" },
      notes: "A long preview note that stays intact.",
      calculation,
      customValues: {},
    });
    expect(preview.preview).toBe(true);
    expect(preview.notice).toBe(PREVIEW_NOTICE);
    expect(preview.totals).toMatchObject({ taxableTotal: "1000", taxTotal: "180", grandTotal: "1180" });
    expect(field(preview.sections, "document_number")).toMatchObject({ label: "Number", value: "Preview" });
    expect(field(preview.sections, "tax_components")?.value).toBe("CGST 90, SGST 90");
    expect(field(preview.sections, "grand_total")?.value).toBe("1180");
    expect(preview.items[0]?.description).toBe("Sample consulting");

    const hiddenPhone = renderTemplatePreview({
      template: {
        ...template!,
        id: "tpl:sample",
        version: 1,
        customFields: [],
        fields: template!.fields.map((item) => (item.key === "customer_phone" ? { ...item, visible: false } : item)),
        sections: template!.sections.map((section) =>
          section.key === "customer" ? { ...section, label: "Buyer" } : section,
        ),
      },
      saved: false,
      supplier: { legalName: "Fledge Traders", gstin: keralaGstin },
      placeOfSupplyName: kerala!.name,
      documentDate: "2026-10-31",
      customer: { name: "Sample Customer", phone: "9847000111", email: "buyer@example.com" },
      notes: "A long preview note that stays intact.",
      calculation,
      customValues: {},
    });
    expect(hiddenPhone.saved).toBe(false);
    expect(hiddenPhone.totals.grandTotal).toBe("1180");
    expect(field(hiddenPhone.sections, "customer_phone")).toBeUndefined();
    expect(hiddenPhone.sections.find((section) => section.key === "customer")?.label).toBe("Buyer");
  });
});

function field(
  sections: readonly { fields: readonly { key: string; label: string; value: string }[] }[],
  key: string,
): { key: string; label: string; value: string } | undefined {
  for (const section of sections) {
    const match = section.fields.find((item) => item.key === key);
    if (match) {
      return match;
    }
  }
  return undefined;
}
