import React, { useEffect, useState } from "react";
import { localDateInputValue } from "./local-date.js";

const methods = [
  ["cash", "Cash"],
  ["upi", "UPI"],
  ["bank_transfer", "Bank transfer"],
  ["card", "Card"],
  ["cheque", "Cheque"],
  ["other", "Other"],
];
const allocatableTypes = new Set(["tax_invoice", "non_gst_invoice", "bill_of_supply"]);

function today() {
  return localDateInputValue();
}

function requestKey() {
  const crypto = globalThis.crypto;
  if (!crypto?.getRandomValues) throw new Error("Secure request keys are unavailable in this browser.");
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function money(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function errorText(error) {
  return error?.userMessage || error?.message || "The payment action could not be completed.";
}

export default function PaymentsDirectory({
  business,
  customers,
  documents,
  onLoadActivity,
  onGetInvoiceSettlement,
  onRecordReceipt,
  onAllocate,
  onReleaseAllocation,
  onRecordRefund,
  onReverseReceipt,
  onReverseRefund,
}) {
  const [customerId, setCustomerId] = useState(
    () => customers.find((customer) => customer.active)?.id ?? customers[0]?.id ?? "",
  );
  const [activity, setActivity] = useState(null);
  const [receipts, setReceipts] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [receiptForm, setReceiptForm] = useState(() => ({
    amount: "",
    paymentDate: today(),
    method: "cash",
    reference: "",
    notes: "",
    key: requestKey(),
  }));
  const [allocationForm, setAllocationForm] = useState(() => ({
    receiptId: "",
    invoiceId: "",
    amount: "",
    key: requestKey(),
  }));
  const [releaseForm, setReleaseForm] = useState(() => ({
    allocationId: "",
    reason: "",
    key: requestKey(),
  }));
  const [refundForm, setRefundForm] = useState(() => ({
    receiptId: "",
    amount: "",
    paymentDate: today(),
    method: "cash",
    reason: "",
    key: requestKey(),
  }));
  const [receiptReversalForm, setReceiptReversalForm] = useState(() => ({
    receiptId: "",
    reason: "",
    key: requestKey(),
  }));
  const [refundReversalForm, setRefundReversalForm] = useState(() => ({
    refundEventId: "",
    reason: "",
    key: requestKey(),
  }));
  const customer = customers.find((item) => item.id === customerId);
  const customerDocuments = documents.filter((document) =>
    document.customerId === customerId &&
    document.status === "finalized" &&
    allocatableTypes.has(document.documentType),
  );
  const activeAllocations = (activity?.entries ?? [])
    .filter((entry) => entry.type === "allocation")
    .filter((entry) => !(activity?.entries ?? []).some((candidate) =>
      candidate.type === "allocation_release" && candidate.reference === entry.id,
    ));
  const activeRefunds = (activity?.entries ?? [])
    .filter((entry) => entry.type === "refund")
    .filter((entry) => !(activity?.entries ?? []).some((candidate) =>
      candidate.type === "refund_reversal" && candidate.reference === entry.id,
    ));

  async function refresh(nextCustomerId = customerId) {
    if (!nextCustomerId || !business) {
      setActivity(null);
      setReceipts([]);
      setSettlements([]);
      return true;
    }
    setLoading(true);
    setMessage("");
    setActivity(null);
    setReceipts([]);
    setSettlements([]);
    try {
      const [data, nextSettlements] = await Promise.all([
        onLoadActivity(nextCustomerId),
        Promise.all(documents
          .filter((document) =>
            document.customerId === nextCustomerId &&
            document.status === "finalized" &&
            allocatableTypes.has(document.documentType),
          )
          .map((document) => onGetInvoiceSettlement(document.id))),
      ]);
      setActivity(data.activity);
      setReceipts(data.receipts);
      setSettlements(nextSettlements);
      return true;
    } catch (error) {
      setMessage(errorText(error));
      return false;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh(customerId);
  }, [customerId, documents]);

  async function submit(action, input, successMessage) {
    setSaving(true);
    setMessage("");
    try {
      await action(input);
      if (await refresh()) setMessage(successMessage);
      return true;
    } catch (error) {
      setMessage(errorText(error));
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function saveReceipt(event) {
    event.preventDefault();
    const saved = await submit(onRecordReceipt, {
      customerId,
      amount: receiptForm.amount,
      paymentDate: receiptForm.paymentDate,
      method: receiptForm.method,
      reference: receiptForm.reference || null,
      notes: receiptForm.notes || null,
      idempotencyKey: receiptForm.key,
    }, "Receipt saved locally.");
    if (saved) {
      setReceiptForm((form) => ({
        ...form,
        amount: "",
        reference: "",
        notes: "",
        key: requestKey(),
      }));
    }
  }

  async function saveAllocation(event) {
    event.preventDefault();
    const saved = await submit(onAllocate, {
      receiptId: allocationForm.receiptId,
      invoiceId: allocationForm.invoiceId,
      amount: allocationForm.amount,
      idempotencyKey: allocationForm.key,
    }, "Payment allocated to the invoice.");
    if (saved) setAllocationForm((form) => ({ ...form, amount: "", key: requestKey() }));
  }

  async function releaseAllocation(event) {
    event.preventDefault();
    const saved = await submit(onReleaseAllocation, {
      allocationId: releaseForm.allocationId,
      reason: releaseForm.reason,
      idempotencyKey: releaseForm.key,
    }, "Invoice allocation released.");
    if (saved) setReleaseForm((form) => ({ ...form, reason: "", key: requestKey() }));
  }

  async function saveRefund(event) {
    event.preventDefault();
    const saved = await submit(onRecordRefund, {
      receiptId: refundForm.receiptId,
      amount: refundForm.amount,
      paymentDate: refundForm.paymentDate,
      method: refundForm.method,
      reason: refundForm.reason,
      idempotencyKey: refundForm.key,
    }, "Refund recorded.");
    if (saved) setRefundForm((form) => ({ ...form, amount: "", reason: "", key: requestKey() }));
  }

  async function reverseReceipt(event) {
    event.preventDefault();
    const saved = await submit(onReverseReceipt, {
      receiptId: receiptReversalForm.receiptId,
      reason: receiptReversalForm.reason,
      idempotencyKey: receiptReversalForm.key,
    }, "Receipt reversal recorded.");
    if (saved) setReceiptReversalForm((form) => ({ ...form, reason: "", key: requestKey() }));
  }

  async function reverseRefund(event) {
    event.preventDefault();
    const saved = await submit(onReverseRefund, {
      refundEventId: refundReversalForm.refundEventId,
      reason: refundReversalForm.reason,
      idempotencyKey: refundReversalForm.key,
    }, "Refund reversal recorded.");
    if (saved) setRefundReversalForm((form) => ({ ...form, reason: "", key: requestKey() }));
  }

  if (!business) {
    return <section className="workflow-page"><div className="panel empty-state"><h2>Set up your business first</h2><p>A business profile is required before recording customer payments.</p></div></section>;
  }

  return <section className="workflow-page">
    <div className="page-title"><div><div className="eyebrow">CUSTOMER PAYMENTS</div><h1>Receipts &amp; advances</h1><p>Record ordinary payment receipts, allocate them to finalized invoices, and review customer payment activity.</p></div></div>
    <p className="payment-disclaimer">These are ordinary payment acknowledgements, not statutory GST receipt vouchers. Keep browser data backed up; payment records are stored only on this device.</p>
    {customers.length === 0 ? <div className="panel empty-state"><h2>Add a customer first</h2><p>Payment receipts belong to a saved customer.</p></div> : <>
      <div className="panel payment-customer-picker">
        <label>Customer<select value={customerId} onChange={(event) => {
          setCustomerId(event.target.value);
          setReceiptForm((form) => ({ ...form, key: requestKey() }));
          setAllocationForm((form) => ({ ...form, key: requestKey() }));
          setReleaseForm((form) => ({ ...form, key: requestKey() }));
          setRefundForm((form) => ({ ...form, key: requestKey() }));
          setReceiptReversalForm((form) => ({ ...form, key: requestKey() }));
          setRefundReversalForm((form) => ({ ...form, key: requestKey() }));
        }}>{customers.map((item) => <option key={item.id} value={item.id}>{item.name}{item.active ? "" : " · inactive"}</option>)}</select></label>
        {loading && <span role="status">Loading a consistent activity snapshot…</span>}
      </div>
      {activity && <section className="payment-summary-grid" aria-label="Customer payment summary">
        <article className="metric-card"><div className="metric-value">{activity.summary.receiptCount}</div><div className="metric-label">Receipts</div></article>
        <article className="metric-card"><div className="metric-value">{money(activity.summary.totalReceived)}</div><div className="metric-label">Total received</div></article>
        <article className="metric-card"><div className="metric-value">{money(activity.summary.totalAllocated)}</div><div className="metric-label">Allocated to invoices</div></article>
        <article className="metric-card"><div className="metric-value">{money(activity.summary.unallocatedAdvance)}</div><div className="metric-label">Unallocated advance</div></article>
      </section>}
      <div className="payment-workflow-grid">
        <form className="panel payment-form" onSubmit={saveReceipt}>
          <div className="eyebrow">NEW RECEIPT</div><h2>Record payment</h2>
          <label>Amount (₹)<input required inputMode="decimal" value={receiptForm.amount} onChange={(event) => setReceiptForm({ ...receiptForm, amount: event.target.value })} /></label>
          <label>Payment date<input required type="date" value={receiptForm.paymentDate} onChange={(event) => setReceiptForm({ ...receiptForm, paymentDate: event.target.value })} /></label>
          <label>Method<select value={receiptForm.method} onChange={(event) => setReceiptForm({ ...receiptForm, method: event.target.value })}>{methods.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
          <label>Transaction reference (optional)<input maxLength={200} value={receiptForm.reference} onChange={(event) => setReceiptForm({ ...receiptForm, reference: event.target.value })} /></label>
          <label>Notes (optional)<textarea maxLength={2000} value={receiptForm.notes} onChange={(event) => setReceiptForm({ ...receiptForm, notes: event.target.value })} /></label>
          <button className="primary-button" disabled={saving}>{saving ? "Saving…" : "Save receipt"}</button>
        </form>

        <form className="panel payment-form" onSubmit={saveAllocation}>
          <div className="eyebrow">INVOICE SETTLEMENT</div><h2>Allocate receipt</h2>
          <label>Receipt<select required value={allocationForm.receiptId} onChange={(event) => setAllocationForm({ ...allocationForm, receiptId: event.target.value })}><option value="">Choose receipt</option>{receipts.map((receipt) => <option key={receipt.id} value={receipt.id}>{receipt.paymentDate} · {money(receipt.amount)} · {receipt.method.replaceAll("_", " ")}</option>)}</select></label>
          <label>Finalized invoice<select required value={allocationForm.invoiceId} onChange={(event) => setAllocationForm({ ...allocationForm, invoiceId: event.target.value })}><option value="">Choose invoice</option>{customerDocuments.map((document) => {
            const settlement = settlements.find((item) => item.invoiceId === document.id);
            return <option key={document.id} value={document.id}>{document.documentNumber} · outstanding {money(settlement?.outstandingAmount ?? document.grandTotal)}</option>;
          })}</select></label>
          <label>Amount (₹)<input required inputMode="decimal" value={allocationForm.amount} onChange={(event) => setAllocationForm({ ...allocationForm, amount: event.target.value })} /></label>
          <button className="primary-button" disabled={saving || !receipts.length || !customerDocuments.length}>Allocate payment</button>
        </form>

        <form className="panel payment-form" onSubmit={releaseAllocation}>
          <div className="eyebrow">CORRECTION</div><h2>Release allocation</h2>
          <label>Active allocation<select required value={releaseForm.allocationId} onChange={(event) => setReleaseForm({ ...releaseForm, allocationId: event.target.value })}><option value="">Choose allocation</option>{activeAllocations.map((entry) => <option key={entry.id} value={entry.id}>{entry.effectiveDate} · {money(entry.amount)} · {entry.invoiceId}</option>)}</select></label>
          <label>Reason<input required maxLength={1000} value={releaseForm.reason} onChange={(event) => setReleaseForm({ ...releaseForm, reason: event.target.value })} /></label>
          <button className="secondary-button" disabled={saving || !activeAllocations.length}>Release allocation</button>
        </form>

        <form className="panel payment-form" onSubmit={saveRefund}>
          <div className="eyebrow">REFUND</div><h2>Record customer refund</h2>
          <label>Receipt<select required value={refundForm.receiptId} onChange={(event) => setRefundForm({ ...refundForm, receiptId: event.target.value })}><option value="">Choose receipt</option>{receipts.map((receipt) => <option key={receipt.id} value={receipt.id}>{receipt.paymentDate} · {money(receipt.amount)}</option>)}</select></label>
          <label>Amount (₹)<input required inputMode="decimal" value={refundForm.amount} onChange={(event) => setRefundForm({ ...refundForm, amount: event.target.value })} /></label>
          <label>Refund date<input required type="date" value={refundForm.paymentDate} onChange={(event) => setRefundForm({ ...refundForm, paymentDate: event.target.value })} /></label>
          <label>Refund method<select value={refundForm.method} onChange={(event) => setRefundForm({ ...refundForm, method: event.target.value })}>{methods.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
          <label>Reason<input required maxLength={1000} value={refundForm.reason} onChange={(event) => setRefundForm({ ...refundForm, reason: event.target.value })} /></label>
          <button className="secondary-button" disabled={saving || !receipts.length}>Record refund</button>
        </form>

        <form className="panel payment-form" onSubmit={reverseReceipt}>
          <div className="eyebrow">REVERSE RECEIPT</div><h2>Record receipt reversal</h2>
          <label>Receipt<select required value={receiptReversalForm.receiptId} onChange={(event) => setReceiptReversalForm({ ...receiptReversalForm, receiptId: event.target.value })}><option value="">Choose receipt</option>{receipts.map((receipt) => <option key={receipt.id} value={receipt.id}>{receipt.paymentDate} · {money(receipt.amount)}</option>)}</select></label>
          <label>Reason<input required maxLength={1000} value={receiptReversalForm.reason} onChange={(event) => setReceiptReversalForm({ ...receiptReversalForm, reason: event.target.value })} /></label>
          <button className="secondary-button" disabled={saving || !receipts.length}>Reverse receipt</button>
        </form>

        <form className="panel payment-form" onSubmit={reverseRefund}>
          <div className="eyebrow">REFUND CORRECTION</div><h2>Reverse refund entry</h2>
          <label>Refund<select required value={refundReversalForm.refundEventId} onChange={(event) => setRefundReversalForm({ ...refundReversalForm, refundEventId: event.target.value })}><option value="">Choose refund</option>{activeRefunds.map((entry) => <option key={entry.id} value={entry.id}>{entry.effectiveDate} · {money(entry.amount)}</option>)}</select></label>
          <label>Reason<input required maxLength={1000} value={refundReversalForm.reason} onChange={(event) => setRefundReversalForm({ ...refundReversalForm, reason: event.target.value })} /></label>
          <button className="secondary-button" disabled={saving || !activeRefunds.length}>Reverse refund</button>
        </form>
      </div>

      {message && <p className="form-message" role="status">{message}</p>}
      <section className="panel payment-activity">
        <div className="panel-heading"><div><div className="eyebrow">SOURCE EVENTS</div><h2>{customer?.name ?? "Customer"} payment activity</h2></div></div>
        {!activity?.entries.length ? <p className="empty-line-note">No payment events for this customer yet.</p> : <div className="payment-event-list">
          {activity.entries.map((entry) => <article className="payment-event" key={entry.id}>
            <div><strong>{entry.type.replaceAll("_", " ")}</strong><span>{entry.effectiveDate} · recorded {entry.recordedAt.slice(0, 16).replace("T", " ")}</span></div>
            <div><strong>{money(entry.amount)}</strong>{entry.description && <span>{entry.description}</span>}</div>
          </article>)}
        </div>}
      </section>
    </>}
  </section>;
}
