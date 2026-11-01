# M10 — PWA lifecycle and release contract

This implementation provides an installable web-app shell, offline entry-point
behavior, and a user-controlled update flow. Production distribution is not
enabled: the current version remains `0.0.0-dev`, and deployment of the
same-origin release endpoint is deferred until the product is complete.

## Install and first load

The root-scoped manifest includes SVG and PNG app icons. The PNG variants
include 192×192 and 512×512 install icons and a 180×180 Apple touch icon.
Service workers require a secure context (HTTPS in deployment; localhost for
development).

On successful installation, the service worker caches the application shell,
entry JavaScript/CSS, manifest, and icons. It does not intercept API or business
data requests. Previously loaded shell assets remain available offline after
the first successful online load. First-load offline use is unsupported;
lazy-loaded assets become available offline only after they have been fetched
online. Local IndexedDB remains the source of business records.

The worker retains the previous complete shell cache across an activation to
support already-open clients and basic offline recovery. It does not roll back
application code automatically after activation. No database migration is
included; updates are rejected unless the release metadata explicitly lists
the installed IndexedDB schema as compatible. A future schema-changing update
requires migration-specific backup, recovery, and real-browser tests.

## Update and release contract

The **Application & updates** screen shows the installed app, GST rules, and
IndexedDB schema versions. It presents current, available, downloading,
mandatory, unavailable, incompatible, failed, and unverified-worker states.
A waiting worker cannot be activated until a release check succeeds.

`src/release-manifest.json` is the development descriptor; the matching
`public/release-manifest.json` makes that descriptor available in development.
The production build emits a versioned worker and replaces the development
descriptor's checksum list with SHA-256 digests for the worker, app shell, and
versioned JavaScript/CSS assets. Before requesting browser installation, the
client validates release metadata, app-version ordering and minimum version,
browser/OS support, browser-major floor, database schema compatibility, and
the fetched worker and artifact hashes. A current release check does not
activate an unversioned worker: every deployable release must increment its
semantic version.

The release manifest is unsigned. Same-origin HTTPS and checksums detect
inconsistent or corrupted artifacts when the release metadata is trusted;
they do not protect against a compromised hosting origin. Production hosting
and signing ownership must be decided before a public release. The deployment
must publish the release manifest, worker, HTML, and its referenced hashed
assets atomically. Do not publish a release manifest before all referenced
files are available.

Every release must provide a real release date, minimum supported application
version, schema/migration compatibility, release notes, and minimum browser
major versions. The current development descriptor intentionally has no
release date, checksum list, or browser-major floors. It must not be used as a
production release descriptor. For a release, set each browser floor to the
oldest of the latest three major releases at release time.

`mandatory` marks the release and changes the update message; it does not
block access to the local-first application. Update activation remains a
foreground, explicit user action. A failed or incompatible check leaves the
active worker and IndexedDB data untouched.

## Browser and OS support policy

The approved evergreen policy covers the current and previous two major
releases of Chrome, Edge, Firefox, and Safari. The supported browser/OS pairs
are:

| OS target | Supported browsers | PWA installation path |
|---|---|---|
| Windows | Chrome, Edge, Firefox | Chrome or Edge |
| Android | Chrome, Edge, Firefox | Browser-provided install/add-to-home flow |
| iOS | Safari | Safari “Add to Home Screen” |
| iPadOS | Safari | Safari “Add to Home Screen” |
| macOS | Chrome, Edge, Firefox, Safari | Chrome, Edge, or Safari “Add to Dock” |

Firefox on Windows/macOS is a supported browser target, but native standalone
installation is not promised there. Other iOS/iPadOS browsers are outside this
matrix. Minimum OS versions are not encoded in the development descriptor.

## Verification and release gates

Automated tests cover release metadata validation, downgrade and minimum
version rejection, browser/OS and database compatibility, SHA-256 mismatch,
mandatory/current/available/unavailable/failed update paths, controlled
activation, offline shell behavior, data-request exclusion, and retention of
the previous complete shell cache. The production build generates and embeds
the release artifact hashes.

No real browser, device, installation, offline, update, or recovery verification
has been performed in this workspace. Before M10 can be declared release-ready,
run the install, offline, available/mandatory update, failed update, and
preserved-data checks on every browser/OS pair above and record the minimum OS
versions and test results. Product completion must also resolve hosting and
signing ownership. Until then, M10 implementation is present but release
verification remains open.
