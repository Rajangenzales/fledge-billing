import { describe, expect, it } from "vitest";
import {
  assertRequiredCustomFields,
  reviseCustomFields,
  snapshotCustomFields,
} from "./custom-field.js";
import { BUILT_IN_TEMPLATES, TemplateError } from "./template.js";

const sections = BUILT_IN_TEMPLATES.find((template) => template.key === "gst:tax_invoice")!.sections;

describe("custom invoice fields", () => {
  it("adds a text field without treating it as a statutory heading", () => {
    const fields = reviseCustomFields([], sections, [
      {
        label: "Batch No.",
        type: "short_text",
        required: true,
        helperText: "Printed on the carton",
        sectionKey: "customer",
      },
    ]);
    expect(fields).toEqual([
      {
        key: "batch-no",
        sectionKey: "customer",
        label: "Batch No.",
        type: "short_text",
        helperText: "Printed on the carton",
        required: true,
        visible: true,
        sortOrder: 0,
        defaultValue: null,
      },
    ]);
    const snapshot = snapshotCustomFields(fields, [{ key: "batch-no", value: "A-12" }], []);
    expect(snapshot[0]?.value).toBe("A-12");
  });

  it("rejects statutory names, unsupported sections, and invalid values", () => {
    expect(() => reviseCustomFields([], sections, [{ label: "GSTIN", type: "short_text" }])).toThrow(
      /statutory heading/,
    );
    expect(() => reviseCustomFields([], sections, [{ label: "Route", type: "short_text", key: "gstin" }])).toThrow(
      /simple name/,
    );
    expect(() =>
      reviseCustomFields([], sections, [{ label: "Route", type: "short_text", sectionKey: "tax-summary" }]),
    ).toThrow(/supported section/);
    expect(() =>
      reviseCustomFields([], sections, [{ label: "Route", type: "short_text", required: true, visible: false }]),
    ).toThrow(/stay visible/);
    const hiddenSection = sections.map((section) =>
      section.key === "custom-details" ? { ...section, visible: false } : section,
    );
    expect(() => reviseCustomFields([], hiddenSection, [{ label: "Route", type: "short_text" }])).toThrow(
      /Show this section/,
    );
    const email = reviseCustomFields([], sections, [{ label: "Contact", type: "email", sectionKey: "customer" }]);
    expect(() => snapshotCustomFields(email, [{ key: "contact", value: "not-an-email" }], [])).toThrow(/valid email/);
    expect(() => snapshotCustomFields(email, [{ key: "contact", value: "javascript:alert(1)" }], [])).toThrow(
      TemplateError,
    );
    const link = reviseCustomFields([], sections, [{ label: "Tracking", type: "url", sectionKey: "customer" }]);
    expect(() => snapshotCustomFields(link, [{ key: "tracking", value: "javascript:alert(1)" }], [])).toThrow(
      /web address/,
    );
    const day = reviseCustomFields([], sections, [{ label: "Delivery date", type: "date", sectionKey: "customer" }]);
    expect(() => snapshotCustomFields(day, [{ key: "delivery-date", value: "2026-02-31" }], [])).toThrow(/YYYY-MM-DD/);
    expect(() =>
      assertRequiredCustomFields([{ label: "Batch No.", required: true, value: null, sortOrder: 0 }]),
    ).toThrow(/Enter Batch No\./);
  });
});
