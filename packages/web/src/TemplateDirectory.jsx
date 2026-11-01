import React, { useEffect, useMemo, useState } from "react";
import {
  previewTemplate,
  reviseTemplate,
  setDefaultTemplate,
} from "@fledge/application/browser";
import { CUSTOM_FIELD_TYPES } from "@fledge/domain";

const editableFieldLabels = new Set([
  "document_number",
  "document_date",
  "supplier_legal_name",
  "customer_name",
  "customer_phone",
  "customer_email",
  "grand_total",
  "notes",
  "item_description",
  "item_quantity",
  "item_unit",
  "item_rate",
  "item_amount",
]);
const editableSectionLabels = new Set([
  "header",
  "business",
  "customer",
  "custom-details",
  "items",
  "charges",
  "payment",
  "notes-terms",
  "footer",
]);

function patchFor(template, sections, fields, customFields) {
  const sectionChanges = sections.filter((section) => {
    const original = template.sections.find((item) => item.key === section.key);
    return original && (original.label !== section.label || original.visible !== section.visible);
  }).map(({ key, label, visible }) => ({ key, label, visible }));
  const fieldChanges = fields.filter((field) => {
    const original = template.fields.find((item) => item.key === field.key);
    return original && (original.label !== field.label || original.visible !== field.visible);
  }).map(({ key, label, visible }) => ({ key, label, visible }));
  const customFieldChanges = customFields.map((field) => ({
    key: field.key,
    sectionKey: field.sectionKey,
    label: field.label,
    type: field.type,
    helperText: field.helperText,
    required: field.required,
    visible: field.visible,
    defaultValue: field.defaultValue,
  }));
  return {
    sections: sectionChanges,
    fields: fieldChanges,
    customFields: customFieldChanges,
  };
}

export default function TemplateDirectory({ business, templates, deps, onRefresh }) {
  const [selectedId, setSelectedId] = useState("");
  const [sections, setSections] = useState([]);
  const [fields, setFields] = useState([]);
  const [customFields, setCustomFields] = useState([]);
  const [preview, setPreview] = useState(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const selected = templates.find((template) => template.id === selectedId) ?? null;

  useEffect(() => {
    if (!selected) {
      setSelectedId(templates[0]?.id ?? "");
      return;
    }
    setSections(selected.sections.map((item) => ({ ...item })));
    setFields(selected.fields.map((item) => ({ ...item })));
    setCustomFields(selected.customFields.map((item) => ({ ...item })));
    setPreview(null);
    setMessage("");
  }, [selectedId, templates]);

  const patch = useMemo(
    () => selected ? patchFor(selected, sections, fields, customFields) : undefined,
    [selected, sections, fields, customFields],
  );
  const hasChanges = Boolean(patch && (
    patch.sections.length || patch.fields.length ||
    JSON.stringify(patch.customFields) !== JSON.stringify(selected.customFields.map((field) => ({
      key: field.key,
      sectionKey: field.sectionKey,
      label: field.label,
      type: field.type,
      helperText: field.helperText,
      required: field.required,
      visible: field.visible,
      defaultValue: field.defaultValue,
    })))
  ));

  function updateSection(key, change) {
    setSections((current) => current.map((item) => item.key === key ? { ...item, ...change } : item));
    setPreview(null);
  }

  function updateField(key, change) {
    setFields((current) => current.map((item) => item.key === key ? { ...item, ...change } : item));
    setPreview(null);
  }

  function updateCustomField(index, change) {
    setCustomFields((current) => current.map((item, itemIndex) =>
      itemIndex === index ? { ...item, ...change } : item,
    ));
    setPreview(null);
  }

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      const revision = await reviseTemplate(selected.id, patch, deps);
      setSelectedId(revision.id);
      await onRefresh();
      setMessage("A new template revision was saved. Earlier revisions remain available.");
    } catch (error) {
      setMessage(error?.userMessage || error?.message || "The template could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function chooseDefault() {
    setSaving(true);
    setMessage("");
    try {
      await setDefaultTemplate(selected.id, deps);
      await onRefresh();
      setMessage("Default template updated.");
    } catch (error) {
      setMessage(error?.userMessage || error?.message || "The default could not be changed.");
    } finally {
      setSaving(false);
    }
  }

  async function applyTerminologyToAllTemplates() {
    if (!selected) return;
    setSaving(true);
    setMessage("");
    let updated = 0;
    try {
      const sourceSections = sections.filter((section) => editableSectionLabels.has(section.key));
      const sourceFields = fields.filter((field) => editableFieldLabels.has(field.key));
      const ownSectionChanges = sourceSections
        .filter((source) => selected.sections.find((item) => item.key === source.key)?.label !== source.label)
        .map(({ key, label }) => ({ key, label }));
      const ownFieldChanges = sourceFields
        .filter((source) => selected.fields.find((item) => item.key === source.key)?.label !== source.label)
        .map(({ key, label }) => ({ key, label }));

      if (ownSectionChanges.length || ownFieldChanges.length) {
        await reviseTemplate(selected.id, { sections: ownSectionChanges, fields: ownFieldChanges }, deps);
        updated += 1;
      }

      const targets = templates.filter((template) => template.active && template.id !== selected.id);

      for (const target of targets) {
        const sectionChanges = sourceSections
          .filter((source) => {
            const current = target.sections.find((item) => item.key === source.key);
            return current && current.label !== source.label;
          })
          .map(({ key, label }) => ({ key, label }));
        const fieldChanges = sourceFields
          .filter((source) => {
            const current = target.fields.find((item) => item.key === source.key);
            return current && current.label !== source.label;
          })
          .map(({ key, label }) => ({ key, label }));

        if (sectionChanges.length === 0 && fieldChanges.length === 0) continue;
        await reviseTemplate(target.id, { sections: sectionChanges, fields: fieldChanges }, deps);
        updated += 1;
      }

      await onRefresh();
      setMessage(updated === 0
        ? "These terminology labels already match the other templates."
        : `Terminology applied to ${updated} template${updated === 1 ? "" : "s"}. Earlier invoice revisions remain unchanged.`);
    } catch (error) {
      await onRefresh();
      const reason = error?.userMessage || error?.message || "An unexpected error occurred.";
      setMessage(updated > 0
        ? `Applied terminology to ${updated} template${updated === 1 ? "" : "s"} before stopping. Please review the templates and retry: ${reason}`
        : reason);
    } finally {
      setSaving(false);
    }
  }

  async function showPreview() {
    setMessage("");
    try {
      setPreview(await previewTemplate(selected.id, deps, hasChanges ? patch : undefined));
    } catch (error) {
      setMessage(error?.userMessage || error?.message || "The preview could not be rendered.");
    }
  }

  if (!business) {
    return <section className="workflow-page"><div className="panel empty-state"><h2>Set up your business first</h2><p>Save a business profile before choosing or customizing document templates.</p></div></section>;
  }

  return <section className="workflow-page">
    <div className="page-title"><div><div className="eyebrow">DOCUMENT DESIGN</div><h1>Document templates</h1><p>Choose defaults and customize safe labels, visibility, and text fields. Each save creates a revision.</p></div></div>
    {!templates.length ? <div className="panel empty-state"><p>Built-in templates are not available yet.</p></div> : <>
      <div className="panel template-toolbar">
        <label>Template<select value={selected?.id ?? ""} onChange={(event) => setSelectedId(event.target.value)}>
          {templates.map((template) => <option key={template.id} value={template.id}>{template.name} · {template.documentType.replaceAll("_", " ")} · v{template.version}{template.isDefault ? " · default" : ""}</option>)}
        </select></label>
        {selected && <div className="button-row">
          {!selected.isDefault && <button className="secondary-button" type="button" disabled={saving} onClick={chooseDefault}>Make default</button>}
          <button className="secondary-button" type="button" disabled={saving} onClick={applyTerminologyToAllTemplates}>Apply labels to all templates</button>
          <button className="secondary-button" type="button" onClick={showPreview}>Preview</button>
          <button className="primary-button" type="button" disabled={!hasChanges || saving} onClick={save}>{saving ? "Saving…" : "Save revision"}</button>
        </div>}
      </div>
      {selected && <div className="template-editor-grid">
        <div className="panel template-editor">
          <h2>Sections</h2>
          {sections.map((section) => <div className="template-edit-row" key={section.key}>
            <label>{section.label}<input value={section.label} disabled={!editableSectionLabels.has(section.key)} onChange={(event) => updateSection(section.key, { label: event.target.value })} /></label>
            <label className="checkbox-field"><input type="checkbox" checked={section.visible} disabled={section.protected} onChange={(event) => updateSection(section.key, { visible: event.target.checked })} /> Visible</label>
          </div>)}
          <h2>Fields</h2>
          {fields.map((field) => <div className="template-edit-row" key={field.key}>
            <label>{field.label}<input value={field.label} disabled={!editableFieldLabels.has(field.key)} onChange={(event) => updateField(field.key, { label: event.target.value })} /></label>
            <label className="checkbox-field"><input type="checkbox" checked={field.visible} disabled={field.protected || field.required} onChange={(event) => updateField(field.key, { visible: event.target.checked })} /> Visible</label>
          </div>)}
          <div className="template-custom-heading"><h2>Custom text fields</h2><button className="list-action" type="button" disabled={customFields.length >= 20} onClick={() => setCustomFields((current) => [...current, {
            key: undefined,
            sectionKey: "custom-details",
            label: "",
            type: "short_text",
            helperText: null,
            required: false,
            visible: true,
            sortOrder: current.length,
            defaultValue: null,
          }])}>Add field</button></div>
          {customFields.map((field, index) => <fieldset className="template-custom-field" key={`${field.key}-${index}`}>
            <label>Label<input value={field.label} maxLength={60} onChange={(event) => updateCustomField(index, { label: event.target.value })} /></label>
            <label>Type<select value={field.type} onChange={(event) => updateCustomField(index, { type: event.target.value })}>{CUSTOM_FIELD_TYPES.map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}</select></label>
            <label>Helper text<input value={field.helperText ?? ""} maxLength={80} onChange={(event) => updateCustomField(index, { helperText: event.target.value || null })} /></label>
            <label className="checkbox-field"><input type="checkbox" checked={field.required} onChange={(event) => updateCustomField(index, { required: event.target.checked, visible: event.target.checked || field.visible })} /> Required</label>
            <button type="button" className="list-action" onClick={() => setCustomFields((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove field</button>
          </fieldset>)}
          {message && <p className="form-message" role="status">{message}</p>}
        </div>
        <div className="panel template-preview">
          <div className="eyebrow">REPRESENTATIVE PREVIEW</div>
          {preview ? <>
            <p className="template-preview-notice">{preview.notice}</p>
            <h2 style={{ color: preview.brandColor }}>{selected.name} · v{preview.version}</h2>
            {preview.sections.filter((section) => section.fields.length).map((section) => <section key={section.key}><h3>{section.label}</h3>{section.fields.map((field) => <p key={field.key}><strong>{field.label}:</strong> {field.value}</p>)}</section>)}
            {preview.items.length > 0 && <p className="template-item-column-headings">{Object.values(preview.itemColumnLabels).filter((label) => label !== preview.itemColumnLabels.hsnSac || preview.items.some((item) => item.hsnSac)).join(" | ")}</p>}
            {preview.items.map((item, index) => <p key={`${item.description}-${index}`}>{preview.itemColumnLabels.description}: {item.description} · {preview.itemColumnLabels.quantity}: {item.quantity} · {preview.itemColumnLabels.unit}: {item.unit} · {preview.itemColumnLabels.rate}: ₹{item.rate} · {preview.itemColumnLabels.amount}: ₹{item.amount}{item.hsnSac ? ` · ${preview.itemColumnLabels.hsnSac}: ${item.hsnSac}` : ""}</p>)}
            <p><strong>Total: ₹{preview.totals.grandTotal}</strong></p>
          </> : <p>Preview a representative sample to check the selected template revision. It is not a saved billing document.</p>}
        </div>
      </div>}
    </>}
  </section>;
}
