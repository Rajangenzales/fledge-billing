import { describe, expect, it } from "vitest";
import { DOCUMENT_TYPES } from "./billing.js";
import {
  BUILT_IN_TEMPLATES,
  TEMPLATE_FAMILIES,
  TEMPLATE_SECTION_KEYS,
  TemplateError,
  assertTemplateConfiguration,
  assertTemplateLabel,
  reviseTemplateConfiguration,
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

describe("template label revisions", () => {
  const gst = () => {
    const template = BUILT_IN_TEMPLATES.find((item) => item.key === "gst:tax_invoice");
    if (!template) {
      throw new Error("missing GST template");
    }
    return template;
  };

  it("renames a safe label and hides an optional field", () => {
    const revised = reviseTemplateConfiguration(gst(), {
      sections: [{ key: "customer", label: "Buyer" }],
      fields: [
        { key: "customer_name", label: "Client" },
        { key: "customer_phone", visible: false },
      ],
    });
    expect(revised.sections.find((section) => section.key === "customer")).toMatchObject({
      label: "Buyer",
      visible: true,
      protected: true,
    });
    expect(revised.fields.find((field) => field.key === "customer_name")?.label).toBe("Client");
    expect(revised.fields.find((field) => field.key === "customer_phone")).toMatchObject({ visible: false });
    expect(revised.fields.find((field) => field.key === "supplier_gstin")).toMatchObject({
      label: "GSTIN",
      visible: true,
      protected: true,
    });
    expect(revised.sections.find((section) => section.key === "tax-summary")?.label).toBe("Tax summary");
  });

  it("rejects a hidden statutory field, a renamed statutory label, and a statutory alias", () => {
    expect(() => reviseTemplateConfiguration(gst(), { fields: [{ key: "supplier_gstin", visible: false }] })).toThrow(
      /stay visible/,
    );
    expect(() => reviseTemplateConfiguration(gst(), { fields: [{ key: "supplier_gstin", label: "Tax id" }] })).toThrow(
      /Keep the label "GSTIN"/,
    );
    expect(() => reviseTemplateConfiguration(gst(), { fields: [{ key: "customer_phone", label: "GSTIN" }] })).toThrow(
      /statutory heading/,
    );
    expect(() => reviseTemplateConfiguration(gst(), { fields: [{ key: "notes", label: "<b>Notes</b>" }] })).toThrow(
      TemplateError,
    );
    expect(() =>
      reviseTemplateConfiguration(gst(), {
        sections: [{ key: "notes-terms", visible: false }],
      }),
    ).toThrow(/Show this section/);
    expect(() => reviseTemplateConfiguration(gst(), {})).toThrow(/new template version/);
  });
});
