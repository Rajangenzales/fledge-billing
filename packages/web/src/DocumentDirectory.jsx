import React, { useState } from "react";
import { invoicePdfFilename, TAX_CATEGORIES } from "@fledge/domain";
import IssuedDocumentOutput from "./IssuedDocumentOutput.jsx";
import { STATE_UTS } from "@fledge/domain";

const documentTypes = [
  ["tax_invoice", "Tax invoice"],
  ["non_gst_invoice", "Non-GST invoice"],
  ["bill_of_supply", "Bill of supply"],
  ["quotation", "Quotation"],
];

function addCalendarDays(dateValue, days) {
  const [year, month, day] = dateValue.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function dueDateForCustomer(documentDate, customer) {
  const creditDays = Number.isInteger(customer?.creditDays) ? customer.creditDays : 0;
  return creditDays > 0 ? addCalendarDays(documentDate, creditDays) : "";
}

function defaultForm(business, customers, templates) {
  const documentType = business?.gstRegistered ? "tax_invoice" : "non_gst_invoice";
  const defaultTemplate = templates.find((template) =>
    template.documentType === documentType && template.isDefault && template.active,
  );
  const customer = customers.find((item) => item.active);
  const documentDate = new Date().toISOString().slice(0, 10);
  return {
    id: null,
    customerId: customer?.id ?? "",
    documentType,
    templateId: defaultTemplate?.id ?? "",
    customFieldValues: Object.fromEntries(
      (defaultTemplate?.customFields ?? []).map((field) => [field.key, field.defaultValue ?? ""]),
    ),
    documentDate,
    dueDate: dueDateForCustomer(documentDate, customer),
    dueDateManuallySet: false,
    placeOfSupplyStateId: business?.stateId ?? "",
    quotationGstEnabled: false,
    reverseCharge: false,
    lines: [],
    charges: [],
  };
}

function formFromDocument(document) {
  return {
    id: document.id,
    customerId: document.customerId,
    documentType: document.documentType,
    templateId: document.templateId ?? "",
    customFieldValues: Object.fromEntries(document.customFields.map((field) => [field.key, field.value ?? ""])),
    documentDate: document.documentDate,
    dueDate: document.dueDate ?? "",
    dueDateManuallySet: Boolean(document.dueDate),
    placeOfSupplyStateId: document.placeOfSupplyStateId ?? "",
    quotationGstEnabled: document.documentType === "quotation" && document.gstEnabled,
    reverseCharge: document.reverseCharge,
    charges: (document.charges ?? []).map((charge) => ({
      description: charge.description,
      amount: charge.amount,
      taxCategoryId: charge.taxCategoryId,
      gstRatePercent: charge.gstRatePercent ?? "",
    })),
    lines: document.lines.map((line) => ({
      productId: line.productId ?? "",
      description: line.description,
      hsnSac: line.hsnSac ?? "",
      quantity: line.quantity,
      unit: line.unit,
      rate: line.rate,
      discountType: line.discountType,
      discountValue: line.discountType === "none" ? "0" : line.discountValue,
      taxInclusive: line.taxInclusive,
      gstRatePercent: line.gstRatePercent ?? "",
      taxCategoryId: line.taxCategoryId,
    })),
  };
}

function lineFromProduct(product) {
  return {
    productId: product.id,
    description: product.description || product.name,
    hsnSac: product.hsnSac ?? "",
    quantity: "1",
    unit: product.unit,
    rate: product.defaultPrice,
    discountType: Number(product.defaultDiscount) > 0 ? "amount" : "none",
    discountValue: product.defaultDiscount,
    taxInclusive: product.taxInclusive,
    gstRatePercent: product.savedGstRate?.percentage ?? "",
    taxCategoryId: product.taxCategoryId,
  };
}

function documentInput(form) {
  const gstEnabled = form.documentType === "tax_invoice" ||
    (form.documentType === "quotation" && form.quotationGstEnabled);
  return {
    customerId: form.customerId,
    documentType: form.documentType,
    templateId: form.templateId || null,
    customFields: Object.entries(form.customFieldValues).map(([key, value]) => ({ key, value: value || null })),
    documentDate: form.documentDate,
    dueDate: form.dueDate || null,
    placeOfSupplyStateId: gstEnabled ? form.placeOfSupplyStateId : null,
    gstEnabled,
    reverseCharge: gstEnabled && form.reverseCharge,
    charges: form.charges.map((charge) => ({
      description: charge.description,
      amount: charge.amount,
      taxable: gstEnabled && charge.taxCategoryId === "taxable",
      taxCategoryId: gstEnabled ? charge.taxCategoryId : "non-gst",
      gstRatePercent: gstEnabled && charge.taxCategoryId === "taxable" ? charge.gstRatePercent || null : null,
    })),
    lines: form.lines.map((line) => ({
      ...line,
      hsnSac: line.hsnSac || null,
      discountValue: line.discountType === "none" ? null : line.discountValue,
      gstRatePercent: line.gstRatePercent || null,
      supplyNature: null,
    })),
  };
}

function money(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value));
}

export default function DocumentDirectory({
  business,
  customers,
  products,
  templates,
  documents,
  onNavigate,
  onSave,
  onFinalize,
  onCancel,
  onRenderIssued,
}) {
  const [form, setForm] = useState(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmFinalize, setConfirmFinalize] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [savedPreview, setSavedPreview] = useState(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState(null);
  const [selectedRender, setSelectedRender] = useState(null);
  const [outputBusy, setOutputBusy] = useState(false);
  const [outputMessage, setOutputMessage] = useState("");
  const activeProducts = products.filter((product) => product.active);
  const activeCustomers = customers.filter((customer) => customer.active);
  const selectedDocument = documents.find((document) => document.id === selectedDocumentId);
  const applicableTemplates = templates.filter((template) =>
    template.documentType === form?.documentType && template.active,
  );
  const selectedTemplate = applicableTemplates.find((template) => template.id === form?.templateId);
  const gstEnabled = form && (
    form.documentType === "tax_invoice" ||
    (form.documentType === "quotation" && form.quotationGstEnabled)
  );

  function startNew() {
    setForm(defaultForm(business, activeCustomers, templates));
    setSelectedDocumentId(null);
    setSelectedRender(null);
    setConfirmCancel(false);
    setConfirmFinalize(false);
    setMessage("");
    setDirty(true);
    setSavedPreview(null);
  }

  function editDraft(document) {
    setForm(formFromDocument(document));
    setSelectedDocumentId(null);
    setSelectedRender(null);
    setConfirmCancel(false);
    setConfirmFinalize(false);
    setMessage("");
    setDirty(false);
    setSavedPreview(document);
  }

  function updateForm(field, value) {
    setForm((current) => {
      const next = { ...current, [field]: value };
      if (field === "dueDate") next.dueDateManuallySet = Boolean(value);
      if (field === "documentDate" && !current.dueDateManuallySet) {
        const customer = customers.find((item) => item.id === current.customerId);
        next.dueDate = dueDateForCustomer(value, customer);
      }
      return next;
    });
    setMessage("");
    setDirty(true);
    setSavedPreview(null);
    setConfirmFinalize(false);
  }

  function changeDocumentType(documentType) {
    const defaultTemplate = templates.find((template) =>
      template.documentType === documentType && template.isDefault && template.active,
    );
    setForm((current) => ({
      ...current,
      documentType,
      templateId: defaultTemplate?.id ?? "",
      customFieldValues: Object.fromEntries(
        (defaultTemplate?.customFields ?? []).map((field) => [field.key, field.defaultValue ?? ""]),
      ),
      quotationGstEnabled: documentType === "quotation" ? current.quotationGstEnabled : false,
    }));
    setMessage("");
    setDirty(true);
    setSavedPreview(null);
  }

  function changeTemplate(templateId) {
    const template = applicableTemplates.find((item) => item.id === templateId);
    setForm((current) => ({
      ...current,
      templateId,
      customFieldValues: Object.fromEntries(
        (template?.customFields ?? []).map((field) => [field.key, field.defaultValue ?? ""]),
      ),
    }));
    setMessage("");
    setDirty(true);
    setSavedPreview(null);
  }

  function updateCustomValue(key, value) {
    setForm((current) => ({
      ...current,
      customFieldValues: { ...current.customFieldValues, [key]: value },
    }));
    setMessage("");
    setDirty(true);
    setSavedPreview(null);
    setConfirmFinalize(false);
  }

  function updateLine(index, field, value) {
    setForm((current) => ({
      ...current,
      lines: current.lines.map((line, lineIndex) =>
        lineIndex === index ? { ...line, [field]: value } : line,
      ),
    }));
    setMessage("");
    setDirty(true);
    setSavedPreview(null);
    setConfirmFinalize(false);
  }

  async function saveDraft(event) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const saved = await onSave(form.id, documentInput(form));
      setForm((current) => ({ ...current, id: saved.id }));
      setDirty(false);
      setSavedPreview(saved);
      setMessage("Draft saved on this device. Totals are recalculated when saved.");
    } catch (error) {
      setMessage(error?.userMessage || error?.message || "The draft could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function finalize() {
    setSaving(true);
    setMessage("");
    try {
      await onFinalize(form.id);
      setForm(null);
      setMessage("");
    } catch (error) {
      setMessage(error?.userMessage || error?.message || "The document could not be finalized.");
    } finally {
      setSaving(false);
    }
  }

  async function cancelDocument() {
    setSaving(true);
    setMessage("");
    try {
      await onCancel(form.id);
      setForm(null);
      setConfirmCancel(false);
    } catch (error) {
      setMessage(error?.userMessage || error?.message || "The document could not be cancelled.");
    } finally {
      setSaving(false);
    }
  }

  async function viewDocument(document) {
    setSelectedDocumentId(document.id);
    setSelectedRender(null);
    setOutputMessage("");
    if (document.status === "cancelled") {
      return;
    }
    setOutputBusy(true);
    try {
      setSelectedRender(await onRenderIssued(document.id));
    } catch (error) {
      setOutputMessage(error?.userMessage || error?.message || "The document preview could not be loaded.");
    } finally {
      setOutputBusy(false);
    }
  }

  async function createPdfFile(render) {
    const { buildInvoicePdf } = await import("@fledge/application/pdf");
    const bytes = await buildInvoicePdf(render);
    return new File(
      [bytes],
      invoicePdfFilename(render.documentType, render.documentNumber, render.documentDate),
      { type: "application/pdf" },
    );
  }

  function downloadFile(file) {
    const url = window.URL.createObjectURL(file);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = file.name;
    anchor.style.display = "none";
    document.body.append(anchor);
    try {
      anchor.click();
    } finally {
      anchor.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
    }
  }

  async function downloadDocumentPdf() {
    setOutputBusy(true);
    setOutputMessage("");
    try {
      downloadFile(await createPdfFile(selectedRender));
      setOutputMessage("PDF downloaded.");
    } catch (error) {
      setOutputMessage(error?.userMessage || error?.message || "The PDF could not be downloaded.");
    } finally {
      setOutputBusy(false);
    }
  }

  async function shareDocumentPdf() {
    setOutputBusy(true);
    setOutputMessage("");
    try {
      const file = await createPdfFile(selectedRender);
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: file.name });
        setOutputMessage("PDF shared.");
      } else {
        downloadFile(file);
        setOutputMessage("File sharing is not available in this browser; the PDF was downloaded instead.");
      }
    } catch (error) {
      setOutputMessage(error?.userMessage || error?.message || "The PDF could not be shared.");
    } finally {
      setOutputBusy(false);
    }
  }

  function printDocument() {
    setOutputMessage("");
    try {
      window.print();
    } catch (error) {
      setOutputMessage(error?.message || "The print dialog could not be opened.");
    }
  }

  function addProductLine(product) {
    setForm((current) => ({ ...current, lines: [...current.lines, lineFromProduct(product)] }));
    setDirty(true);
    setSavedPreview(null);
    setMessage("");
    setConfirmFinalize(false);
  }

  function addCharge() {
    setForm((current) => ({
      ...current,
      charges: [...current.charges, { description: "", amount: "", taxCategoryId: gstEnabled ? "taxable" : "non-gst", gstRatePercent: "" }],
    }));
    setDirty(true);
    setSavedPreview(null);
    setMessage("");
    setConfirmFinalize(false);
  }

  function updateCharge(index, field, value) {
    setForm((current) => ({
      ...current,
      charges: current.charges.map((charge, chargeIndex) =>
        chargeIndex === index ? {
          ...charge,
          [field]: value,
          ...(field === "taxCategoryId" && value !== "taxable" ? { gstRatePercent: "" } : {}),
        } : charge,
      ),
    }));
    setDirty(true);
    setSavedPreview(null);
    setMessage("");
    setConfirmFinalize(false);
  }

  function removeCharge(index) {
    setForm((current) => ({ ...current, charges: current.charges.filter((_, chargeIndex) => chargeIndex !== index) }));
    setDirty(true);
    setSavedPreview(null);
    setMessage("");
    setConfirmFinalize(false);
  }

  function removeLine(index) {
    setForm((current) => ({
      ...current,
      lines: current.lines.filter((_, lineIndex) => lineIndex !== index),
    }));
    setDirty(true);
    setSavedPreview(null);
    setMessage("");
    setConfirmFinalize(false);
  }

  return <section className="workflow-page">
    <div className="page-title">
      <div><div className="eyebrow">YOUR BUSINESS</div><h1>Invoices &amp; documents</h1><p>Create drafts, review calculated totals, and issue numbered billing documents.</p></div>
      {business && activeCustomers.length > 0 && activeProducts.length > 0 &&
        <button className="primary-button" onClick={startNew}>＋ New document</button>}
    </div>
    <p className="gst-limitation" role="note">GST calculations use the rate you enter and place of supply you select. Fledge does not verify rates against HSN/SAC or determine place of supply or reverse-charge applicability. Verify these details against current rules before issuing.</p>
    <p className="template-limitation">Choose a saved template revision for each document. Manage layouts and custom fields under Document templates.</p>
    {!business && <div className="panel empty-state"><h2>Set up your business first</h2><p>A business profile is required before billing documents can be created.</p><button className="primary-button" onClick={() => onNavigate("settings")}>Add business details</button></div>}
    {business && activeCustomers.length === 0 && <div className="panel empty-state"><h2>Add a customer first</h2><p>Choose an active customer for each billing document.</p><button className="primary-button" onClick={() => onNavigate("customers")}>Add customer</button></div>}
    {business && activeCustomers.length > 0 && activeProducts.length === 0 && <div className="panel empty-state"><h2>Add a product or service first</h2><p>Document lines are selected from your active business catalog.</p><button className="primary-button" onClick={() => onNavigate("products")}>Add product or service</button></div>}

    {form && <form className="panel form-panel document-form" onSubmit={saveDraft}>
      <div className="panel-heading"><div><div className="eyebrow">{form.id ? "SAVED DRAFT" : "NEW DOCUMENT"}</div><h2>{form.id ? "Edit draft" : "Create billing document"}</h2></div><button className="list-action" type="button" onClick={() => setForm(null)}>Close</button></div>
      <div className="form-grid">
        <label>Document type<select value={form.documentType} onChange={(event) => {
          changeDocumentType(event.target.value);
        }}>{documentTypes.filter(([type]) => type !== "tax_invoice" || business.gstRegistered).map(([type, label]) => <option key={type} value={type}>{label}</option>)}</select></label>
        <label>Template<select required value={form.templateId} onChange={(event) => changeTemplate(event.target.value)}><option value="">Choose template</option>{applicableTemplates.map((template) => <option key={template.id} value={template.id}>{template.name} · v{template.version}{template.isDefault ? " · default" : ""}</option>)}</select></label>
        <label>Document date<input required type="date" value={form.documentDate} onChange={(event) => updateForm("documentDate", event.target.value)} /></label>
        <label>Due date<input type="date" min={form.documentDate} value={form.dueDate} onChange={(event) => updateForm("dueDate", event.target.value)} /><small>{form.dueDateManuallySet ? "Custom due date. You can edit it anytime while this is a draft." : "Suggested from the customer credit period. You can change it."}</small></label>
        <label>Customer<select required value={form.customerId} onChange={(event) => {
          const customerId = event.target.value;
          setForm((current) => ({ ...current, customerId, ...(!current.dueDateManuallySet ? { dueDate: dueDateForCustomer(current.documentDate, customers.find((item) => item.id === customerId)) } : {}) }));
          setMessage(""); setDirty(true); setSavedPreview(null); setConfirmFinalize(false);
        }}><option value="">Choose customer</option>{activeCustomers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>
        {gstEnabled && <label>Place of supply<select required value={form.placeOfSupplyStateId} onChange={(event) => updateForm("placeOfSupplyStateId", event.target.value)}><option value="">Choose State / UT</option>{STATE_UTS.filter((state) => state.active).map((state) => <option key={state.id} value={state.id}>{state.name}</option>)}</select></label>}
        {form.documentType === "quotation" && business.gstRegistered && <label className="checkbox-field"><input type="checkbox" checked={form.quotationGstEnabled} onChange={(event) => updateForm("quotationGstEnabled", event.target.checked)} /> Calculate GST on this quotation</label>}
        {gstEnabled && <label className="checkbox-field"><input type="checkbox" checked={form.reverseCharge} onChange={(event) => updateForm("reverseCharge", event.target.checked)} /> Reverse charge applies</label>}
      </div>
      {selectedTemplate?.customFields.filter((field) => field.visible).map((field) => <label className="document-custom-field" key={field.key}>
        {field.label}{field.required && " *"}
        {field.type === "long_text"
          ? <textarea required={field.required} maxLength={2000} value={form.customFieldValues[field.key] ?? ""} onChange={(event) => updateCustomValue(field.key, event.target.value)} />
          : field.type === "checkbox"
          ? <input type="checkbox" checked={form.customFieldValues[field.key] === "yes"} onChange={(event) => updateCustomValue(field.key, event.target.checked ? "yes" : "no")} />
          : <input
            required={field.required}
            type={field.type === "date" ? "date" : field.type === "email" ? "email" : field.type === "url" ? "url" : field.type === "number" ? "number" : "text"}
            maxLength={field.type === "short_text" ? 120 : undefined}
            value={form.customFieldValues[field.key] ?? ""}
            onChange={(event) => updateCustomValue(field.key, event.target.value)}
          />}
        {field.helperText && <small>{field.helperText}</small>}
      </label>)}
      <div className="document-lines-heading"><h3>Items</h3><select aria-label="Choose a product to add" value="" onChange={(event) => {
        const product = activeProducts.find((item) => item.id === event.target.value);
        if (product) addProductLine(product);
      }}><option value="">Add item from catalog…</option>{activeProducts.map((product) => <option key={product.id} value={product.id}>{product.name} · {money(product.defaultPrice)}</option>)}</select></div>
      {form.lines.length === 0 ? <p className="empty-line-note">Select an active product or service to add the first line.</p> : <div className="document-lines">
        {form.lines.map((line, index) => <fieldset className="document-line" key={`${line.productId || "custom"}-${index}`}>
          <legend>Item {index + 1}</legend>
          <label>Description<input required maxLength={200} value={line.description} onChange={(event) => updateLine(index, "description", event.target.value)} /></label>
          <label>Quantity<input required inputMode="decimal" value={line.quantity} onChange={(event) => updateLine(index, "quantity", event.target.value)} /></label>
          <label>Unit<input required maxLength={16} value={line.unit} onChange={(event) => updateLine(index, "unit", event.target.value)} /></label>
          <label>Rate (₹)<input required inputMode="decimal" value={line.rate} onChange={(event) => updateLine(index, "rate", event.target.value)} /></label>
          <label>Discount<select value={line.discountType} onChange={(event) => updateLine(index, "discountType", event.target.value)}><option value="none">None</option><option value="amount">Amount</option><option value="percent">Percent</option></select></label>
          {line.discountType !== "none" && <label>Discount value<input required inputMode="decimal" value={line.discountValue} onChange={(event) => updateLine(index, "discountValue", event.target.value)} /></label>}
          <label>GST rate (%)<input inputMode="decimal" value={line.gstRatePercent} disabled={line.taxCategoryId !== "taxable"} onChange={(event) => updateLine(index, "gstRatePercent", event.target.value)} /></label>
          <label>HSN / SAC<input maxLength={8} value={line.hsnSac} onChange={(event) => updateLine(index, "hsnSac", event.target.value)} /></label>
          <label className="checkbox-field"><input type="checkbox" checked={line.taxInclusive} onChange={(event) => updateLine(index, "taxInclusive", event.target.checked)} /> Rate includes GST</label>
          <button className="list-action" type="button" onClick={() => removeLine(index)}>Remove</button>
        </fieldset>)}
      </div>}
      <section className="document-charges" aria-label="Additional charges">
        <div className="document-lines-heading">
          <h3>Additional charges</h3>
          <button className="secondary-button" type="button" onClick={addCharge}>Add charge</button>
        </div>
        {form.charges.length === 0
          ? <p className="empty-line-note">Optional delivery, packing or other charges can be added here.</p>
          : <div className="document-lines">{form.charges.map((charge, index) => <fieldset className="document-line" key={index}>
            <legend>Charge {index + 1}</legend>
            <label>Description<input required maxLength={200} value={charge.description} onChange={(event) => updateCharge(index, "description", event.target.value)} placeholder="Delivery / Packing" /></label>
            <label>Amount (₹)<input required inputMode="decimal" value={charge.amount} onChange={(event) => updateCharge(index, "amount", event.target.value)} placeholder="0.00" /></label>
            {gstEnabled && <label>Tax category<select value={charge.taxCategoryId} onChange={(event) => updateCharge(index, "taxCategoryId", event.target.value)}>{TAX_CATEGORIES.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>}
            {gstEnabled && charge.taxCategoryId === "taxable" && <label>GST rate (%)<input required inputMode="decimal" value={charge.gstRatePercent} onChange={(event) => updateCharge(index, "gstRatePercent", event.target.value)} /></label>}
            <button className="list-action" type="button" onClick={() => removeCharge(index)}>Remove charge</button>
          </fieldset>)}</div>}
      </section>
      {savedPreview && <section className="document-preview" aria-label="Saved draft totals">
        <h3>Draft totals</h3>
        <dl><div><dt>Subtotal</dt><dd>{money(savedPreview.subtotal)}</dd></div><div><dt>Tax</dt><dd>{money(savedPreview.taxTotal)}</dd></div><div><dt>Total</dt><dd>{money(savedPreview.grandTotal)}</dd></div></dl>
        {savedPreview.notices.map((notice, index) => <p key={`${notice}-${index}`}>{notice}</p>)}
      </section>}
      {message && <p className="form-message" role="status">{message}</p>}
      <div className="form-actions"><span>{form.id ? "Save changes before finalizing. Finalized documents are immutable." : "Save as a draft before issuing a document number."}</span><div className="button-row">
        <button className="secondary-button" type="button" onClick={() => setForm(null)}>Close</button>
        <button className="primary-button" type="submit" disabled={saving || form.lines.length === 0 || !form.customerId}>{saving ? "Saving…" : "Save draft"}</button>
      </div></div>
      {form.id && <div className="document-final-actions">
        {!confirmCancel && !confirmFinalize && <><button className="primary-button" type="button" disabled={saving || dirty} onClick={() => setConfirmFinalize(true)}>Finalize and issue number</button><button className="list-action" type="button" disabled={saving} onClick={() => setConfirmCancel(true)}>Cancel document</button>{dirty && <span className="form-message">Save your changes before finalizing.</span>}</>}
        {confirmFinalize && <div className="confirmation-row" role="group" aria-label="Confirm document finalization"><span>Issue this document now? Its number and financial snapshot will be locked.</span><button className="list-action" type="button" disabled={saving} onClick={() => setConfirmFinalize(false)}>Keep draft</button><button className="primary-button" type="button" disabled={saving || dirty} onClick={finalize}>Confirm finalization</button></div>}
        {confirmCancel && <div className="confirmation-row" role="group" aria-label="Confirm document cancellation"><span>Cancel this document? It will remain in the local history.</span><button className="list-action" type="button" disabled={saving} onClick={() => setConfirmCancel(false)}>Keep draft</button><button className="list-action destructive-action" type="button" disabled={saving} onClick={cancelDocument}>Confirm cancellation</button></div>}
      </div>}
    </form>}

    {selectedDocument && <section className="panel selected-document">
      <div className="panel-heading"><div><div className="eyebrow">DOCUMENT DETAILS</div><h2>{selectedDocument.documentNumber || "Draft"} · {selectedDocument.documentDate}</h2></div><button className="list-action" onClick={() => {
        setSelectedDocumentId(null);
        setSelectedRender(null);
      }}>Close</button></div>
      {selectedDocument.dueDate && <p>Due {selectedDocument.dueDate}</p>}
      <p>{selectedDocument.lines.map((line) => line.description).join(", ")}</p>
      <strong>Total {money(selectedDocument.grandTotal)}</strong>
      {selectedDocument.status === "cancelled"
        ? <p className="form-message" role="note">This document is cancelled and retained for local history. Customer output is unavailable.</p>
        : outputBusy && !selectedRender
        ? <p className="form-message" role="status">Preparing the saved document preview…</p>
        : selectedRender && <IssuedDocumentOutput
          render={selectedRender}
          busy={outputBusy}
          message={outputMessage}
          onDownload={downloadDocumentPdf}
          onPrint={printDocument}
          onShare={shareDocumentPdf}
        />}
      {outputMessage && !selectedRender && <p className="form-message" role="alert">{outputMessage}</p>}
    </section>}

    {business && <div className="panel customer-list-panel document-list-panel">
      <div className="panel-heading"><div><div className="eyebrow">LOCAL DOCUMENTS</div><h2>{documents.length ? `${documents.length} saved` : "Your billing documents"}</h2></div></div>
      {documents.length === 0 ? <div className="empty-list"><h3>No documents yet</h3><p>Create a draft from your active customers and product catalog.</p>{activeCustomers.length > 0 && activeProducts.length > 0 && <button className="secondary-button" onClick={startNew}>Create first document</button>}</div> :
        <ul className="customer-list">{documents.map((document) => {
          const customer = customers.find((item) => item.id === document.customerId);
          const status = document.status === "draft" ? "Draft" : document.status === "cancelled" ? "Cancelled" : document.status;
          return <li key={document.id}>
            <span className="customer-avatar">{customer?.name.slice(0, 1).toUpperCase() || "D"}</span>
            <span className="customer-list-main"><strong>{document.documentNumber || documentTypes.find(([type]) => type === document.documentType)?.[1]}{document.status === "cancelled" && <span className="inactive-badge">Cancelled</span>}</strong><small>{customer?.name || "Customer"} · {document.documentDate}{document.dueDate ? ` · Due ${document.dueDate}` : ""} · {status}</small></span>
            <span className="document-total">{money(document.grandTotal)}</span>
            {document.status === "draft"
              ? <button className="list-action" onClick={() => editDraft(document)}>Edit</button>
              : <button className="list-action" onClick={() => void viewDocument(document)}>View</button>}
          </li>;
        })}</ul>}
    </div>}
  </section>;
}
