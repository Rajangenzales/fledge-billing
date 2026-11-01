import React from "react";
import { presentationLines } from "@fledge/domain";

export default function IssuedDocumentOutput({
  render,
  busy,
  message,
  onDownload,
  onPrint,
  onShare,
}) {
  const lines = presentationLines(render);
  return <section className="document-output" aria-label="Issued document preview">
    <div className="document-output-actions">
      <h3>Customer document preview</h3>
      <div className="button-row">
        <button className="secondary-button" type="button" disabled={busy} onClick={onPrint}>Print</button>
        <button className="secondary-button" type="button" disabled={busy} onClick={onShare}>Share PDF</button>
        <button className="primary-button" type="button" disabled={busy} onClick={onDownload}>Download PDF</button>
      </div>
    </div>
    {message && <p className="form-message" role="status">{message}</p>}
    <article className="document-output-content" style={{
      "--document-brand-color": render.brandColor || "#1f4b99",
      "--document-font-family": render.fontFamily === "source-sans" ? '"Source Sans 3", "Segoe UI", sans-serif' : 'system-ui, -apple-system, "Segoe UI", sans-serif',
      "--document-line-gap": render.density === "compact" ? "0.2rem" : "0.45rem",
    }}>
      {render.logoDataUrl && <img className="business-logo-preview" src={render.logoDataUrl} alt="Business logo" />}
      {lines.map((line, index) => <p key={`${index}-${line}`}>{line}</p>)}
    </article>
  </section>;
}
