const CACHE_PREFIX = "fledge-app-shell-";
const BUILD_VERSION = "__FLEDGE_BUILD_VERSION__";
const CACHE_NAME = `${CACHE_PREFIX}${BUILD_VERSION}`;
const SHELL_URL = new URL("./", self.registration.scope).href;
const MANIFEST_URL = new URL("manifest.webmanifest", self.registration.scope).href;
const RELEASE_MANIFEST_URL = new URL("release-manifest.json", self.registration.scope).href;
const ICON_URL = new URL("icon.svg", self.registration.scope).href;
const ICON_180_URL = new URL("icon-180.png", self.registration.scope).href;
const ICON_192_URL = new URL("icon-192.png", self.registration.scope).href;
const ICON_512_URL = new URL("icon-512.png", self.registration.scope).href;

self.addEventListener("install", (event) => {
  event.waitUntil(cacheApplicationShell());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    const previousCaches = cacheNames.filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME);
    const completePreviousCaches = [];
    for (const name of previousCaches) {
      const cache = await caches.open(name);
      if (await cache.match(SHELL_URL)) completePreviousCaches.push(name);
    }
    const retainedCache = completePreviousCaches.at(-1);
    await Promise.all(previousCaches
      .filter((name) => name !== retainedCache)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const requestUrl = new URL(request.url);
  if (request.method !== "GET" || requestUrl.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      const currentCache = await caches.open(CACHE_NAME);
      const cached = await currentCache.match(SHELL_URL);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok) {
          await currentCache.put(SHELL_URL, response.clone());
        }
        return response;
      } catch {
        const cached = await findPreviousCachedResponse(SHELL_URL);
        if (cached) return cached;
        return new Response("Fledge Billing is unavailable offline until it has been opened online once.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }
    })());
    return;
  }

  const assetDirectory = new URL("assets/", self.registration.scope).pathname;
  const manifestPath = new URL("manifest.webmanifest", self.registration.scope).pathname;
  const releaseManifestPath = new URL("release-manifest.json", self.registration.scope).pathname;
  const iconPath = new URL("icon.svg", self.registration.scope).pathname;
  const iconPngPaths = ["/icon-180.png", "/icon-192.png", "/icon-512.png"];
  if (requestUrl.pathname === releaseManifestPath) {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        }
        return response;
      } catch (error) {
        if (request.cache === "no-store") throw error;
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(request) ?? await findPreviousCachedResponse(request);
        if (cached) return cached;
        throw error;
      }
    })());
    return;
  }
  if (
    !requestUrl.pathname.startsWith(assetDirectory) &&
    requestUrl.pathname !== manifestPath &&
    requestUrl.pathname !== releaseManifestPath &&
    requestUrl.pathname !== iconPath &&
    !iconPngPaths.includes(requestUrl.pathname)
  ) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    } catch (error) {
      const previous = await findPreviousCachedResponse(request);
      if (previous) return previous;
      throw error;
    }
  })());
});

async function findPreviousCachedResponse(request) {
  const cacheNames = await caches.keys();
  for (const name of cacheNames.reverse()) {
    if (!name.startsWith(CACHE_PREFIX) || name === CACHE_NAME) continue;
    const response = await (await caches.open(name)).match(request);
    if (response) return response;
  }
  return null;
}

async function cacheApplicationShell() {
  const cache = await caches.open(CACHE_NAME);
  const shellResponse = await fetch(SHELL_URL, { cache: "reload" });
  if (!shellResponse.ok) throw new Error("The application shell could not be cached.");
  const shell = await shellResponse.clone().text();
  await cache.put(SHELL_URL, shellResponse);

  const assets = [...shell.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)]
    .map((match) => new URL(match[1], SHELL_URL).href);
  for (const asset of [
    MANIFEST_URL,
    RELEASE_MANIFEST_URL,
    ICON_URL,
    ICON_180_URL,
    ICON_192_URL,
    ICON_512_URL,
    ...assets,
  ]) {
    const response = await fetch(asset, { cache: "reload" });
    if (!response.ok) throw new Error(`An application asset could not be cached: ${asset}`);
    await cache.put(asset, response);
  }
}
