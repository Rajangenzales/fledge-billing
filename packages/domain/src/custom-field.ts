/**
 * Vendor-defined invoice fields. They store text on a document.
 * They do not change amounts, tax, numbering, or document status.
 */

import { TemplateError, assertTemplateLabel } from "./template.js";

export const CUSTOM_FIELD_TYPES = [
  "short_text",
  "long_text",
  "number",
  "date",
  "phone",
  "email",
  "url",
  "checkbox",
] as const;

export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

export const CUSTOM_FIELD_SECTIONS = [
  "header",
  "business",
  "customer",
  "custom-details",
  "payment",
  "notes-terms",
  "footer",
] as const;

export type CustomFieldSection = (typeof CUSTOM_FIELD_SECTIONS)[number];

const MAX_CUSTOM_FIELDS = 20;

const RESERVED_LABELS = new Set(
  [
    "Number",
    "Date",
    "Supplier",
    "GSTIN",
    "Place of supply",
    "HSN/SAC",
    "Taxable value",
    "Tax",
    "Reverse charge",
    "Total",
    "Tax summary",
    "Totals",
    "HSN",
    "SAC",
    "CGST",
    "SGST",
    "UTGST",
    "IGST",
  ].map((label) => label.toLowerCase()),
);

const RESERVED_KEYS = new Set([
  "gstin",
  "hsn",
  "sac",
  "cgst",
  "sgst",
  "utgst",
  "igst",
  "tax",
  "total",
  "taxable-value",
  "place-of-supply",
  "reverse-charge",
  "document-number",
  "document-date",
]);

export type CustomFieldDefinition = {
  key: string;
  sectionKey: CustomFieldSection;
  label: string;
  type: CustomFieldType;
  helperText: string | null;
  required: boolean;
  visible: boolean;
  sortOrder: number;
  defaultValue: string | null;
};

export type CustomFieldDraft = {
  key?: string;
  sectionKey?: string;
  label: string;
  type: string;
  helperText?: string | null;
  required?: boolean;
  visible?: boolean;
  defaultValue?: string | null;
};

export type CustomFieldSnapshot = {
  key: string;
  sectionKey: string;
  label: string;
  type: CustomFieldType;
  helperText: string | null;
  required: boolean;
  visible: boolean;
  sortOrder: number;
  value: string | null;
};

export function reviseCustomFields(
  current: readonly CustomFieldDefinition[],
  sections: readonly { key: string; visible: boolean }[],
  patch: readonly CustomFieldDraft[] | undefined,
): CustomFieldDefinition[] {
  if (patch === undefined) {
    return current.map((field) => ({ ...field }));
  }
  if (patch.length > MAX_CUSTOM_FIELDS) {
    throw new TemplateError("Use at most 20 custom fields.");
  }
  const fields: CustomFieldDefinition[] = [];
  const keys = new Set<string>();
  const labels = new Set<string>();
  patch.forEach((draft, index) => {
    const label = assertCustomFieldLabel(draft.label);
    const labelKey = label.toLowerCase();
    if (labels.has(labelKey)) {
      throw new TemplateError("Choose a different label for each custom field.");
    }
    labels.add(labelKey);
    const key = customFieldKey(label, draft.key);
    if (keys.has(key)) {
      throw new TemplateError("Choose each custom field once.");
    }
    keys.add(key);
    const sectionKey = draft.sectionKey === undefined ? "custom-details" : draft.sectionKey;
    if (!isCustomFieldSection(sectionKey)) {
      throw new TemplateError("Put a custom field in a supported section.");
    }
    const type = customFieldType(draft.type);
    const visible = draft.visible ?? true;
    const required = draft.required ?? false;
    if (required && !visible) {
      throw new TemplateError("A required custom field has to stay visible.");
    }
    const section = sections.find((item) => item.key === sectionKey);
    if (visible && section && !section.visible) {
      throw new TemplateError("Show this section before showing a field inside it.");
    }
    const helperText = blankToNull(draft.helperText);
    if (helperText !== null) {
      assertPlainText(helperText, 80, "Enter helper text without code or markup.");
    }
    const defaultValue = normalizeCustomFieldValue(label, type, draft.defaultValue ?? null, true);
    fields.push({
      key,
      sectionKey,
      label,
      type,
      helperText,
      required,
      visible,
      sortOrder: index,
      defaultValue,
    });
  });
  return fields;
}

export function customFieldsChanged(
  current: readonly CustomFieldDefinition[],
  next: readonly CustomFieldDefinition[],
): boolean {
  if (current.length !== next.length) {
    return true;
  }
  return next.some((field, index) => {
    const existing = current[index];
    return (
      !existing ||
      existing.key !== field.key ||
      existing.sectionKey !== field.sectionKey ||
      existing.label !== field.label ||
      existing.type !== field.type ||
      existing.helperText !== field.helperText ||
      existing.required !== field.required ||
      existing.visible !== field.visible ||
      existing.sortOrder !== field.sortOrder ||
      existing.defaultValue !== field.defaultValue
    );
  });
}

export function snapshotCustomFields(
  definitions: readonly CustomFieldDefinition[],
  values: readonly { key: string; value: string | null }[] | undefined,
  existing: readonly { key: string; value: string | null }[],
): CustomFieldSnapshot[] {
  const provided = new Map<string, string | null>();
  const source = values ?? existing;
  for (const entry of source) {
    if (provided.has(entry.key)) {
      throw new TemplateError("Choose each custom field once.");
    }
    provided.set(entry.key, entry.value);
  }
  const visible = definitions.filter((field) => field.visible);
  const known = new Set(visible.map((field) => field.key));
  for (const key of provided.keys()) {
    if (!known.has(key)) {
      throw new TemplateError("That field is not on this template.");
    }
  }
  return [...visible]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((field) => {
      const raw = provided.has(field.key) ? provided.get(field.key) : field.defaultValue;
      return {
        key: field.key,
        sectionKey: field.sectionKey,
        label: field.label,
        type: field.type,
        helperText: field.helperText,
        required: field.required,
        visible: field.visible,
        sortOrder: field.sortOrder,
        value: normalizeCustomFieldValue(field.label, field.type, raw ?? null, false),
      };
    });
}

export function assertRequiredCustomFields(
  fields: readonly { label: string; required: boolean; value: string | null; sortOrder: number }[],
): void {
  const missing = [...fields]
    .filter((field) => field.required && (field.value === null || field.value.trim() === ""))
    .sort((left, right) => left.sortOrder - right.sortOrder)[0];
  if (missing) {
    throw new TemplateError(`Enter ${missing.label}.`);
  }
}

function assertCustomFieldLabel(label: string): string {
  const value = assertTemplateLabel(label);
  if (RESERVED_LABELS.has(value.toLowerCase())) {
    throw new TemplateError("Use a label that does not stand in for a statutory heading.");
  }
  return value;
}

function customFieldKey(label: string, explicit: string | undefined): string {
  const key =
    explicit === undefined
      ? label
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 32)
      : explicit.trim().toLowerCase();
  if (!/^[a-z][a-z0-9-]{0,31}$/.test(key) || RESERVED_KEYS.has(key)) {
    throw new TemplateError("Choose a simple name for this field.");
  }
  return key;
}

function customFieldType(value: string): CustomFieldType {
  if ((CUSTOM_FIELD_TYPES as readonly string[]).includes(value)) {
    return value as CustomFieldType;
  }
  throw new TemplateError("Choose a supported field type.");
}

function isCustomFieldSection(value: string): value is CustomFieldSection {
  return (CUSTOM_FIELD_SECTIONS as readonly string[]).includes(value);
}

function normalizeCustomFieldValue(
  label: string,
  type: CustomFieldType,
  value: string | null,
  rejectEmpty: boolean,
): string | null {
  if (value === null || value === undefined) {
    if (rejectEmpty) {
      return null;
    }
    return null;
  }
  if (typeof value !== "string") {
    throw new TemplateError(`Enter ${label}.`);
  }
  const trimmed = type === "long_text" ? value.replace(/^\s+|\s+$/g, "") : value.trim();
  if (trimmed.length === 0) {
    if (rejectEmpty) {
      return null;
    }
    return null;
  }
  switch (type) {
    case "short_text":
      assertPlainText(trimmed, 80, `Enter ${label} without code or markup.`);
      return trimmed;
    case "long_text":
      assertLongText(trimmed, label);
      return trimmed;
    case "number":
      if (!/^-?(?:0|[1-9]\d{0,11})(\.\d{1,4})?$/.test(trimmed)) {
        throw new TemplateError(`Enter a number for ${label}.`);
      }
      return trimmed;
    case "date":
      assertDate(trimmed, label);
      return trimmed;
    case "phone":
      if (!/^[0-9+().\-\s]{6,20}$/.test(trimmed) || trimmed.replace(/\D/g, "").length < 6) {
        throw new TemplateError(`Enter a phone number for ${label}.`);
      }
      return trimmed;
    case "email":
      if (trimmed.length > 80 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) || /[<>{}`\\]/.test(trimmed)) {
        throw new TemplateError(`Enter a valid email for ${label}.`);
      }
      return trimmed;
    case "url":
      if (
        trimmed.length > 200 ||
        !/^https?:\/\/[^\s<>{}`\\]+$/i.test(trimmed) ||
        /^javascript:/i.test(trimmed) ||
        /^data:/i.test(trimmed)
      ) {
        throw new TemplateError(`Enter a web address for ${label}.`);
      }
      return trimmed;
    case "checkbox":
      if (trimmed !== "yes" && trimmed !== "no") {
        throw new TemplateError(`Choose yes or no for ${label}.`);
      }
      return trimmed;
    default:
      throw new TemplateError("Choose a supported field type.");
  }
}

function assertPlainText(value: string, max: number, message: string): void {
  if (value.length > max || /[<>{}`\\]/.test(value) || /[\u0000-\u001F]/.test(value)) {
    throw new TemplateError(message);
  }
}

function assertLongText(value: string, label: string): void {
  if (value.length > 500 || /[<>{}`\\]/.test(value) || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)) {
    throw new TemplateError(`Enter ${label} without code or markup.`);
  }
}

function assertDate(value: string, label: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new TemplateError(`Enter a date for ${label} as YYYY-MM-DD.`);
  }
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new TemplateError(`Enter a date for ${label} as YYYY-MM-DD.`);
  }
}

function blankToNull(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}
