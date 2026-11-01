import React, { useState } from "react";
import { createEncryptedBackup } from "./backup.js";

function messageFor(error) {
  return error instanceof Error && error.message
    ? error.message
    : "The backup operation could not be completed.";
}

export default function BackupRecovery({ database, onRestore }) {
  const [exportPassphrase, setExportPassphrase] = useState("");
  const [exportConfirmation, setExportConfirmation] = useState("");
  const [restorePassphrase, setRestorePassphrase] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [feedbackIsError, setFeedbackIsError] = useState(false);

  async function exportBackup(event) {
    event.preventDefault();
    setFeedback("");
    if (exportPassphrase !== exportConfirmation) {
      setFeedback("The passphrases do not match.");
      setFeedbackIsError(true);
      return;
    }
    setBusy(true);
    try {
      const contents = await createEncryptedBackup(database, exportPassphrase);
      const url = URL.createObjectURL(new Blob([contents], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `fledge-backup-${new Date().toISOString().slice(0, 10)}.fledge-backup.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExportPassphrase("");
      setExportConfirmation("");
      setFeedback("Encrypted backup downloaded. Keep the file and passphrase somewhere safe.");
      setFeedbackIsError(false);
    } catch (error) {
      setFeedback(messageFor(error));
      setFeedbackIsError(true);
    } finally {
      setBusy(false);
    }
  }

  async function importBackup(event) {
    event.preventDefault();
    const form = event.currentTarget;
    setFeedback("");
    if (!file) {
      setFeedback("Choose a Fledge backup file first.");
      setFeedbackIsError(true);
      return;
    }
    if (!window.confirm(
      "Restore this backup and replace all current local business records in this browser? This cannot be undone. Download a backup of your current records first if you may need them.",
    )) {
      return;
    }
    setBusy(true);
    try {
      const contents = await file.text();
      await onRestore(contents, restorePassphrase);
      setRestorePassphrase("");
      setFile(null);
      form.reset();
      setFeedback("Backup restored. Your local workspace now contains the restored records.");
      setFeedbackIsError(false);
    } catch (error) {
      setFeedback(messageFor(error));
      setFeedbackIsError(true);
    } finally {
      setBusy(false);
    }
  }

  return <section className="backup-page">
    <div className="page-title">
      <div>
        <div className="eyebrow">LOCAL DATA SAFETY</div>
        <h1>Backup &amp; recovery</h1>
        <p>Make an encrypted copy of this browser workspace or restore one from a backup file.</p>
      </div>
    </div>
    <aside className="backup-warning" role="note">
      <strong>Important: keep a separate backup.</strong>
      <span>These files contain sensitive business data, including customer details, invoices, payment records and settings. Protect the file and passphrase. If you forget the passphrase, Fledge cannot recover it. Browser storage can be cleared or evicted, so it may not be your only copy.</span>
    </aside>
    <div className="backup-grid">
      <form className="panel backup-panel" onSubmit={exportBackup}>
        <div className="eyebrow">CREATE A COPY</div>
        <h2>Export encrypted backup</h2>
        <p>All local business records are encrypted on this device with your passphrase before download.</p>
        <label className="backup-field">Passphrase
          <input type="password" autoComplete="new-password" value={exportPassphrase} onChange={(event) => setExportPassphrase(event.target.value)} minLength={12} required />
        </label>
        <label className="backup-field">Confirm passphrase
          <input type="password" autoComplete="new-password" value={exportConfirmation} onChange={(event) => setExportConfirmation(event.target.value)} minLength={12} required />
        </label>
        <p className="backup-hint">Use at least 12 characters. Keep this passphrase separately; it is required to restore the file.</p>
        <button className="primary-button" type="submit" disabled={busy}>{busy ? "Preparing backup…" : "Download encrypted backup"}</button>
      </form>

      <form className="panel backup-panel" onSubmit={importBackup}>
        <div className="eyebrow">REPLACE THIS WORKSPACE</div>
        <h2>Restore from backup</h2>
        <p>The complete backup is checked for format, schema compatibility and record integrity before anything is replaced.</p>
        <label className="backup-field">Backup file
          <input type="file" accept=".json,application/json" onChange={(event) => setFile(event.target.files?.[0] ?? null)} required />
        </label>
        <label className="backup-field">Backup passphrase
          <input type="password" autoComplete="current-password" value={restorePassphrase} onChange={(event) => setRestorePassphrase(event.target.value)} minLength={12} required />
        </label>
        <p className="backup-hint">Restore replaces all current local records, including finalized document history. Export the current workspace first if you need to keep it.</p>
        <button className="danger-button" type="submit" disabled={busy || !file}>{busy ? "Validating and restoring…" : "Validate and restore backup"}</button>
      </form>
    </div>
    {feedback && <p className={feedbackIsError ? "backup-feedback error" : "backup-feedback"} role={feedbackIsError ? "alert" : "status"}>{feedback}</p>}
  </section>;
}
