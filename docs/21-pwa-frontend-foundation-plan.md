# Fledge Billing — PWA Frontend Foundation Plan

**Status:** W0–W1G merged (PRs #35–43); W1H audit and verification complete; W2/W3 IndexedDB business, customer, product and saved-rate slices implemented
**Scope:** First customer-facing browser application foundation  
**Depends on:** docs/01–03, docs/08–11 and the existing domain/application/persistence packages

## 1. Current repository facts

The current repository is a TypeScript pnpm monorepo. The `@fledge/app` package is a Node.js CLI and local HTTP health shell. Its HTTP server currently exposes only `/` and `/health`; it does not serve a browser UI.

The existing SQLite adapter uses Node.js 22 `node:sqlite` and is isolated in `@fledge/persistence`. The current package scripts build, typecheck and test the monorepo. React/Vite is present in `packages/web`; the shell opens a versioned IndexedDB database and supports local business-profile, customer, product and saved-rate workflows. No service worker or installable PWA lifecycle is present.

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
4. Define asynchronous application repository contracts and explicit transaction boundaries before implementing a browser repository adapter. Use IndexedDB as the backing store only after the async contract is reviewed.
5. Select an IndexedDB wrapper only after checking transaction semantics, schema migration support, bundle size, maintenance and testability. Do not let a wrapper's API leak into domain/application packages.
6. Add a web app manifest and service worker in a later, separately testable slice after the browser shell and local persistence boundaries are stable.

React + Vite is the approved browser stack because it is a conventional, well-supported TypeScript browser stack with a straightforward static build and no need to replace the existing Node application. The W1 audit found that current application repository methods are synchronous, while IndexedDB is asynchronous. The IndexedDB wrapper and schema remain undecided until asynchronous contracts and transaction boundaries are designed.

## 4. W0 implementation record

The product owner approved React + Vite and the dedicated `packages/web` boundary. PR #35 merged the following W0 foundation:

- A React 19 + Vite browser package with a responsive Fledge Billing shell.
- A simple overview screen and clearly marked placeholder navigation for unfinished areas.
- Local-mode messaging that does not claim business data persistence or synchronization.
- Root `web:dev` and `web:build` commands and pnpm workspace lockfile entries.
- A server-rendered smoke test for the overview shell, included in the existing Vitest suite.
- No service worker, manifest, IndexedDB, business-data writes, authentication, analytics, cloud requests or SQLite changes.

The shell uses system fonts and local assets only. It does not fetch remote fonts or images. The browser UI is a presentation foundation, not a usable billing workflow or completed PWA. The PR was merged. No local test/build execution is claimed in this environment; no successful CI result was independently verified during this audit.

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

- Audit browser-safe exports and isolate Node-only package entry points.
- Identify and document current repository contracts and transaction boundaries.
- Resolve the synchronous application repository versus asynchronous IndexedDB mismatch by designing explicit asynchronous contracts.
- Define a SQLite compatibility migration path that preserves current CLI behaviour and SQLite migrations.
- Define IndexedDB database versioning, upgrade failure handling, transaction boundaries and recovery behaviour after the async contract is approved.
- Confirm exact-money serialization; never pass financial `bigint` values through lossy JSON conversion.

### W1 audit outcome

The completed audit is recorded in [docs/22](./22-w1-browser-compatibility-and-repository-audit.md). The domain layer is the browser-reuse candidate; the application root barrel is mixed with Node-only exports; persistence is Node/SQLite-only. Most importantly, current repository interfaces are synchronous and cannot be implemented directly with IndexedDB.

W1A is documented in [docs/23](./23-w1a-async-repository-and-transaction-contract.md). W1B–W1G migrated the business/customer, product, document, template and payment repositories. W1H is complete: application callers are audited, the production browser guard passes, payment activity uses a single adapter-neutral snapshot read, and the browser exports a safe receipt render/print-lines model without PDF code. See [docs/29](./29-w1h-final-async-boundary-audit.md).

### W2 — IndexedDB foundation

The W2 browser slices are documented in [docs/30](./30-w2-indexeddb-foundation-and-local-setup.md). They use native IndexedDB without a wrapper for business profiles, customers, products and saved GST rates. Document, template and payment repositories remain gated behind their own vertical slices.

- Preserve business scoping, stable IDs and transaction invariants.
- Resolve writes only after the IndexedDB transaction completes; reject aborted/error transactions.
- Keep SQLite and migrations 1–12 unchanged. No automatic import or overwrite is performed.
- Add fresh-database, reopen/persistence, ownership, failure and later-version upgrade tests as the schema evolves.

### W3 — First usable local workflow

The initial business-profile and customer workflow is implemented in `packages/web`: it has loading/error/empty/success states, domain validation, business scoping, local persistence and a persistence-on-reopen test. Invoice, product and payment workflows are not connected yet.

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

## 10. Current boundary and next decision

The product owner approved React + Vite, `packages/web` and IndexedDB. W1H is complete. The first IndexedDB slice uses native APIs; it does not select a reusable wrapper or implement invoice/payment stores. Extend the adapter only through focused vertical slices that preserve the atomicity contracts in docs/23 and the payment activity snapshot contract in docs/29. The service worker, manifest, offline first-load lifecycle, backup and sync remain future work.
