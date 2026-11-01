# Fledge Billing — PWA Frontend Foundation Plan

**Status:** Approved direction; W0 browser shell implemented in PR (pending merge)  
**Scope:** First customer-facing browser application foundation  
**Depends on:** docs/01–03, docs/08–11 and the existing domain/application/persistence packages

## 1. Current repository facts

The current repository is a TypeScript pnpm monorepo. The `@fledge/app` package is a Node.js CLI and local HTTP health shell. Its HTTP server currently exposes only `/` and `/health`; it does not serve a browser UI.

The existing SQLite adapter uses Node.js 22 `node:sqlite` and is isolated in `@fledge/persistence`. The current package scripts build, typecheck and test the monorepo. No browser UI framework, bundler, service worker, web manifest or IndexedDB adapter is currently present in the inspected baseline.

The domain/application separation and repository interfaces are reusable architectural foundations, but browser compatibility of every transitive import and application dependency must be audited before bundling them into a browser application. The existing Node SQLite adapter cannot be imported into an ordinary browser runtime.

## 2. Product constraints

The first browser experience must preserve these approved constraints:

- Responsive application for desktop, tablet and mobile.
- Local-first business data; routine billing must not require network access.
- IndexedDB is the approved browser persistence technology.
- Do not use `localStorage` for structured business records.
- Keep domain calculations, GST rules and exact INR arithmetic outside presentation components.
- Preserve finalized-document immutability, payment event history and existing SQLite migration history.
- No cloud upload or synchronization in local-only mode.
- Backup and synchronization remain separate, optional capabilities.
- Do not claim PWA/offline readiness until service-worker, storage, restart and offline workflow tests pass.
- Do not implement authentication, subscriptions, Admin Control Centre or cloud services as part of the first UI-shell slice.

## 3. Proposed implementation direction

The following W0 stack and package boundary are approved:

1. Add a dedicated browser package, preferably `packages/web`, rather than turning the Node CLI package into a mixed Node/browser runtime.
2. Use React with Vite for the responsive browser UI and production asset build.
3. Keep browser-specific code in the web package. Import only browser-safe domain/application modules.
4. Define browser repository adapters against the existing application repository contracts. Use IndexedDB as the backing store.
5. Select an IndexedDB wrapper only after checking transaction semantics, schema migration support, bundle size, maintenance and testability. Do not let a wrapper's API leak into domain/application packages.
6. Add a web app manifest and service worker in a later, separately testable slice after the browser shell and local persistence boundaries are stable.

React + Vite is the approved browser stack because it is a conventional, well-supported TypeScript browser stack with a straightforward static build and no need to replace the existing Node application. The IndexedDB adapter remains undecided pending the W1 repository and transaction audit.

## 4. W0 implementation record

The product owner approved React + Vite and the dedicated `packages/web` boundary. The W0 branch adds:

- A React 19 + Vite browser package with a responsive Fledge Billing shell.
- A simple overview screen and clearly marked placeholder navigation for unfinished areas.
- Local-mode messaging that does not claim business data persistence or synchronization.
- Root `web:dev` and `web:build` commands and pnpm workspace lockfile entries.
- No service worker, manifest, IndexedDB, business-data writes, authentication, analytics, cloud requests or SQLite changes.

The shell uses system fonts and local assets only. It does not fetch remote fonts or images. The browser UI is a presentation foundation, not a usable billing workflow or completed PWA. Runtime/build/typecheck tests must be confirmed by CI before merge; no local test execution is claimed in this environment.

## 5. Alternatives considered

| Option | Advantages | Trade-offs | Position |
| --- | --- | --- | --- |
| React + Vite | Mature ecosystem, broad hiring/tooling familiarity, static assets, clear package boundary | Adds UI framework and build tooling; PWA lifecycle still needs deliberate implementation | Recommended |
| Svelte + Vite | Smaller component model and straightforward responsive UI | Smaller ecosystem and fewer shared implementation conventions across the team | Viable alternative |
| Next.js | Integrated routing and server-rendering options | Server-oriented capabilities add complexity for a local-first app whose routine billing must run entirely in the browser | Not recommended for the first local-first shell |
| Keep extending Node HTTP shell | Minimal new dependencies | Couples browser delivery to Node server and does not provide a true installable/offline browser application | Not suitable as the target PWA |

## 6. Dependency and package boundary

Proposed package responsibilities:

- `@fledge/domain`: pure billing, GST, money and domain rules; no browser or UI dependencies.
- `@fledge/application`: use cases and repository contracts; must remain independent of UI framework and concrete storage.
- `@fledge/persistence`: existing Node SQLite implementation; preserve it and its migration history.
- `@fledge/web` (proposed): browser entry point, components, routing, presentation state, browser capability adapters and web build.
- A future browser persistence package may be separated from `@fledge/web` if the IndexedDB adapter becomes large or is shared by more than one browser entry point.

The browser must not import Node built-ins, `node:sqlite`, filesystem APIs or server-only configuration. A browser dependency audit is a mandatory gate before wiring application use cases into the UI.

## 7. Recommended delivery slices

### W0 — Browser package and static shell

- Confirm React/Vite and package naming with the product owner.
- Add the dedicated browser package and strict TypeScript/build configuration.
- Render a responsive Fledge Billing shell with navigation placeholders and a clear local-only status.
- Add no customer/business data writes and no fake billing actions.
- Keep the existing CLI, HTTP health endpoint and SQLite persistence unchanged.
- Add build/typecheck smoke coverage and document how to run the browser shell locally.

### W1 — Browser compatibility and repository contract audit

- Identify browser-safe exports from domain and application.
- Remove or isolate any transitive Node-only imports before browser bundling.
- Map each required application repository interface to a browser persistence implementation.
- Define IndexedDB database versioning, upgrade failure handling, transaction boundaries and recovery behaviour.
- Confirm exact-money serialization; do not persist JavaScript `bigint` values through lossy JSON conversion.

### W2 — IndexedDB foundation

- Implement a versioned IndexedDB adapter for one approved vertical slice first.
- Preserve business scoping, stable IDs, idempotency and transaction invariants.
- Add fresh-database, upgrade, interrupted-upgrade, duplicate-retry and data-preservation tests.
- Do not silently import or overwrite the existing SQLite database.

### W3 — First usable local workflow

- Select one end-to-end workflow only after W1/W2 contracts are verified.
- Recommended candidate: business profile and customer management before invoice creation.
- Add loading, validation, empty, error and success states.
- Ensure the workflow persists locally and survives browser refresh/restart.

### W4 — PWA lifecycle

- Add manifest, icons, service worker and versioned asset caching.
- Provide safe update notification and activation that does not discard unsaved work.
- Test first online load followed by offline reopen, browser restart and update.
- Add clear storage durability and backup warnings; browser storage is not an indestructible backup.

## 8. Security and privacy boundaries

- The first local-only shell must not transmit business or customer data.
- Do not add analytics collection, account registration, authentication, payment gateway or remote admin APIs in W0.
- Do not place secrets or private credentials in browser bundles.
- Browser storage protection and account security require separate design and review before public deployment.
- Never treat hidden UI controls as authorization. Server-side authorization is required for any future remote service.

## 9. Acceptance criteria for W0

- A separate browser package builds without importing Node-only modules.
- The existing `@fledge/app` CLI and `/health` endpoint remain unchanged.
- The browser shell is responsive at phone, tablet and desktop widths.
- Navigation is honest: unfinished features are visibly unavailable and do not pretend to save data.
- No business/customer records are written to `localStorage` or uploaded.
- Root build and typecheck include the new package.
- Tests cover the browser entry/build smoke path and any interactive navigation behaviour.
- Documentation distinguishes a browser shell from a completed PWA or offline billing product.

## 10. Decisions required before implementation

The product owner has confirmed React + Vite and `packages/web`. The IndexedDB adapter decision remains open and must be made during W1 after repository contract and transaction requirements are audited. Do not create a browser persistence schema before that audit.
