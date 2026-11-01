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
    <article className="document-output-content">
      {render.logoDataUrl && <img className="business-logo-preview" src={render.logoDataUrl} alt="Business logo" />}
      {lines.map((line, index) => <p key={`${index}-${line}`}>{line}</p>)}
    </article>
  </section>;
}
