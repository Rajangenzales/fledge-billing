import { createHash, webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import release from "./release-manifest.json";
import {
  applyPwaUpdate,
  checkForPwaUpdate,
  detectBrowser,
  detectPlatform,
  registerPwaServiceWorker,
  validateReleaseManifest,
  watchPwaRegistration,
} from "./pwa-updates.js";

const workerBytes = Buffer.from("service-worker:0.1.0");
const bundleBytes = Buffer.from("app-bundle:0.1.0");
const workerHash = hash(workerBytes);
const bundleHash = hash(bundleBytes);
const releaseDate = "2026-04-04";

describe("PWA update lifecycle", () => {
  it("registers the root-scoped application service worker", async () => {
    const registration = { scope: "/" };
    const serviceWorker = { register: vi.fn().mockResolvedValue(registration) };
    await expect(registerPwaServiceWorker(serviceWorker)).resolves.toBe(registration);
    expect(serviceWorker.register).toHaveBeenCalledWith("/sw.js", { scope: "/", updateViaCache: "none" });
  });

  it("reports unsupported browsers explicitly", async () => {
    await expect(registerPwaServiceWorker(null)).resolves.toBeNull();
    await expect(checkForPwaUpdate(null)).rejects.toThrow(/not available/i);
  });

  it("returns current when the installed release is latest", async () => {
    const registration = { update: vi.fn() };
    const fetcher = createFetcher(release);
    const result = await checkForPwaUpdate(registration, { fetcher, platform: "windows", browser: chrome });
    expect(result).toEqual({ status: "current", release });
    expect(registration.update).not.toHaveBeenCalled();
  });

  it("marks a compatible verified release available before calling the browser update", async () => {
    const registration = { waiting: {}, update: vi.fn() };
    const fetcher = createFetcher(makeRelease());
    const result = await checkForPwaUpdate(registration, {
      fetcher,
      platform: "windows",
      browser: chrome,
      cryptoProvider: webcrypto,
    });
    expect(result.status).toBe("available");
    expect(result.release.version).toBe("0.1.0");
    expect(fetcher.mock.calls.map(([url]) => new URL(url).pathname)).toEqual([
      "/release-manifest.json",
      "/sw.js",
      "/assets/app.js",
    ]);
    expect(registration.update).toHaveBeenCalledOnce();
  });

  it("reports mandatory updates separately", async () => {
    const registration = { waiting: {}, update: vi.fn() };
    const fetcher = createFetcher(makeRelease({ mandatory: true }));
    const result = await checkForPwaUpdate(registration, {
      fetcher,
      platform: "windows",
      browser: chrome,
      cryptoProvider: webcrypto,
    });
    expect(result.status).toBe("mandatory");
  });

  it("reports a failed update when the browser finds no new worker", async () => {
    const registration = { update: vi.fn() };
    await expect(checkForPwaUpdate(registration, {
      fetcher: createFetcher(makeRelease()),
      platform: "windows",
      browser: chrome,
      cryptoProvider: webcrypto,
    })).rejects.toThrow(/did not find the verified service-worker update/i);
    expect(registration.update).toHaveBeenCalledOnce();
  });

  it("orders semantic pre-release versions correctly", async () => {
    const registration = { waiting: {}, update: vi.fn() };
    const result = await checkForPwaUpdate(registration, {
      fetcher: createFetcher(makeRelease({ version: "0.0.0-dev.1" })),
      platform: "windows",
      browser: chrome,
      cryptoProvider: webcrypto,
    });
    expect(result.status).toBe("available");
  });

  it("returns unavailable when release metadata has not been published", async () => {
    const registration = { update: vi.fn() };
    const result = await checkForPwaUpdate(registration, {
      fetcher: vi.fn().mockResolvedValue(new Response(null, { status: 404 })),
    });
    expect(result).toEqual({ status: "unavailable" });
    expect(registration.update).not.toHaveBeenCalled();
  });

  it("surfaces failed metadata requests", async () => {
    await expect(checkForPwaUpdate({ update: vi.fn() }, {
      fetcher: vi.fn().mockRejectedValue(new Error("offline")),
    })).rejects.toThrow(/unavailable/i);
  });

  it.each([
    ["downgrade", { version: "0.0.0-alpha", minimumSupportedVersion: "0.0.0-alpha" }, /older/i],
    ["minimum app version", { minimumSupportedVersion: "1.0.0" }, /newer installed/i],
    ["database schema", {
      database: {
        ...makeRelease().database,
        schemaVersion: 7,
        compatibleSchemaVersions: [7],
        migration: { ...makeRelease().database.migration, toSchemaVersion: 7 },
      },
    }, /database schema/i],
    ["operating system", { support: { ...makeRelease().support, operatingSystems: ["android"] } }, /operating system/i],
    ["browser family", {
      support: {
        ...makeRelease().support,
        browsersByOperatingSystem: { ...makeRelease().support.browsersByOperatingSystem, windows: ["safari"] },
      },
    }, /browser/i],
    ["browser major", {
      support: {
        ...makeRelease().support,
        minimumBrowserMajor: { ...makeRelease().support.minimumBrowserMajor, chrome: 135 },
      },
    }, /chrome 135/i],
  ])("rejects an incompatible release (%s) before updating", async (_label, overrides, message) => {
    const registration = { update: vi.fn() };
    const fetcher = createFetcher(makeRelease(overrides));
    const result = await checkForPwaUpdate(registration, {
      fetcher,
      platform: "windows",
      browser: chrome,
      cryptoProvider: webcrypto,
    });
    expect(result.status).toBe("incompatible");
    expect(result.reason).toMatch(message);
    expect(registration.update).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("rejects missing release integrity metadata", async () => {
    const invalidRelease = makeRelease();
    invalidRelease.integrity.sha256 = null;
    const result = await checkForPwaUpdate({ update: vi.fn() }, {
      fetcher: createFetcher(invalidRelease),
      platform: "windows",
      browser: chrome,
      cryptoProvider: webcrypto,
    });
    expect(result.status).toBe("incompatible");
    expect(result.reason).toMatch(/integrity hash/i);
  });

  it("rejects an integrity mismatch without invoking service-worker update", async () => {
    const registration = { update: vi.fn() };
    const fetcher = createFetcher(makeRelease(), { worker: Buffer.from("unexpected") });
    await expect(checkForPwaUpdate(registration, {
      fetcher,
      platform: "windows",
      browser: chrome,
      cryptoProvider: webcrypto,
    })).rejects.toThrow(/integrity hash/i);
    expect(registration.update).not.toHaveBeenCalled();
  });

  it("rejects malformed manifests and invalid distribution metadata", () => {
    expect(validateReleaseManifest(null)).toMatch(/object/i);
    const invalidRelease = makeRelease();
    invalidRelease.referenceUrl = "//outside.example";
    expect(validateReleaseManifest(invalidRelease)).toMatch(/distribution/i);
    invalidRelease.referenceUrl = "/";
    invalidRelease.version = "01.0.0";
    expect(validateReleaseManifest(invalidRelease)).toMatch(/version/i);
  });

  it("detects approved platform and browser versions", () => {
    expect(detectPlatform({ platform: "MacIntel", maxTouchPoints: 5 })).toBe("ipados");
    expect(detectPlatform({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" })).toBe("windows");
    expect(detectBrowser({ userAgent: "Mozilla/5.0 Edg/134.0.0.0" })).toEqual({ name: "edge", majorVersion: 134 });
    expect(detectBrowser({ userAgent: "Mozilla/5.0 Version/18.3 Safari/605.1" })).toEqual({ name: "safari", majorVersion: 18 });
  });

  it("requires an integrity-verified release before applying a waiting worker", async () => {
    const postMessage = vi.fn();
    const registration = { waiting: { postMessage }, update: vi.fn() };
    expect(() => applyPwaUpdate(registration)).toThrow(/verified compatible release/i);
    const result = await checkForPwaUpdate(registration, {
      fetcher: createFetcher(makeRelease()),
      platform: "windows",
      browser: chrome,
      cryptoProvider: webcrypto,
    });
    applyPwaUpdate(registration, result.release);
    expect(postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
  });

  it("reports an unverified waiting worker and supports cleanup", () => {
    const listeners = new Map();
    const registration = {
      installing: null,
      waiting: null,
      addEventListener: (name, listener) => listeners.set(name, listener),
      removeEventListener: (name) => listeners.delete(name),
    };
    const onStatus = vi.fn();
    const cleanup = watchPwaRegistration(registration, onStatus);
    const stateListeners = new Map();
    registration.installing = {
      state: "installing",
      addEventListener: (name, listener) => stateListeners.set(name, listener),
    };
    listeners.get("updatefound")();
    expect(onStatus).toHaveBeenLastCalledWith("downloading");
    registration.waiting = {};
    registration.installing.state = "installed";
    stateListeners.get("statechange")();
    expect(onStatus).toHaveBeenLastCalledWith("unverified");
    cleanup();
    expect(listeners.has("updatefound")).toBe(false);
  });

  it("keeps development and public release descriptors in sync", async () => {
    const publicManifest = JSON.parse(await readFile(fileURLToPath(new URL("../public/release-manifest.json", import.meta.url)), "utf8"));
    expect(publicManifest).toEqual(release);
  });
});

const chrome = { name: "chrome", majorVersion: 134 };

function makeRelease(overrides = {}) {
  const manifest = structuredClone(release);
  Object.assign(manifest, {
    version: "0.1.0",
    minimumSupportedVersion: "0.0.0-dev",
    releaseDate,
    releaseNotes: ["Verified release"],
    ...overrides,
  });
  manifest.database = { ...manifest.database, ...overrides.database };
  manifest.support = {
    ...manifest.support,
    minimumBrowserMajor: { chrome: 130, edge: 130, firefox: 120, safari: 17 },
    ...overrides.support,
  };
  manifest.integrity = {
    ...manifest.integrity,
    sha256: workerHash,
    artifacts: [{ url: "/assets/app.js", sha256: bundleHash }],
    ...overrides.integrity,
  };
  return manifest;
}

function createFetcher(manifest, { worker = workerBytes, bundle = bundleBytes } = {}) {
  const bodies = new Map([
    ["/release-manifest.json", Buffer.from(JSON.stringify(manifest))],
    ["/sw.js", worker],
    ["/assets/app.js", bundle],
  ]);
  return vi.fn(async (url) => {
    const body = bodies.get(new URL(url).pathname);
    return body
      ? new Response(body, { status: 200 })
      : new Response(null, { status: 404 });
  });
}

function hash(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
