import release from "./release-manifest.json";
import { DATABASE_VERSION } from "./indexed-db.js";

const RELEASE_MANIFEST_URL = "/release-manifest.json";
const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const HASH_PATTERN = /^[a-f\d]{64}$/i;
const VERIFIED_RELEASE = Symbol("verified release");

export async function registerPwaServiceWorker(serviceWorker = globalThis.navigator?.serviceWorker) {
  if (!serviceWorker) {
    return null;
  }
  return serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
}

export async function checkForPwaUpdate(registration, {
  fetcher = globalThis.fetch,
  currentRelease = release,
  databaseVersion = DATABASE_VERSION,
  platform = detectPlatform(),
  browser = detectBrowser(),
  origin = globalThis.location?.origin ?? "https://fledge.invalid",
  cryptoProvider = globalThis.crypto,
} = {}) {
  if (!registration || typeof registration.update !== "function") {
    throw new Error("Service-worker updates are not available in this browser.");
  }
  if (typeof fetcher !== "function") {
    throw new Error("Release metadata cannot be checked in this browser.");
  }

  const manifestUrl = new URL(RELEASE_MANIFEST_URL, origin);
  let response;
  try {
    response = await fetcher(manifestUrl, { cache: "no-store" });
  } catch (error) {
    throw new Error("Release information is unavailable. Try again when online.", { cause: error });
  }
  if (response.status === 404 || response.status === 503) {
    return { status: "unavailable" };
  }
  if (!response.ok) {
    throw new Error(`Release information could not be loaded (HTTP ${response.status}).`);
  }

  let latestRelease;
  try {
    latestRelease = await response.json();
  } catch (error) {
    throw new Error("Release information is not valid JSON.", { cause: error });
  }
  const validationError = validateReleaseManifest(latestRelease);
  if (validationError) return { status: "incompatible", reason: validationError };

  const compatibilityError = getCompatibilityError(
    latestRelease,
    currentRelease,
    databaseVersion,
    platform,
    browser,
  );
  if (compatibilityError) return { status: "incompatible", reason: compatibilityError };

  const comparison = compareVersions(latestRelease.version, currentRelease.version);
  if (comparison < 0) {
    return { status: "incompatible", reason: "The available release is older than the installed version." };
  }
  if (comparison === 0) {
    return { status: "current", release: latestRelease };
  }

  if (Object.values(latestRelease.support.minimumBrowserMajor).some((version) => version < 1)) {
    return {
      status: "incompatible",
      reason: "The release does not define minimum browser versions for the approved support policy.",
    };
  }
  if (!latestRelease.integrity.sha256) {
    return { status: "incompatible", reason: "The release does not include a service-worker integrity hash." };
  }
  if (latestRelease.integrity.artifacts.length === 0) {
    return { status: "incompatible", reason: "The release does not include application artifact integrity hashes." };
  }
  if (!isReleaseDate(latestRelease.releaseDate)) {
    return { status: "incompatible", reason: "The release date is missing or invalid." };
  }
  await verifyServiceWorkerIntegrity(latestRelease, fetcher, manifestUrl, cryptoProvider);
  await registration.update();
  Object.defineProperty(latestRelease, VERIFIED_RELEASE, { value: true });
  if (registration.waiting) {
    return { status: latestRelease.mandatory ? "mandatory" : "available", release: latestRelease };
  }
  if (registration.installing) return { status: "downloading", release: latestRelease };
  throw new Error("The browser did not find the verified service-worker update. Try again online.");
}

export function validateReleaseManifest(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return "Release metadata must be an object.";
  }
  if (!isVersion(candidate.version) || !isVersion(candidate.minimumSupportedVersion)) {
    return "Release metadata contains an invalid application version.";
  }
  if (
    (candidate.releaseDate !== null && !isReleaseDate(candidate.releaseDate)) ||
    candidate.architecture !== "web" ||
    typeof candidate.referenceUrl !== "string" ||
    !candidate.referenceUrl.startsWith("/") ||
    candidate.referenceUrl.startsWith("//")
  ) {
    return "Release metadata contains invalid distribution information.";
  }
  if (!Array.isArray(candidate.releaseNotes) || candidate.releaseNotes.some((note) => typeof note !== "string")) {
    return "Release metadata contains invalid release notes.";
  }
  if (
    !candidate.database ||
    !Number.isInteger(candidate.database.schemaVersion) ||
    !Array.isArray(candidate.database.compatibleSchemaVersions) ||
    candidate.database.compatibleSchemaVersions.some((version) => !Number.isInteger(version)) ||
    !candidate.database.compatibleSchemaVersions.includes(candidate.database.schemaVersion) ||
    !candidate.database.migration ||
    !Number.isInteger(candidate.database.migration.fromSchemaVersion) ||
    candidate.database.migration.toSchemaVersion !== candidate.database.schemaVersion ||
    !["none", "transactional"].includes(candidate.database.migration.strategy) ||
    typeof candidate.database.migration.failureRecovery !== "string" ||
    !candidate.database.migration.failureRecovery
  ) {
    return "Release metadata contains invalid database compatibility information.";
  }
  if (typeof candidate.gstRulesVersion !== "string" || !candidate.gstRulesVersion) {
    return "Release metadata is missing its GST rules version.";
  }
  if (
    !candidate.support ||
    !Array.isArray(candidate.support.operatingSystems) ||
    candidate.support.operatingSystems.some((platform) => typeof platform !== "string") ||
    !Array.isArray(candidate.support.browsers) ||
    candidate.support.browsers.some((browser) => typeof browser !== "string") ||
    !candidate.support.browsersByOperatingSystem ||
    candidate.support.operatingSystems.some((platform) =>
      !Array.isArray(candidate.support.browsersByOperatingSystem[platform]) ||
      candidate.support.browsersByOperatingSystem[platform].some((browser) => typeof browser !== "string"),
    ) ||
    candidate.support.browserVersionPolicy !== "latest-three-major-releases" ||
    !candidate.support.minimumBrowserMajor ||
    ["chrome", "edge", "firefox", "safari"].some(
      (browser) => !Number.isInteger(candidate.support.minimumBrowserMajor[browser])
        || candidate.support.minimumBrowserMajor[browser] < 0,
    )
  ) {
    return "Release metadata contains an unsupported browser support policy.";
  }
  if (
    !candidate.integrity ||
    candidate.integrity.serviceWorker !== "/sw.js" ||
    (candidate.integrity.sha256 !== null && !HASH_PATTERN.test(candidate.integrity.sha256)) ||
    !Array.isArray(candidate.integrity.artifacts) ||
    candidate.integrity.artifacts.some((artifact) =>
      !artifact ||
      typeof artifact.url !== "string" ||
      !artifact.url.startsWith("/") ||
      artifact.url.startsWith("//") ||
      !HASH_PATTERN.test(artifact.sha256),
    ) ||
    new Set(candidate.integrity.artifacts.map((artifact) => artifact.url)).size !== candidate.integrity.artifacts.length
  ) {
    return "Release metadata contains invalid service-worker integrity information.";
  }
  if (typeof candidate.mandatory !== "boolean") {
    return "Release metadata must specify whether the update is mandatory.";
  }
  return null;
}

export function detectPlatform(navigatorLike = globalThis.navigator) {
  const platform = navigatorLike?.userAgentData?.platform || navigatorLike?.platform || navigatorLike?.userAgent || "";
  const normalized = platform.toLowerCase();
  if (normalized.includes("android")) return "android";
  if (normalized.includes("iphone")) return "ios";
  if (normalized.includes("ipad") || (normalized.includes("mac") && navigatorLike?.maxTouchPoints > 1)) return "ipados";
  if (normalized.includes("mac")) return "macos";
  if (normalized.includes("win")) return "windows";
  return "unknown";
}

export function detectBrowser(navigatorLike = globalThis.navigator) {
  const userAgent = navigatorLike?.userAgent || "";
  const browser = userAgent.match(/Edg\/([\d.]+)/i)
    ? "edge"
    : userAgent.match(/Firefox\/([\d.]+)/i)
      ? "firefox"
      : userAgent.match(/(?:Chrome|Chromium)\/([\d.]+)/i)
        ? "chrome"
        : userAgent.match(/Version\/([\d.]+).*Safari/i)
          ? "safari"
          : "unknown";
  const versionPattern = {
    chrome: /(?:Chrome|Chromium)\/(\d+)/i,
    edge: /Edg\/(\d+)/i,
    firefox: /Firefox\/(\d+)/i,
    safari: /Version\/(\d+)/i,
  }[browser];
  const majorVersion = versionPattern ? Number(userAgent.match(versionPattern)?.[1]) : 0;
  return { name: browser, majorVersion };
}

export function applyPwaUpdate(registration, verifiedRelease) {
  if (verifiedRelease?.[VERIFIED_RELEASE] !== true || validateReleaseManifest(verifiedRelease)) {
    throw new Error("A verified compatible release is required before installation.");
  }
  const waiting = registration?.waiting;
  if (!waiting) {
    throw new Error("There is no downloaded update ready to install.");
  }
  waiting.postMessage({ type: "SKIP_WAITING" });
}

export function watchPwaRegistration(registration, onStatus) {
  const handleUpdateFound = () => {
    const installing = registration.installing;
    if (!installing) return;
    onStatus("downloading");
    installing.addEventListener("statechange", () => {
      if (installing.state === "installed" && registration.waiting) {
        onStatus("unverified");
      } else if (installing.state === "redundant") {
        onStatus("failed");
      }
    });
  };
  registration.addEventListener("updatefound", handleUpdateFound);
  if (registration.waiting) onStatus("unverified");
  return () => registration.removeEventListener("updatefound", handleUpdateFound);
}

function getCompatibilityError(candidate, currentRelease, databaseVersion, platform, browser) {
  if (!isVersion(currentRelease.version) || !isVersion(currentRelease.minimumSupportedVersion)) {
    return "The installed application has invalid version metadata.";
  }
  if (compareVersions(currentRelease.version, candidate.minimumSupportedVersion) < 0) {
    return "This release requires a newer installed application before it can be updated.";
  }
  if (compareVersions(candidate.version, candidate.minimumSupportedVersion) < 0) {
    return "The release minimum supported version is newer than the release itself.";
  }
  if (!candidate.database.compatibleSchemaVersions.includes(databaseVersion)) {
    return `This release is not compatible with database schema ${databaseVersion}.`;
  }
  if (!candidate.support.operatingSystems.includes(platform)) {
    return `This release does not support the detected operating system (${platform}).`;
  }
  const platformBrowsers = candidate.support.browsersByOperatingSystem[platform] ?? [];
  if (!candidate.support.browsers.includes(browser.name) || !platformBrowsers.includes(browser.name)) {
    return `This release does not support the detected browser (${browser.name}).`;
  }
  const minimumMajor = candidate.support.minimumBrowserMajor[browser.name];
  if (!Number.isInteger(browser.majorVersion) || browser.majorVersion < minimumMajor) {
    return `This release requires ${browser.name} ${minimumMajor} or later.`;
  }
  return null;
}

async function verifyServiceWorkerIntegrity(candidate, fetcher, manifestUrl, cryptoProvider) {
  if (!cryptoProvider?.subtle?.digest) {
    throw new Error("Service-worker integrity cannot be verified in this browser.");
  }
  const workerUrl = new URL(candidate.integrity.serviceWorker, manifestUrl);
  if (workerUrl.origin !== manifestUrl.origin) {
    throw new Error("The release service worker must be hosted on the application origin.");
  }
  const response = await fetcher(workerUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`The release service worker could not be loaded (HTTP ${response.status}).`);
  }
  await verifyHash(response, candidate.integrity.sha256, cryptoProvider, "service worker");
  await Promise.all(candidate.integrity.artifacts.map(async (artifact) => {
    const artifactUrl = new URL(artifact.url, manifestUrl);
    if (artifactUrl.origin !== manifestUrl.origin || artifactUrl.pathname !== artifact.url) {
      throw new Error("Release artifacts must be hosted at safe paths on the application origin.");
    }
    const artifactResponse = await fetcher(artifactUrl, { cache: "no-store" });
    if (!artifactResponse.ok) {
      throw new Error(`A release artifact could not be loaded (HTTP ${artifactResponse.status}).`);
    }
    await verifyHash(artifactResponse, artifact.sha256, cryptoProvider, artifact.url);
  }));
}

async function verifyHash(response, expectedHash, cryptoProvider, label) {
  const bytes = await response.arrayBuffer();
  const digest = await cryptoProvider.subtle.digest("SHA-256", bytes);
  const actualHash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  if (actualHash !== expectedHash.toLowerCase()) {
    throw new Error(`The downloaded ${label} does not match the release integrity hash.`);
  }
}

function isVersion(value) {
  return typeof value === "string" && VERSION_PATTERN.test(value);
}

function isReleaseDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && isRealReleaseDate(value);
}

function isRealReleaseDate(value) {
  const parsedDate = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === value;
}

function compareVersions(left, right) {
  const [, leftMajor, leftMinor, leftPatch, leftPre] = left.match(VERSION_PATTERN);
  const [, rightMajor, rightMinor, rightPatch, rightPre] = right.match(VERSION_PATTERN);
  for (const [a, b] of [[leftMajor, rightMajor], [leftMinor, rightMinor], [leftPatch, rightPatch]]) {
    if (Number(a) !== Number(b)) return Number(a) > Number(b) ? 1 : -1;
  }
  if (leftPre === rightPre) return 0;
  if (leftPre === undefined) return 1;
  if (rightPre === undefined) return -1;
  const leftIdentifiers = leftPre.split(".");
  const rightIdentifiers = rightPre.split(".");
  for (let index = 0; index < Math.max(leftIdentifiers.length, rightIdentifiers.length); index += 1) {
    const leftIdentifier = leftIdentifiers[index];
    const rightIdentifier = rightIdentifiers[index];
    if (leftIdentifier === undefined) return -1;
    if (rightIdentifier === undefined) return 1;
    if (leftIdentifier === rightIdentifier) continue;

    const leftNumeric = /^\d+$/.test(leftIdentifier);
    const rightNumeric = /^\d+$/.test(rightIdentifier);
    if (leftNumeric && rightNumeric) {
      if (leftIdentifier.length !== rightIdentifier.length) {
        return leftIdentifier.length > rightIdentifier.length ? 1 : -1;
      }
      return leftIdentifier > rightIdentifier ? 1 : -1;
    }
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    return leftIdentifier > rightIdentifier ? 1 : -1;
  }
  return 0;
}
