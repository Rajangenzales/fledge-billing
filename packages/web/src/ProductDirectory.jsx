import React, { useState } from "react";

const emptyProduct = {
  type: "goods",
  name: "",
  code: "",
  description: "",
  hsnSac: "",
  unit: "",
  defaultPrice: "",
  defaultDiscount: "0",
  taxCategoryId: "taxable",
  savedGstRateId: "",
  taxInclusive: false,
  active: true,
};

function ProductForm({ product, rates, categories, onSave, onCancel }) {
  const [values, setValues] = useState(product ? {
    type: product.type,
    name: product.name,
    code: product.code ?? "",
    description: product.description ?? "",
    hsnSac: product.hsnSac ?? "",
    unit: product.unit,
    defaultPrice: product.defaultPrice,
    defaultDiscount: product.defaultDiscount,
    taxCategoryId: product.taxCategoryId,
    savedGstRateId: product.savedGstRateId ?? "",
    taxInclusive: product.taxInclusive,
    active: product.active,
  } : emptyProduct);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  function update(field, value) {
    setValues((current) => ({
      ...current,
      [field]: value,
      ...(field === "taxCategoryId" && value !== "taxable"
        ? { savedGstRateId: "", taxInclusive: false }
        : {}),
    }));
    setMessage("");
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      await onSave({
        ...values,
        code: values.code || null,
        description: values.description || null,
        hsnSac: values.hsnSac || null,
        savedGstRateId: values.savedGstRateId || null,
      }, product?.id ?? null);
      onCancel();
    } catch (error) {
      setMessage(userMessage(error));
    } finally {
      setSaving(false);
    }
  }

  const selectableRates = rates.filter(
    (rate) => rate.active || rate.id === values.savedGstRateId,
  );

  return <form className="panel form-panel" onSubmit={submit}>
    <h2>{product ? "Edit product or service" : "New product or service"}</h2>
    <div className="form-grid">
      <label>Type<select value={values.type} onChange={(event) => update("type", event.target.value)}><option value="goods">Goods</option><option value="service">Service</option></select></label>
      <label>Name<input required maxLength={200} value={values.name} onChange={(event) => update("name", event.target.value)} /></label>
      <label>Product code (optional)<input maxLength={40} value={values.code} onChange={(event) => update("code", event.target.value)} /></label>
      <label>HSN / SAC (optional)<input inputMode="numeric" maxLength={8} value={values.hsnSac} onChange={(event) => update("hsnSac", event.target.value)} /></label>
      <label>Unit<input required maxLength={16} placeholder="nos, kg, hrs" value={values.unit} onChange={(event) => update("unit", event.target.value)} /></label>
      <label>Default price (₹)<input required inputMode="decimal" placeholder="100.00" value={values.defaultPrice} onChange={(event) => update("defaultPrice", event.target.value)} /></label>
      <label>Default discount (₹)<input inputMode="decimal" value={values.defaultDiscount} onChange={(event) => update("defaultDiscount", event.target.value)} /></label>
      <label>Tax category<select value={values.taxCategoryId} onChange={(event) => update("taxCategoryId", event.target.value)}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
      {values.taxCategoryId === "taxable" && <>
        <label>Saved GST rate<select required value={values.savedGstRateId} onChange={(event) => update("savedGstRateId", event.target.value)}><option value="">Choose saved rate</option>{selectableRates.map((rate) => <option key={rate.id} value={rate.id}>{rate.name} · {rate.percentage}%{rate.active ? "" : " (inactive)"}</option>)}</select></label>
        <label className="checkbox-field"><input type="checkbox" checked={values.taxInclusive} onChange={(event) => update("taxInclusive", event.target.checked)} /> Default price includes tax</label>
        {selectableRates.length === 0 && <p className="form-message form-span">Add an active saved GST rate below before saving a taxable product.</p>}
      </>}
      <label className="form-span">Description (optional)<textarea rows="2" maxLength={2000} value={values.description} onChange={(event) => update("description", event.target.value)} /></label>
      {product && <label className="checkbox-field form-span"><input type="checkbox" checked={values.active} onChange={(event) => update("active", event.target.checked)} /> Active and available for new documents</label>}
    </div>
    {message && <p className="form-message error-message" role="alert">{message}</p>}
    <div className="form-actions"><span>Product defaults do not calculate or lock document tax.</span><div className="button-row"><button className="secondary-button" type="button" onClick={onCancel}>Cancel</button><button className="primary-button" type="submit" disabled={saving}>{saving ? "Saving…" : product ? "Save changes" : "Save product"}</button></div></div>
  </form>;
}

function RateForm({ rate, onSave, onCancel }) {
  const [values, setValues] = useState({
    name: rate?.name ?? "",
    percentage: rate?.percentage ?? "",
    active: rate?.active ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      await onSave(values, rate?.id ?? null);
      onCancel();
    } catch (error) {
      setMessage(userMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return <form className="rate-form" onSubmit={submit}>
    <div className="form-grid">
      <label>Rate name<input required maxLength={80} value={values.name} onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))} /></label>
      <label>Percentage<input required inputMode="decimal" placeholder="18" value={values.percentage} onChange={(event) => setValues((current) => ({ ...current, percentage: event.target.value }))} /></label>
      {rate && <label className="checkbox-field form-span"><input type="checkbox" checked={values.active} onChange={(event) => setValues((current) => ({ ...current, active: event.target.checked }))} /> Active for new products</label>}
    </div>
    {message && <p className="form-message error-message" role="alert">{message}</p>}
    <div className="form-actions"><span>Saved percentages are business-configured values, not statutory tax rules.</span><div className="button-row"><button className="secondary-button" type="button" onClick={onCancel}>Cancel</button><button className="primary-button" type="submit" disabled={saving}>{saving ? "Saving…" : rate ? "Save rate" : "Add rate"}</button></div></div>
  </form>;
}

export default function ProductDirectory({
  business,
  products,
  rates,
  categories,
  onNavigate,
  onSaveProduct,
  onSaveRate,
}) {
  const [editingProduct, setEditingProduct] = useState(undefined);
  const [editingRate, setEditingRate] = useState(undefined);

  return <section className="workflow-page">
    <div className="page-title"><div><div className="eyebrow">YOUR BUSINESS</div><h1>Products &amp; services</h1><p>Manage business-scoped catalog items and user-configured GST rates.</p></div>
      {business && <button className="primary-button" onClick={() => { setEditingProduct(null); setEditingRate(undefined); }}><span aria-hidden="true">＋</span> Add product</button>}
    </div>
    {!business && <div className="panel empty-state"><h2>Set up your business first</h2><p>A business profile is required before products and saved rates can be added.</p><button className="primary-button" onClick={() => onNavigate("settings")}>Add business details</button></div>}
    {business && <>
      {editingProduct !== undefined && <ProductForm
        key={editingProduct?.id ?? "new-product"}
        product={editingProduct}
        rates={rates}
        categories={categories}
        onSave={onSaveProduct}
        onCancel={() => setEditingProduct(undefined)}
      />}
      <div className="panel customer-list-panel">
        <div className="panel-heading"><div><div className="eyebrow">PRODUCT CATALOG</div><h2>{products.length ? `${products.length} saved` : "Your products and services"}</h2></div></div>
        {products.length === 0 ? <div className="empty-list"><div className="placeholder-icon">□</div><h3>No products or services yet</h3><p>Create a catalog item to reuse its default price and tax configuration when billing workflows are added.</p><button className="secondary-button" onClick={() => setEditingProduct(null)}>Add first product</button></div> :
          <ul className="customer-list">{products.map((product) => <li key={product.id}>
            <span className="customer-avatar">{product.name.slice(0, 1).toUpperCase()}</span>
            <span className="customer-list-main"><strong>{product.name}{!product.active && <span className="inactive-badge">Inactive</span>}</strong><small>{product.type === "goods" ? "Goods" : "Service"} · {product.taxCategory.name}{product.savedGstRate ? ` · ${product.savedGstRate.percentage}%` : ""}</small></span>
            <span className="customer-contact">₹{product.defaultPrice} / {product.unit}</span>
            <button className="list-action" aria-label={`Edit ${product.name}`} onClick={() => { setEditingProduct(product); setEditingRate(undefined); }}>Edit</button>
          </li>)}</ul>}
      </div>
      <div className="panel customer-list-panel">
        <div className="panel-heading"><div><div className="eyebrow">SAVED GST RATES</div><h2>Business-configured rates</h2></div>
          <button className="secondary-button" onClick={() => { setEditingRate(null); setEditingProduct(undefined); }}>Add rate</button>
        </div>
        <p className="panel-copy">These values are configuration for your catalog only; they are not a statutory reference or tax calculation.</p>
        {editingRate !== undefined && <RateForm
          key={editingRate?.id ?? "new-rate"}
          rate={editingRate}
          onSave={onSaveRate}
          onCancel={() => setEditingRate(undefined)}
        />}
        {rates.length === 0 ? <div className="empty-list"><h3>No saved rates yet</h3><p>Add a rate before creating a taxable product.</p></div> :
          <ul className="customer-list">{rates.map((rate) => <li key={rate.id}>
            <span className="customer-avatar">%</span>
            <span className="customer-list-main"><strong>{rate.name}{!rate.active && <span className="inactive-badge">Inactive</span>}</strong><small>Saved catalog rate</small></span>
            <span className="customer-contact">{rate.percentage}%</span>
            <button className="list-action" aria-label={`Edit ${rate.name}`} onClick={() => { setEditingRate(rate); setEditingProduct(undefined); }}>Edit</button>
          </li>)}</ul>}
      </div>
    </>}
  </section>;
}

function userMessage(error) {
  return error?.userMessage || error?.message || "The requested change could not be saved.";
}
