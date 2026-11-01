import React, { useEffect, useState } from "react";
import {
  createCustomer,
  createDocument,
  createProduct,
  createSavedGstRate,
  cancelDocument,
  finalizeDocument,
  allocateReceiptToInvoice,
  getBusinessProfile,
  getCustomerPaymentActivity,
  getInvoiceSettlement,
  listCustomers,
  listCustomerReceipts,
  listDocuments,
  listProducts,
  listSavedGstRates,
  listTemplates,
  listTaxCategories,
  saveBusinessProfile,
  recordCustomerReceipt,
  recordCustomerRefund,
  releaseReceiptAllocation,
  reverseCustomerReceipt,
  reverseCustomerRefund,
  renderIssuedDocument,
  updateProduct,
  updateSavedGstRate,
  updateDocument,
} from "@fledge/application/browser";
import { GST_RULE_VERSIONS, STATE_UTS } from "@fledge/domain";
import DocumentDirectory from "./DocumentDirectory.jsx";
import ProductDirectory from "./ProductDirectory.jsx";
import TemplateDirectory from "./TemplateDirectory.jsx";
import PaymentsDirectory from "./PaymentsDirectory.jsx";
import BackupRecovery from "./BackupRecovery.jsx";
import ApplicationUpdates from "./ApplicationUpdates.jsx";
import { restoreEncryptedBackup } from "./backup.js";
import {
  createBrowserRepositories,
  openFledgeDatabase,
} from "./indexed-db.js";

const navigation = [
  { id: "overview", label: "Overview", icon: "grid" },
  { id: "invoices", label: "Invoices", icon: "file" },
  { id: "customers", label: "Customers", icon: "users" },
  { id: "products", label: "Products & services", icon: "box" },
  { id: "templates", label: "Document templates", icon: "file" },
  { id: "payments", label: "Payments", icon: "wallet" },
  { id: "settings", label: "Business settings", icon: "settings" },
  { id: "backup", label: "Backup & recovery", icon: "shield" },
  { id: "application", label: "Application & updates", icon: "settings" },
];

function Icon({ name, size = 18 }) {
  const paths = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h8" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    box: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 8 9 5 9-5M3 8v9l9 5 9-5V8M12 13v9" /></>,
    wallet: <><rect x="3" y="5" width="18" height="15" rx="2" /><path d="M3 9h18M16 15h2" /><path d="M7 5V3h11" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.6a8 8 0 0 1-1.6.9l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.6-.9l-1.7.6-1.4-2.4 1.4-1.1a7 7 0 0 1 0-1.9l-1.4-1.1 1.4-2.4 1.7.6a8 8 0 0 1 1.6-.9l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.6.9l1.7-.6 1.4 2.4-1.4 1.1a7 7 0 0 1 0 1.8Z" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" /><path d="m9 12 2 2 4-4" /></>,
    spark: <><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Z" /><path d="m19 14 1.1 2.9L23 18l-2.9 1.1L19 22l-1.1-2.9L15 18l2.9-1.1L19 14Z" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.grid}</svg>;
}

function Metric({ label, value, note, icon }) {
  return <article className="metric-card">
    <div className="metric-top"><span className="metric-icon"><Icon name={icon} /></span><span className="metric-note">{note}</span></div>
    <div className="metric-value">{value}</div>
    <div className="metric-label">{label}</div>
  </article>;
}

function Overview({ business, customers, products, documents, onNavigate }) {
  const setupCount = Number(Boolean(business)) + Number(customers.length > 0) + Number(products.length > 0);
  return <>
    <section className="welcome-row">
      <div><div className="eyebrow">YOUR BUSINESS, IN GOOD ORDER</div><h1>Good morning.</h1><p>{business ? `Welcome to ${business.displayName}.` : "Set up your business workspace to get started."}</p></div>
      <button className="primary-button" onClick={() => onNavigate(business ? "invoices" : "settings")}><Icon name="plus" size={17} /> {business ? "View invoices" : "Set up business"}</button>
    </section>
    <section className="metrics-grid">
      <Metric label="Total invoices" value={String(documents.filter((document) =>
        ["tax_invoice", "non_gst_invoice"].includes(document.documentType) &&
        document.documentNumber !== null &&
        document.status !== "cancelled",
      ).length)} note="Issued on this device" icon="file" />
      <Metric label="Outstanding" value="—" note="Not connected yet" icon="wallet" />
      <Metric label="Customers" value={String(customers.length)} note={customers.length ? "Saved on this device" : "Ready to add"} icon="users" />
      <Metric label="Products & services" value={String(products.length)} note={products.length ? "Saved on this device" : "Ready to add"} icon="box" />
    </section>
    <section className="content-grid">
      <article className="panel setup-panel">
        <div className="panel-heading"><div><div className="eyebrow">GET STARTED</div><h2>Set up your workspace</h2></div><span className="step-count">{setupCount} of 3</span></div>
        <p className="panel-copy">{business && customers.length ? "Your business profile and customer list are saved in this browser." : "Complete the setup steps to create your local workspace."}</p>
        <div className="setup-list">
          <button className="setup-item" onClick={() => onNavigate("settings")}><span className="setup-number">01</span><span className="setup-text"><strong>{business ? "Business details saved" : "Add your business details"}</strong><small>Business name, address and GST registration</small></span><Icon name="arrow" /></button>
          <button className="setup-item" onClick={() => onNavigate("customers")}><span className="setup-number">02</span><span className="setup-text"><strong>{customers.length ? `${customers.length} customer${customers.length === 1 ? "" : "s"} saved` : "Add your first customer"}</strong><small>Keep customer and billing details together</small></span><Icon name="arrow" /></button>
          <button className="setup-item" onClick={() => onNavigate("products")}><span className="setup-number">03</span><span className="setup-text"><strong>{products.length ? `${products.length} products or services saved` : "Add products or services"}</strong><small>Manage your reusable catalog and saved rates</small></span><Icon name="arrow" /></button>
        </div>
      </article>
      <aside className="panel privacy-panel">
        <div className="privacy-mark"><Icon name="shield" size={22} /></div>
        <div className="eyebrow">LOCAL-FIRST BY DESIGN</div>
        <h2>Your business data stays on this device.</h2>
        <p>Business, customer, product and saved-rate records are stored in this browser's IndexedDB. They are not synced or backed up. Browser storage can be cleared or evicted, so do not keep your only copy of critical records here.</p>
        <div className="privacy-status"><span className="status-dot" /> Local database ready <span className="status-divider">·</span> No data sync</div>
      </aside>
    </section>
    <div className="bottom-note"><span className="note-line" /><span>Built for the everyday rhythm of Indian businesses.</span><span className="note-line" /></div>
  </>;
}

function Placeholder({ section, onBack }) {
  const current = navigation.find((item) => item.id === section) || { label: "Settings" };
  return <section className="placeholder-panel">
    <div className="placeholder-icon"><Icon name={section === "settings" ? "settings" : "spark"} size={24} /></div>
    <div className="eyebrow">FOUNDATION IN PROGRESS</div>
    <h1>{current.label}</h1>
    <p>This workflow is not connected yet. No billing action is simulated or saved from this screen.</p>
    <button className="secondary-button" onClick={onBack}>Back to overview</button>
  </section>;
}

function BusinessSettings({ business, onSave }) {
  const [values, setValues] = useState(() => ({
    legalName: business?.legalName ?? "",
    displayName: business?.displayName ?? "",
    address: business?.address ?? "",
    stateId: business?.stateId ?? "",
    pinCode: business?.pinCode ?? "",
    gstRegistered: business?.gstRegistered ?? false,
    gstin: business?.gstin ?? "",
    phone: business?.phone ?? "",
    email: business?.email ?? "",
  }));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState(false);

  function update(field, value) {
    setValues((current) => ({ ...current, [field]: value }));
    setMessage("");
    setSaved(false);
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setSaved(false);
    try {
      await onSave(values);
      setSaved(true);
    } catch (error) {
      setMessage(userMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return <section className="workflow-page">
    <div className="page-title"><div><div className="eyebrow">WORKSPACE SETTINGS</div><h1>Business details</h1><p>Set the local business profile used by billing workflows.</p></div></div>
    <form className="panel form-panel" onSubmit={submit}>
      <div className="form-grid">
        <label>Legal business name<input autoComplete="organization" required maxLength={200} value={values.legalName} onChange={(event) => update("legalName", event.target.value)} /></label>
        <label>Display name<input maxLength={200} value={values.displayName} onChange={(event) => update("displayName", event.target.value)} /></label>
        <label className="form-span">Business address<textarea required rows="3" maxLength={500} value={values.address} onChange={(event) => update("address", event.target.value)} /></label>
        <label>State / Union Territory<select required value={values.stateId} onChange={(event) => update("stateId", event.target.value)}><option value="">Choose State / UT</option>{STATE_UTS.filter((state) => state.active).map((state) => <option key={state.id} value={state.id}>{state.name}</option>)}</select></label>
        <label>PIN code<input inputMode="numeric" autoComplete="postal-code" maxLength={6} value={values.pinCode} onChange={(event) => update("pinCode", event.target.value)} /></label>
        <label>Phone<input autoComplete="tel" value={values.phone} onChange={(event) => update("phone", event.target.value)} /></label>
        <label>Email<input type="email" autoComplete="email" value={values.email} onChange={(event) => update("email", event.target.value)} /></label>
        <label className="checkbox-field form-span"><input type="checkbox" checked={values.gstRegistered} onChange={(event) => update("gstRegistered", event.target.checked)} /> GST-registered business</label>
        {values.gstRegistered && <label>GSTIN<input autoCapitalize="characters" maxLength={15} value={values.gstin} onChange={(event) => update("gstin", event.target.value)} /></label>}
      </div>
      {message && <p className="form-message error-message" role="alert">{message}</p>}
      {saved && <p className="form-message success-message" role="status">Business profile saved on this device.</p>}
      <div className="form-actions"><span>Stored locally in this browser. No cloud backup is configured.</span><button className="primary-button" type="submit" disabled={saving}>{saving ? "Saving…" : "Save business details"}</button></div>
    </form>
  </section>;
}

function CustomerDirectory({ business, customers, onCreate, onNavigate }) {
  const [showForm, setShowForm] = useState(false);
  const [values, setValues] = useState({ name: "", billingAddress: "", shippingAddress: "", stateId: business?.stateId ?? "", pinCode: "", phone: "", email: "", registrationType: "unregistered", gstin: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState(false);

  function update(field, value) {
    setValues((current) => ({ ...current, [field]: value }));
    setMessage("");
    setSaved(false);
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setSaved(false);
    try {
      await onCreate(values);
      setValues({ name: "", billingAddress: "", shippingAddress: "", stateId: business?.stateId ?? "", pinCode: "", phone: "", email: "", registrationType: "unregistered", gstin: "", notes: "" });
      setSaved(true);
      setShowForm(false);
    } catch (error) {
      setMessage(userMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return <section className="workflow-page">
    <div className="page-title"><div><div className="eyebrow">YOUR BUSINESS</div><h1>Customers</h1><p>Customer records are scoped to your local business profile.</p></div>
      {business && <button className="primary-button" onClick={() => { setShowForm((open) => !open); setMessage(""); }}><Icon name="plus" size={17} /> {showForm ? "Close form" : "Add customer"}</button>}
    </div>
    {!business && <div className="panel empty-state"><div className="placeholder-icon"><Icon name="settings" /></div><h2>Set up your business first</h2><p>A business profile is required before customer records can be added.</p><button className="primary-button" onClick={() => onNavigate("settings")}>Add business details</button></div>}
    {business && showForm && <form className="panel form-panel customer-form" onSubmit={submit}>
      <h2>New customer</h2>
      <div className="form-grid">
        <label>Customer name<input required autoComplete="name" maxLength={200} value={values.name} onChange={(event) => update("name", event.target.value)} /></label>
        <label>State / Union Territory<select required value={values.stateId} onChange={(event) => update("stateId", event.target.value)}><option value="">Choose State / UT</option>{STATE_UTS.filter((state) => state.active).map((state) => <option key={state.id} value={state.id}>{state.name}</option>)}</select></label>
        <label className="form-span">Billing address<textarea required rows="3" maxLength={500} value={values.billingAddress} onChange={(event) => update("billingAddress", event.target.value)} /></label>
        <label className="form-span">Shipping address (optional)<textarea rows="2" maxLength={500} value={values.shippingAddress} onChange={(event) => update("shippingAddress", event.target.value)} /></label>
        <label>Phone<input autoComplete="tel" value={values.phone} onChange={(event) => update("phone", event.target.value)} /></label>
        <label>Email<input type="email" autoComplete="email" value={values.email} onChange={(event) => update("email", event.target.value)} /></label>
        <label>GST registration<select value={values.registrationType} onChange={(event) => update("registrationType", event.target.value)}><option value="unregistered">Unregistered</option><option value="registered">Registered</option></select></label>
        {values.registrationType === "registered" && <label>GSTIN<input autoCapitalize="characters" maxLength={15} value={values.gstin} onChange={(event) => update("gstin", event.target.value)} /></label>}
        <label>PIN code<input inputMode="numeric" autoComplete="postal-code" maxLength={6} value={values.pinCode} onChange={(event) => update("pinCode", event.target.value)} /></label>
      </div>
      {message && <p className="form-message error-message" role="alert">{message}</p>}
      <div className="form-actions"><span>Saving writes to this device's IndexedDB.</span><button className="primary-button" type="submit" disabled={saving}>{saving ? "Saving…" : "Save customer"}</button></div>
    </form>}
    {business && <div className="panel customer-list-panel">
      <div className="panel-heading"><div><div className="eyebrow">CUSTOMER DIRECTORY</div><h2>{customers.length ? `${customers.length} saved` : "Your customer list"}</h2></div></div>
      {customers.length === 0 ? <div className="empty-list"><div className="placeholder-icon"><Icon name="users" /></div><h3>No customers yet</h3><p>Add your first customer. The record will remain on this device.</p><button className="secondary-button" onClick={() => setShowForm(true)}>Add first customer</button></div> :
        <ul className="customer-list">{customers.map((customer) => <li key={customer.id}><span className="customer-avatar">{customer.name.slice(0, 1).toUpperCase()}</span><span className="customer-list-main"><strong>{customer.name}</strong><small>{customer.stateUt.name} · {customer.registrationType === "registered" ? "GST registered" : "Unregistered"}</small></span><span className="customer-contact">{customer.phone || customer.email || customer.billingAddress}</span></li>)}</ul>}
    </div>}
    {saved && <p className="form-message success-message" role="status">Customer saved on this device.</p>}
  </section>;
}

function userMessage(error) {
  return error?.userMessage || error?.message || "The requested change could not be saved.";
}

function createId() {
  const crypto = globalThis.crypto;
  if (!crypto?.getRandomValues) {
    throw new Error("Secure random IDs are unavailable in this browser context.");
  }
  if (crypto.randomUUID) return crypto.randomUUID();

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function requestPersistentStorage() {
  const storage = globalThis.navigator?.storage;
  if (!storage?.persist) {
    return "This browser cannot request persistent storage. Browser data may be cleared or evicted.";
  }
  try {
    const granted = await storage.persist();
    return granted
      ? ""
      : "Persistent storage was not granted. Browser data may be cleared or evicted.";
  } catch (error) {
    return `Persistent storage could not be confirmed: ${userMessage(error)}`;
  }
}

export default function App() {
  const [active, setActive] = useState("overview");
  const [status, setStatus] = useState("loading");
  const [storageError, setStorageError] = useState("");
  const [durabilityWarning, setDurabilityWarning] = useState("");
  const [repositories, setRepositories] = useState(null);
  const [database, setDatabase] = useState(null);
  const [business, setBusiness] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [savedGstRates, setSavedGstRates] = useState([]);
  const [taxCategories, setTaxCategories] = useState([]);
  const [templates, setTemplates] = useState([]);
  const selected = navigation.find((item) => item.id === active);

  useEffect(() => {
    let disposed = false;
    let database;
    async function initialize() {
      try {
        database = await openFledgeDatabase();
        if (disposed) {
          database.close();
          return;
        }
        const warning = await requestPersistentStorage();
        if (disposed) {
          database.close();
          return;
        }
        const nextRepositories = createBrowserRepositories(database);
        const deps = { repository: nextRepositories.businessRepository, states: STATE_UTS };
        const customerDeps = { repository: nextRepositories.customerRepository, states: STATE_UTS };
        const productDeps = { repository: nextRepositories.productRepository };
        const documentDeps = { repository: nextRepositories.documentRepository, states: STATE_UTS };
        const [profile, customerList, productList, savedRates, categories, documentList] = await Promise.all([
          getBusinessProfile(deps),
          listCustomers(customerDeps),
          listProducts(productDeps, { includeInactive: true }),
          listSavedGstRates(productDeps, { includeInactive: true }),
          listTaxCategories(productDeps),
          listDocuments(documentDeps),
        ]);
        const templateDeps = {
          repository: nextRepositories.templateRepository,
          now: () => new Date().toISOString(),
        };
        const templateList = profile ? await listTemplates(templateDeps) : [];
        if (disposed) {
          database.close();
          return;
        }
        setRepositories(nextRepositories);
        setDatabase(database);
        setBusiness(profile);
        setCustomers(customerList);
        setProducts(productList);
        setDocuments(documentList);
        setSavedGstRates(savedRates);
        setTaxCategories(categories);
        setTemplates(templateList);
        setDurabilityWarning(warning);
        setStatus("ready");
      } catch (error) {
        if (disposed) return;
        setStorageError(userMessage(error));
        setStatus("error");
      }
    }
    void initialize();
    return () => {
      disposed = true;
      database?.close();
    };
  }, []);

  const businessDeps = repositories && {
    repository: repositories.businessRepository,
    states: STATE_UTS,
    now: () => new Date().toISOString(),
    createId,
  };
  const customerDeps = repositories && {
    repository: repositories.customerRepository,
    states: STATE_UTS,
    now: () => new Date().toISOString(),
    createId,
  };
  const productDeps = repositories && {
    repository: repositories.productRepository,
    now: () => new Date().toISOString(),
    createId,
  };
  const documentDeps = repositories && {
    repository: repositories.documentRepository,
    states: STATE_UTS,
    now: () => new Date().toISOString(),
    createId,
  };
  const templateDeps = repositories && {
    repository: repositories.templateRepository,
    now: () => new Date().toISOString(),
  };
  const receiptDeps = repositories && {
    repository: repositories.customerReceiptRepository,
    now: () => new Date().toISOString(),
    createId,
  };
  const allocationDeps = repositories && {
    repository: repositories.allocationRepository,
    now: () => new Date().toISOString(),
    createId,
  };
  const adjustmentDeps = repositories && {
    repository: repositories.paymentAdjustmentRepository,
    now: () => new Date().toISOString(),
    createId,
  };
  const paymentActivityDeps = repositories && ({
    repository: repositories.customerPaymentActivityRepository,
  });

  async function handleSaveBusiness(input) {
    const profile = await saveBusinessProfile(input, businessDeps);
    setBusiness(profile);
    setTemplates(await listTemplates(templateDeps));
  }

  async function handleCreateCustomer(input) {
    await createCustomer(input, customerDeps);
    setCustomers(await listCustomers(customerDeps));
  }

  async function handleSaveProduct(input, id) {
    if (id) {
      await updateProduct(id, input, productDeps);
    } else {
      await createProduct(input, productDeps);
    }
    setProducts(await listProducts(productDeps, { includeInactive: true }));
  }

  async function handleSaveRate(input, id) {
    if (id) {
      await updateSavedGstRate(id, input, productDeps);
    } else {
      await createSavedGstRate(input, productDeps);
    }
    setSavedGstRates(await listSavedGstRates(productDeps, { includeInactive: true }));
    setProducts(await listProducts(productDeps, { includeInactive: true }));
  }

  async function handleSaveDocument(id, input) {
    const document = id
      ? await updateDocument(id, input, documentDeps)
      : await createDocument(input, documentDeps);
    setDocuments(await listDocuments(documentDeps));
    return document;
  }

  async function handleFinalizeDocument(id) {
    const document = await finalizeDocument(id, documentDeps);
    setDocuments(await listDocuments(documentDeps));
    return document;
  }

  async function handleRenderIssuedDocument(id) {
    return renderIssuedDocument(id, {
      documents: repositories.documentRepository,
      templates: repositories.templateRepository,
      states: STATE_UTS,
    });
  }

  async function handleCancelDocument(id) {
    const document = await cancelDocument(id, documentDeps);
    setDocuments(await listDocuments(documentDeps));
    return document;
  }

  async function handleRefreshTemplates() {
    setTemplates(await listTemplates(templateDeps));
  }

  async function handleLoadPaymentActivity(customerId) {
    const [activity, receipts] = await Promise.all([
      getCustomerPaymentActivity(customerId, paymentActivityDeps),
      listCustomerReceipts(customerId, receiptDeps),
    ]);
    return { activity, receipts };
  }

  async function handleGetInvoiceSettlement(invoiceId) {
    return getInvoiceSettlement(invoiceId, allocationDeps);
  }

  async function handleRecordReceipt(input) {
    return recordCustomerReceipt(input, receiptDeps);
  }

  async function handleAllocate(input) {
    return allocateReceiptToInvoice(input, allocationDeps);
  }

  async function handleReleaseAllocation(input) {
    return releaseReceiptAllocation(input, allocationDeps);
  }

  async function handleRecordRefund(input) {
    return recordCustomerRefund(input, adjustmentDeps);
  }

  async function handleReverseReceipt(input) {
    return reverseCustomerReceipt(input, adjustmentDeps);
  }

  async function handleReverseRefund(input) {
    return reverseCustomerRefund(input, adjustmentDeps);
  }

  async function handleRestoreBackup(contents, passphrase) {
    await restoreEncryptedBackup(database, contents, passphrase);
    const [profile, customerList, productList, savedRates, categories, documentList] = await Promise.all([
      getBusinessProfile({ repository: repositories.businessRepository, states: STATE_UTS }),
      listCustomers({ repository: repositories.customerRepository, states: STATE_UTS }),
      listProducts({ repository: repositories.productRepository }, { includeInactive: true }),
      listSavedGstRates({ repository: repositories.productRepository }, { includeInactive: true }),
      listTaxCategories({ repository: repositories.productRepository }),
      listDocuments({ repository: repositories.documentRepository, states: STATE_UTS }),
    ]);
    setBusiness(profile);
    setCustomers(customerList);
    setProducts(productList);
    setSavedGstRates(savedRates);
    setTaxCategories(categories);
    setDocuments(documentList);
    setTemplates(profile ? await listTemplates({
      repository: repositories.templateRepository,
      now: () => new Date().toISOString(),
    }) : []);
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand-lockup"><div className="brand-symbol">f</div><div><div className="brand-name">fledge</div><div className="brand-subtitle">BILLING</div></div></div>
      <div className="workspace-switcher"><div className="workspace-avatar">{business?.displayName?.slice(0, 1).toUpperCase() || "B"}</div><div className="workspace-meta"><strong>{business?.displayName || "My business"}</strong><span>Local workspace</span></div><span className="switcher-chevron">⌄</span></div>
      <div className="nav-caption">WORKSPACE</div>
      <nav className="main-nav" aria-label="Main navigation">
        {navigation.map((item) => <button key={item.id} className={active === item.id ? "nav-item active" : "nav-item"} onClick={() => setActive(item.id)}><Icon name={item.icon} /><span>{item.label}</span></button>)}
      </nav>
      <div className="sidebar-spacer" />
      <div className="sidebar-footer"><span className={status === "ready" ? "footer-dot" : "footer-dot pending"} /> {status === "ready" ? "Local database" : status === "loading" ? "Connecting" : "Storage issue"} <span className="version-label">v0.2</span></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div className="breadcrumb">Workspace <span>/</span> {selected?.label || (active === "settings" ? "Settings" : "Overview")}</div><div className="topbar-right"><span className={status === "ready" ? "offline-pill" : "offline-pill status-pending"}><span /> {status === "ready" ? "Saved locally" : status === "loading" ? "Opening local storage" : "Storage unavailable"}</span><div className="profile-avatar">{business?.displayName?.slice(0, 1).toUpperCase() || "B"}</div></div></header>
      <div className="page-content">
        {status === "ready" && durabilityWarning && <p className="storage-warning" role="status">{durabilityWarning}</p>}
        {status === "loading" && <section className="placeholder-panel" role="status"><div className="placeholder-icon"><Icon name="shield" /></div><h1>Opening your local workspace</h1><p>Connecting to this browser's IndexedDB database. Your records stay on this device.</p></section>}
        {status === "error" && <section className="placeholder-panel storage-error" role="alert"><div className="placeholder-icon"><Icon name="shield" /></div><div className="eyebrow">LOCAL STORAGE UNAVAILABLE</div><h1>Workspace could not be opened</h1><p>{storageError}</p><p>Your data was not loaded. Do not clear browser data or reinstall the app as a recovery step.</p><button className="secondary-button" onClick={() => window.location.reload()}>Try again</button></section>}
        {status === "ready" && active === "overview" && <Overview business={business} customers={customers} products={products} documents={documents} onNavigate={setActive} />}
        {status === "ready" && active === "settings" && <BusinessSettings business={business} onSave={handleSaveBusiness} />}
        {status === "ready" && active === "backup" && <BackupRecovery database={database} onRestore={handleRestoreBackup} />}
        <ApplicationUpdates active={status === "ready" && active === "application"} gstRulesVersion={GST_RULE_VERSIONS[0]?.id ?? "unknown"} />
        {status === "ready" && active === "templates" && <TemplateDirectory
          business={business}
          templates={templates}
          deps={templateDeps}
          onRefresh={handleRefreshTemplates}
        />}
        {status === "ready" && active === "customers" && <CustomerDirectory business={business} customers={customers} onCreate={handleCreateCustomer} onNavigate={setActive} />}
        {status === "ready" && active === "products" && <ProductDirectory
          business={business}
          products={products}
          templates={templates}
          rates={savedGstRates}
          categories={taxCategories}
          onNavigate={setActive}
          onSaveProduct={handleSaveProduct}
          onSaveRate={handleSaveRate}
        />}
        {status === "ready" && active === "payments" && <PaymentsDirectory
          business={business}
          customers={customers}
          documents={documents}
          onLoadActivity={handleLoadPaymentActivity}
          onGetInvoiceSettlement={handleGetInvoiceSettlement}
          onRecordReceipt={handleRecordReceipt}
          onAllocate={handleAllocate}
          onReleaseAllocation={handleReleaseAllocation}
          onRecordRefund={handleRecordRefund}
          onReverseReceipt={handleReverseReceipt}
          onReverseRefund={handleReverseRefund}
        />}
        {status === "ready" && active === "invoices" && <DocumentDirectory
          business={business}
          customers={customers}
          products={products}
          documents={documents}
          onNavigate={setActive}
          onSave={handleSaveDocument}
          onFinalize={handleFinalizeDocument}
          onCancel={handleCancelDocument}
          onRenderIssued={handleRenderIssuedDocument}
        />}
        {status === "ready" && !["overview", "settings", "backup", "application", "customers", "products", "payments", "invoices", "templates"].includes(active) && <Placeholder section={active} onBack={() => setActive("overview")} />}
      </div>
    </main>
  </div>;
}
