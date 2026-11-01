import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

const serviceWorkerSource = (await readFile(
  fileURLToPath(new URL("../public/sw.js", import.meta.url)),
  "utf8",
)).replace("__FLEDGE_BUILD_VERSION__", "test-version");

describe("PWA service worker", () => {
  it("precaches the app shell and all entry assets before installation completes", async () => {
    const harness = serviceWorkerHarness();
    runInNewContext(serviceWorkerSource, harness.context);

    const install = harness.listeners.get("install");
    let completed;
    install({ waitUntil: (promise) => { completed = promise; } });
    await completed;

    expect([...harness.cached.keys()]).toEqual(expect.arrayContaining([
      "https://fledge.example/",
      "https://fledge.example/manifest.webmanifest",
      "https://fledge.example/release-manifest.json",
      "https://fledge.example/icon.svg",
      "https://fledge.example/icon-180.png",
      "https://fledge.example/icon-192.png",
      "https://fledge.example/icon-512.png",
      "https://fledge.example/assets/app.js",
      "https://fledge.example/assets/app.css",
    ]));
  });

  it("serves the previously cached app shell for offline navigation after first load", async () => {
    const harness = serviceWorkerHarness();
    runInNewContext(serviceWorkerSource, harness.context);
    const install = harness.listeners.get("install");
    let installPromise;
    install({ waitUntil: (promise) => { installPromise = promise; } });
    await installPromise;

    const fetch = harness.listeners.get("fetch");
    let responsePromise;
    harness.networkFetch.mockRejectedValue(new Error("offline"));
    harness.networkFetch.mockClear();
    fetch({
      request: { method: "GET", mode: "navigate", url: "https://fledge.example/invoices" },
      respondWith: (promise) => { responsePromise = promise; },
    });

    const response = await responsePromise;
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("app.js");
    expect(harness.networkFetch).not.toHaveBeenCalled();
  });

  it("does not intercept same-origin data requests", () => {
    const harness = serviceWorkerHarness();
    runInNewContext(serviceWorkerSource, harness.context);
    let intercepted = false;
    harness.listeners.get("fetch")({
      request: { method: "GET", mode: "cors", url: "https://fledge.example/api/customers" },
      respondWith: () => { intercepted = true; },
    });
    expect(intercepted).toBe(false);
  });

  it("checks release metadata online before falling back to a cached copy", async () => {
    const harness = serviceWorkerHarness();
    runInNewContext(serviceWorkerSource, harness.context);
    const fetch = harness.listeners.get("fetch");
    let responsePromise;
    fetch({
      request: { method: "GET", mode: "cors", url: "https://fledge.example/release-manifest.json" },
      respondWith: (promise) => { responsePromise = promise; },
    });

    const response = await responsePromise;
    expect(await response.text()).toContain("release-manifest.json");
    expect(harness.networkFetch).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://fledge.example/release-manifest.json" }),
    );
    expect([...harness.cached.keys()]).toContain("[object Object]");
  });

  it("does not turn a failed no-store release check into a stale successful response", async () => {
    const harness = serviceWorkerHarness();
    runInNewContext(serviceWorkerSource, harness.context);
    harness.networkFetch.mockRejectedValue(new Error("offline"));
    let responsePromise;
    harness.listeners.get("fetch")({
      request: {
        method: "GET",
        mode: "cors",
        cache: "no-store",
        url: "https://fledge.example/release-manifest.json",
      },
      respondWith: (promise) => { responsePromise = promise; },
    });

    await expect(responsePromise).rejects.toThrow("offline");
  });

  it("keeps the active version until the user activates an installed waiting worker", async () => {
    const harness = serviceWorkerHarness();
    runInNewContext(serviceWorkerSource, harness.context);
    harness.listeners.get("message")({ data: { type: "SKIP_WAITING" } });
    expect(harness.skipWaiting).toHaveBeenCalledOnce();
    harness.listeners.get("activate")({
      waitUntil: (promise) => { harness.activationPromise = promise; },
    });
    await harness.activationPromise;
    expect(harness.clientsClaim).toHaveBeenCalledOnce();
  });

  it("retains the previous complete shell cache for recovery", async () => {
    const harness = serviceWorkerHarness([
      "fledge-app-shell-old",
      "fledge-app-shell-previous",
      "fledge-app-shell-test-version",
    ]);
    runInNewContext(serviceWorkerSource, harness.context);
    let installPromise;
    harness.listeners.get("install")({ waitUntil: (promise) => { installPromise = promise; } });
    await installPromise;

    let activationPromise;
    harness.listeners.get("activate")({ waitUntil: (promise) => { activationPromise = promise; } });
    await activationPromise;

    expect(harness.cacheDelete).toHaveBeenCalledWith("fledge-app-shell-old");
    expect(harness.cacheDelete).not.toHaveBeenCalledWith("fledge-app-shell-previous");
  });
});

function serviceWorkerHarness(cacheNames = ["fledge-app-shell-test-version"]) {
  const listeners = new Map();
  const cached = new Map();
  const cache = {
    put: vi.fn(async (key, response) => cached.set(String(key), response)),
    match: async (key) => cached.get(String(key))?.clone(),
  };
  const networkFetch = vi.fn(async (request) => {
    const url = String(request.url ?? request);
    if (url === "https://fledge.example/") {
      return new Response(
        '<script src="/assets/app.js"></script><link href="/assets/app.css">',
        { status: 200 },
      );
    }
    return new Response(`asset:${url}`, { status: 200 });
  });
  const skipWaiting = vi.fn();
  const clientsClaim = vi.fn();
  const cacheDelete = vi.fn();
  const context = {
    URL,
    Response,
    fetch: networkFetch,
    self: {
      location: { origin: "https://fledge.example" },
      registration: { scope: "https://fledge.example/" },
      clients: { claim: clientsClaim },
      skipWaiting,
      addEventListener: (name, listener) => listeners.set(name, listener),
    },
    caches: {
      open: async () => cache,
      keys: async () => cacheNames,
      delete: cacheDelete,
      match: cache.match,
    },
  };
  return { context, listeners, cached, networkFetch, skipWaiting, clientsClaim, cacheDelete };
}
