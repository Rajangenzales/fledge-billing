import React, { useEffect, useRef, useState } from "react";
import { GST_RULE_VERSIONS } from "@fledge/domain";
import release from "./release-manifest.json";
import { DATABASE_VERSION } from "./indexed-db.js";
import {
  applyPwaUpdate,
  checkForPwaUpdate,
  registerPwaServiceWorker,
  watchPwaRegistration,
} from "./pwa-updates.js";

const GST_RULES_VERSION = GST_RULE_VERSIONS[0]?.id ?? "unknown";

export default function ApplicationUpdates({ active = false, gstRulesVersion = GST_RULES_VERSION }) {
  const [registration, setRegistration] = useState(null);
  const [status, setStatus] = useState("checking");
  const [message, setMessage] = useState("");
  const applyingUpdate = useRef(false);
  const pendingRelease = useRef(null);

  useEffect(() => {
    let isMounted = true;
    let stopWatching = () => {};
    const serviceWorker = globalThis.navigator?.serviceWorker;
    const handleControllerChange = () => {
      if (applyingUpdate.current) globalThis.location.reload();
    };
    serviceWorker?.addEventListener("controllerchange", handleControllerChange);
    registerPwaServiceWorker().then((nextRegistration) => {
      if (!isMounted) return;
      if (!nextRegistration) {
        setStatus("unsupported");
        return;
      }
      setRegistration(nextRegistration);
      setStatus(nextRegistration.installing ? "downloading" : nextRegistration.waiting ? "unverified" : "ready");
      stopWatching = watchPwaRegistration(nextRegistration, (nextStatus) => {
        if (nextStatus === "unverified" && pendingRelease.current) {
          setStatus(pendingRelease.current.mandatory ? "mandatory" : "available");
        } else {
          setStatus(nextStatus);
        }
      });
    }).catch((error) => {
      if (!isMounted) return;
      setStatus("failed");
      setMessage(error?.message || "The application service worker could not be registered.");
    });
    return () => {
      isMounted = false;
      stopWatching();
      serviceWorker?.removeEventListener("controllerchange", handleControllerChange);
    };
  }, []);

  async function checkForUpdates() {
    setMessage("");
    setStatus("checking");
    pendingRelease.current = null;
    try {
      const result = await checkForPwaUpdate(registration);
      pendingRelease.current = result.release ?? null;
      const nextStatus = result.status === "downloading" && registration.waiting
        ? (result.release?.mandatory ? "mandatory" : "available")
        : result.status;
      setStatus(nextStatus);
      setMessage(result.reason || statusMessage(nextStatus));
    } catch (error) {
      setStatus("failed");
      setMessage(error?.message || "The update check failed. Try again when online.");
    }
  }

  function applyUpdate() {
    try {
      if (!pendingRelease.current || !["available", "mandatory"].includes(status)) {
        throw new Error("Check release compatibility before installing this update.");
      }
      setMessage("");
      applyingUpdate.current = true;
      applyPwaUpdate(registration, pendingRelease.current);
      setStatus("installing");
      setMessage("Applying the update. This page will reload when it is ready.");
    } catch (error) {
      applyingUpdate.current = false;
      setStatus("failed");
      setMessage(error?.message || "The update could not be applied. You can retry.");
    }
  }

  if (!active) return null;

  return <section className="workflow-page application-updates">
    <div className="page-title">
      <div>
        <div className="eyebrow">APPLICATION</div>
        <h1>Application &amp; updates</h1>
        <p>Check for an app-shell update. Updates do not intentionally change your local business records.</p>
      </div>
    </div>
    <div className="panel application-version-panel">
      <h2>Installed application</h2>
      <dl>
        <div><dt>Version</dt><dd>{release.version}</dd></div>
        <div><dt>GST rules</dt><dd>{gstRulesVersion}</dd></div>
        <div><dt>Database schema</dt><dd>{DATABASE_VERSION}</dd></div>
        <div><dt>Offline shell</dt><dd>{status === "unsupported" ? "Unavailable in this browser" : "Available after a successful online load"}</dd></div>
      </dl>
      <div className="application-update-actions">
        <button className="secondary-button" type="button" disabled={!registration || status === "checking" || status === "installing"} onClick={checkForUpdates}>
          {status === "checking" ? "Checking…" : "Check for updates"}
        </button>
        {["available", "mandatory"].includes(status) && <button className="primary-button" type="button" onClick={applyUpdate}>Update now</button>}
      </div>
      <p className="application-update-status" role={["failed", "incompatible"].includes(status) ? "alert" : "status"}>
        {message || statusLabel(status)}
      </p>
      <h3>Release notes</h3>
      <ul>{(pendingRelease.current?.releaseNotes ?? release.releaseNotes).map((note) => <li key={note}>{note}</li>)}</ul>
      <p className="application-release-note">The service worker checks for new assets and serves the cached application shell after a previous successful online load. First-load offline use is not available. Update installation requires opening the app online and choosing <strong>Update now</strong>.</p>
    </div>
  </section>;
}

function statusMessage(status) {
  switch (status) {
    case "current": return "No application update is available.";
    case "available": return "A compatible update is ready to install.";
    case "mandatory": return "A compatible mandatory update is ready to install.";
    case "downloading": return "A compatible update is downloading. Keep this page open.";
    case "unavailable": return "Release information is not available yet. Try again when online.";
    default: return "";
  }
}

function statusLabel(status) {
  switch (status) {
    case "ready": return "Service worker is registered.";
    case "available": return "A verified compatible update is ready to install.";
    case "mandatory": return "A verified mandatory update is ready to install.";
    case "unverified": return "A service-worker update is waiting. Check compatibility before installing.";
    case "downloading": return "An update is downloading.";
    case "installing": return "The update is being applied.";
    case "unsupported": return "This browser does not support service-worker updates.";
    case "incompatible": return "The available release is not compatible with this app, browser, or database.";
    case "unavailable": return "Release information is not available yet.";
    case "failed": return "The update operation failed. Retry when online.";
    default: return "Checking application support…";
  }
}
