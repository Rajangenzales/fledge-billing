# Fledge Billing — W1 Browser Compatibility & Repository Contract Audit

**Status:** Audit complete; implementation boundary approved for the next reviewed slice  
**Baseline:** `main` at W0 merge commit `d9ad57ada37dbf38bceed58a9593ec875d3219a4`  
**Scope:** Browser-safety and persistence-contract audit only. No IndexedDB schema or adapter is introduced here.

## 1. Executive result

The existing domain layer is the strongest browser-reuse candidate. The application layer contains reusable business use cases, but its package-root export is not a safe browser entry point. The persistence layer is explicitly Node/SQLite-specific and must remain isolated from the browser bundle.

A more important incompatibility was found in the repository contracts: application repository methods and the current SQLite adapter are synchronous, while IndexedDB operations are asynchronous. An IndexedDB adapter cannot honestly implement the current interfaces without blocking, caching stale data, or changing semantics. None of those workarounds is acceptable for financial workflows.

**Decision:** before building the IndexedDB adapter, introduce explicit asynchronous application repository contracts and migrate use cases in controlled slices. Keep the existing SQLite implementation working through a compatibility adapter. Do not select an IndexedDB wrapper or create browser database schema until the async contract and transaction boundaries are designed.

## 2. Package compatibility findings

| Package / surface | Finding | Browser decision |
| --- | --- | --- |
| `@fledge/domain` | Domain entry exports money, GST, validation, template, preview and print-formatting logic. The inspected domain source has no Node built-in dependency. | Reusable in browser after the web build verifies the complete transitive graph. Keep UI and storage concerns out. |
| `@fledge/application` root entry | The barrel exports business use cases alongside Node file export, filesystem/path operations, process-based configuration and PDF modules. A root import exposes a mixed dependency graph. | Do not import `@fledge/application` root from `packages/web`. Create a deliberate browser-safe entry point or subpath when the application contract is ready. |
| `@fledge/application` use cases | Business profile, customer, product, document, template, receipt, allocation, adjustment and activity use cases depend on injected repository interfaces rather than importing SQLite directly. This is a good separation. | Reuse the business rules, but migrate repository interfaces and use cases to asynchronous contracts before IndexedDB integration. |
| `@fledge/application/export.ts` and `customer-receipt-export.ts` | Use `node:fs` and `node:path` for local file creation. | Node-only. Keep outside browser entry. A browser download/print adapter is a separate future concern. |
| `@fledge/application/config.ts` | Reads `process.env` and uses the NodeJS process environment type. | Node-only. Keep outside browser entry. |
| `@fledge/application/pdf.ts` and receipt PDF module | Build PDF bytes with `pdf-lib`; they are not the same as the Node filesystem exporters. Browser compatibility has not yet been verified in the actual Vite production bundle. | Treat as unverified. Do not include in the first browser entry until a targeted browser build and PDF test confirms it. |
| `@fledge/persistence` | Connection layer imports `node:fs`, `node:path` and `node:sqlite`. Repository implementations are built around the synchronous SQLite statement abstraction. | Node-only. Do not import from the browser. Preserve the existing package and migrations. |
| `@fledge/app` | Node CLI and local HTTP health shell. | Remains the Node entry point. Do not merge browser runtime responsibilities into it. |
| `@fledge/web` | React/Vite static shell with placeholder navigation. | Browser presentation only at W0. No business repository is wired yet. |

## 3. Repository contract audit

### 3.1 Current shape

Application use cases receive dependency objects containing repository interfaces. The interfaces expose synchronous methods such as `get`, `list`, `insert`, `update`, `replaceDraft`, `finalize`, and `save`. The SQLite adapter satisfies this model through synchronous `DatabaseSync` statements.

This works for the existing Node process, but it is not a valid direct fit for IndexedDB.

### 3.2 Required async transition

IndexedDB reads and writes complete asynchronously. Application contracts must therefore represent asynchronous work explicitly, for example:

- `get(...): Promise<T | null>`
- `list(...): Promise<T[]>`
- `insert(...): Promise<void>`
- `update(...): Promise<void>`

The exact signatures must be designed per repository, not mechanically rewritten. Pure domain calculations and validation can remain synchronous.

The transition must be incremental:
1. Define the asynchronous repository contracts and transaction abstraction.
2. Convert one application vertical slice and its tests to await repository operations.
3. Adapt the existing SQLite implementation to the asynchronous contract without changing its data semantics or migration history.
4. Verify current CLI workflows and existing tests remain correct.
5. Only then implement the matching IndexedDB repository.

Do not create a fake synchronous IndexedDB facade, pre-load the entire database into memory to imitate synchronous reads, or hide unawaited writes.

### 3.3 Transaction boundary requirements

The future browser adapter must support atomic multi-record operations where a use case requires them. In particular:

- Invoice finalization and number-series advancement must commit together.
- Receipt recording and idempotency enforcement must be atomic.
- Receipt allocation/release and derived settlement reads must preserve current validation and business scoping.
- Refund/reversal event writes must remain append-only and atomic with their guards.
- Draft replacement must not mutate finalized documents.
- Business/customer ownership checks must occur within the same transaction boundary as the write where necessary.

The transaction abstraction must not leak IndexedDB-specific request or transaction objects into domain code. It must make transaction lifetime explicit so an IndexedDB transaction is not accidentally allowed to become inactive while unrelated asynchronous work runs.

## 4. Money and serialization

The domain uses exact INR money values and includes `bigint` in its money representation / SQL value boundary. IndexedDB structured cloning supports structured values, but any JSON-based export, backup, diagnostics or interchange format must serialize integer minor units as decimal strings with an explicit schema/version. Never pass financial `bigint` values through ordinary `JSON.stringify` without a defined codec, and never convert paise to floating-point numbers.

Persist exact minor units. Keep formatting as a presentation concern. Add round-trip tests for maximum supported values, zero, negative adjustment values where allowed, and serialization version changes before backup/import work.

## 5. Database and migration implications

- Existing SQLite migrations 1–12 remain authoritative for the Node adapter and must not be rewritten or discarded.
- IndexedDB requires its own explicit, versioned object-store/index upgrade plan. Do not copy SQLite migration SQL or assume SQLite transaction semantics map directly to IndexedDB.
- Browser upgrade handling must cover fresh install, sequential upgrade, interrupted/blocked upgrade, another open tab holding an older connection, and preservation of existing records.
- Do not silently import or overwrite an existing SQLite database. Any future migration/import is a separately designed, user-visible operation with validation and recovery.
- No IndexedDB object stores, indexes or browser migration code are created in W1.

## 6. Browser dependency boundary

The web package must import only:
- `@fledge/domain` browser-safe exports.
- An explicitly curated asynchronous application entry point after it exists.
- Browser-specific adapters owned by the web/browser persistence layer.

It must not import:
- `@fledge/persistence` or `node:sqlite`.
- Node filesystem/path exporters.
- `process.env`-based configuration.
- Node CLI/server modules.
- A package-root barrel that transitively exports the above modules.

PDF byte generation remains unverified for browser bundling and is excluded from the initial browser boundary pending a targeted test.

## 7. IndexedDB wrapper decision

**No wrapper selected in W1.** The decision is deferred until the asynchronous contract and transaction abstraction are defined. Evaluate native IndexedDB and candidate wrappers against:
- Atomic transaction behaviour across the required repositories.
- Schema upgrade and blocked-upgrade handling.
- Clear transaction lifetime semantics.
- TypeScript support and testability.
- Bundle size and long-term maintenance.
- Ability to preserve append-only event and idempotency invariants.

Do not let a wrapper's API leak into domain or application contracts.

## 8. Recommended next implementation slices

### W1A — Async repository contract design
Document the transaction abstraction and async contracts for business profile, customer, product, document, template, receipt, allocation, adjustment and customer activity repositories. Identify multi-repository atomic use cases and the compatibility strategy for SQLite.

### W1B — First async application vertical slice
Convert business profile and customer use cases to async contracts, adapt SQLite, and add tests for awaited reads/writes, validation failures and transaction rollback. Keep the browser shell unchanged.

### W1C — Browser-safe application entry
Expose only verified browser-safe application modules through an explicit package subpath. Add a Vite production-build guard proving Node built-ins and server-only modules are absent from the browser dependency graph.

### W2 — IndexedDB foundation
Only after W1A–W1C are reviewed and merged, select the IndexedDB implementation and build a versioned adapter for the approved first vertical slice.

## 9. Explicit non-goals

This audit does not implement IndexedDB, offline billing, service workers, a manifest, account authentication, cloud sync/backup, subscription services, a PDF download flow, or a customer-facing business workflow. It does not alter GST rules, SQLite schema, migrations or finalized-document behaviour.

## 10. Acceptance checklist

- [x] Identify Node-only modules in the current application/persistence package surfaces.
- [x] Confirm the current application use cases are injected with repository interfaces.
- [x] Identify the synchronous repository versus asynchronous IndexedDB incompatibility.
- [x] Record transaction, idempotency, exact-money and migration constraints.
- [x] Defer IndexedDB wrapper and schema selection until async contracts are designed.
- [ ] Review and merge this W1 audit.
- [ ] Implement and verify W1A async repository contract design.
