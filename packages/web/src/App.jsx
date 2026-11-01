import React, { useState } from "react";

const navigation = [
  { id: "overview", label: "Overview", icon: "grid" },
  { id: "invoices", label: "Invoices", icon: "file" },
  { id: "customers", label: "Customers", icon: "users" },
  { id: "products", label: "Products & services", icon: "box" },
  { id: "payments", label: "Payments", icon: "wallet" },
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

function Overview({ onNavigate }) {
  return <>
    <section className="welcome-row">
      <div><div className="eyebrow">YOUR BUSINESS, IN GOOD ORDER</div><h1>Good morning.</h1><p>Your billing workspace is ready to be set up.</p></div>
      <button className="primary-button" onClick={() => onNavigate("invoices")}><Icon name="plus" size={17} /> Create invoice</button>
    </section>
    <section className="metrics-grid">
      <Metric label="Total invoices" value="—" note="Setup pending" icon="file" />
      <Metric label="Outstanding" value="—" note="No data yet" icon="wallet" />
      <Metric label="Customers" value="—" note="Ready to add" icon="users" />
      <Metric label="Products & services" value="—" note="Ready to add" icon="box" />
    </section>
    <section className="content-grid">
      <article className="panel setup-panel">
        <div className="panel-heading"><div><div className="eyebrow">GET STARTED</div><h2>Set up your workspace</h2></div><span className="step-count">0 of 3</span></div>
        <p className="panel-copy">A few details will prepare Fledge for your everyday billing.</p>
        <div className="setup-list">
          <button className="setup-item" onClick={() => onNavigate("settings")}><span className="setup-number">01</span><span className="setup-text"><strong>Add your business details</strong><small>Business name, address and GST registration</small></span><Icon name="arrow" /></button>
          <button className="setup-item" onClick={() => onNavigate("customers")}><span className="setup-number">02</span><span className="setup-text"><strong>Add your first customer</strong><small>Keep customer and billing details together</small></span><Icon name="arrow" /></button>
          <button className="setup-item" onClick={() => onNavigate("products")}><span className="setup-number">03</span><span className="setup-text"><strong>Add products or services</strong><small>Prepare your items for faster invoicing</small></span><Icon name="arrow" /></button>
        </div>
      </article>
      <aside className="panel privacy-panel">
        <div className="privacy-mark"><Icon name="shield" size={22} /></div>
        <div className="eyebrow">LOCAL-FIRST BY DESIGN</div>
        <h2>Your business data stays close.</h2>
        <p>This browser shell does not send business or customer data to a cloud service. Local database workflows are being connected in upcoming stages.</p>
        <div className="privacy-status"><span className="status-dot" /> Browser preview <span className="status-divider">·</span> No data sync</div>
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
    <p>This area is part of the Fledge Billing plan. Its data workflows will be connected in focused stages. Nothing is being simulated or saved in this preview.</p>
    <button className="secondary-button" onClick={onBack}>Back to overview</button>
  </section>;
}

export default function App() {
  const [active, setActive] = useState("overview");
  const selected = navigation.find((item) => item.id === active);
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand-lockup"><div className="brand-symbol">f</div><div><div className="brand-name">fledge</div><div className="brand-subtitle">BILLING</div></div></div>
      <div className="workspace-switcher"><div className="workspace-avatar">B</div><div className="workspace-meta"><strong>My business</strong><span>Local workspace</span></div><span className="switcher-chevron">⌄</span></div>
      <div className="nav-caption">WORKSPACE</div>
      <nav className="main-nav" aria-label="Main navigation">
        {navigation.map((item) => <button key={item.id} className={active === item.id ? "nav-item active" : "nav-item"} onClick={() => setActive(item.id)}><Icon name={item.icon} /><span>{item.label}</span></button>)}
      </nav>
      <div className="sidebar-spacer" />
      <button className={active === "settings" ? "nav-item active" : "nav-item"} onClick={() => setActive("settings")}><Icon name="settings" /><span>Settings</span></button>
      <div className="sidebar-footer"><span className="footer-dot" /> Local preview <span className="version-label">v0.1</span></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div className="breadcrumb">Workspace <span>/</span> {selected?.label || (active === "settings" ? "Settings" : "Overview")}</div><div className="topbar-right"><span className="offline-pill"><span /> Local mode</span><div className="profile-avatar">B</div></div></header>
      <div className="page-content">
        {active === "overview" ? <Overview onNavigate={setActive} /> : <Placeholder section={active} onBack={() => setActive("overview")} />}
      </div>
    </main>
  </div>;
}
