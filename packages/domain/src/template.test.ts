import { describe, expect, it } from "vitest";
import { DOCUMENT_TYPES } from "./billing.js";
import {
  BUILT_IN_TEMPLATES,
  TEMPLATE_FAMILIES,
  TEMPLATE_SECTION_KEYS,
  TemplateError,
  assertTemplateConfiguration,
  assertTemplateLabel,
} from "./template.js";

describe("built-in invoice templates", () => {
  it("covers every family and gives each document type one default", () => {
    expect(new Set(BUILT_IN_TEMPLATES.map((template) => template.family))).toEqual(new Set(TEMPLATE_FAMILIES));
    for (const documentType of DOCUMENT_TYPES) {
      const defaults = BUILT_IN_TEMPLATES.filter(
        (template) => template.documentType === documentType && template.isDefault,
      );
      expect(defaults).toHaveLength(1);
    }
    expect(BUILT_IN_TEMPLATES.find((template) => template.key === "gst:tax_invoice")?.isDefault).toBe(true);
    expect(BUILT_IN_TEMPLATES.find((template) => template.key === "quotation:quotation")?.purpose).toMatch(
      /not a tax invoice/,
    );
  });

  it("keeps the statutory parts visible", () => {
    const gst = BUILT_IN_TEMPLATES.find((template) => template.key === "gst:tax_invoice");
    expect(gst?.sections.map((section) => section.key)).toEqual([...TEMPLATE_SECTION_KEYS]);
    expect(gst?.fields.find((field) => field.key === "supplier_gstin")).toMatchObject({
      visible: true,
      protected: true,
    });
    expect(gst?.fields.find((field) => field.key === "tax_components")?.visible).toBe(true);
    const receipt = BUILT_IN_TEMPLATES.find((template) => template.key === "receipt:receipt");
    expect(receipt?.fields.find((field) => field.key === "tax_components")?.visible).toBe(false);
    expect(receipt?.fields.find((field) => field.key === "grand_total")).toMatchObject({
      visible: true,
      protected: true,
    });
  });

  it("rejects markup and a hidden protected field", () => {
    expect(() => assertTemplateLabel("<script>")).toThrow(TemplateError);
    const gst = BUILT_IN_TEMPLATES.find((template) => template.key === "gst:tax_invoice");
    expect(gst).toBeDefined();
    expect(() =>
      assertTemplateConfiguration({
        ...gst!,
        fields: gst!.fields.map((field) =>
          field.key === "supplier_gstin" ? { ...field, visible: false } : field,
        ),
      }),
    ).toThrow(/stay visible/);
  });
});
