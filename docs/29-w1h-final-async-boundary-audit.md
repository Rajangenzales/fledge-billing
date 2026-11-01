# W1H — Final Async Application and Browser-Boundary Audit

**Status:** Complete; **Baseline:** `main` after PR #44, with W1H verification completed 1 November 2026
**Purpose:** Verify the asynchronous application/browser boundary and close the payment activity consistency and receipt-render decisions before the first IndexedDB vertical slice.

## 1. Static audit findings

The eight application repository contracts are Promise-based:

| Repository | Async contract | Migration |
| --- | --- | --- |
| BusinessRepository | `get`, `save` return Promises | W1B / PR #38 |
| CustomerRepository | business lookup, list/get, insert/update return Promises | W1B / PR #38 |
| ProductRepository | product, tax-category and saved-rate methods return Promises | W1D / PR #40 |
| DocumentRepository | document reads/writes, finalization, cancellation and numbering methods return Promises | W1E / PR #41 |
| TemplateRepository | template reads, built-in setup, defaults and revisions return Promises | W1F / PR #42 |
| CustomerReceiptRepository | receipt insert/list/lookup and advance aggregates return Promises | W1G / PR #43 |
| AllocationRepository | allocation/release, event reads and settlement aggregates return Promises | W1G / PR #43 |
| PaymentAdjustmentRepository | refund/reversal writes, event reads and adjustment totals return Promises | W1G / PR #43 |

The curated `@fledge/application/browser` entry includes business, customer, product, document, template, preview, receipt, allocation, adjustment and customer-payment-activity workflows. It also exposes `renderCustomerReceipt` and `customerReceiptPrintLines`; it does not expose the Node PDF builder/exporter. The retained Vite contract entry imports that surface, and the Vite production guard checks required exports, Node built-in imports and Node runtime globals.

The SQLite adapters implement Promise-based repository methods while continuing to use the existing synchronous SQLite driver internally. Existing transaction ownership remains in persistence commands. The W1G slice did not add migrations or change schema versions.

## 2. Caller audit and verification

The audit checked application repository calls, CLI/server routes, rendering/export workflows and tests. Repository I/O is awaited or returned from the async use case; tests now await document creation before accessing the returned document. Signal-driven server shutdown is not repository persistence. Verification completed:

- `pnpm install --frozen-lockfile`
- `pnpm test`
- `pnpm typecheck`
- `pnpm build`, including the retained Vite browser contract and dependency guard
- `pnpm run web:build`

SQLite migrations 1–12 remain unchanged and migration tests cover the existing chain.

## 3. Payment activity consistency requirement

W1A's atomicity map requires customer payment activity to read its contributing events and totals from one coherent snapshot where the adapter supports it. W1H adds the adapter-neutral `CustomerPaymentActivityRepository.readSnapshot(customerId)` contract. The application maps one returned snapshot into the read-only activity model; it no longer composes independently timed repository reads.

The SQLite implementation uses one `BEGIN DEFERRED` read transaction and resolves only after `COMMIT`. A two-connection WAL test verifies that another connection can commit during the read while the snapshot continues to see one consistent state. The snapshot contains:
- customer receipts;
- allocation and release events;
- refunds and receipt/refund reversals;
- received, allocated, refunded, reversed and unallocated totals.

The query remains read-only; it is not a double-entry ledger and does not infer GST treatment. Any future IndexedDB implementation must read the same fields within one readonly transaction.

## 4. Receipt rendering and IndexedDB boundary

Browser receipt preview/print is a required product capability, so the safe receipt render model and print-lines formatter are exported through the browser entry. PDF generation remains server-only until a separately reviewed browser-safe PDF capability is approved.

The initial business/customer IndexedDB implementation is documented in [docs/30](./30-w2-indexeddb-foundation-and-local-setup.md). It does not imply that the remaining repository commands are implemented in IndexedDB. Invoice finalization, receipt recording, allocation/release, refund/reversal and template writes still require their own atomic adapter implementation and tests.

IndexedDB types remain outside application contracts. The SQLite database and migration history remain unchanged; no automatic SQLite import or overwrite is performed.

## 5. W1H exit criteria

- [x] Confirm all eight application repository interfaces expose Promise-based operations.
- [x] Confirm curated browser entry and retained Vite contract include the migrated workflows.
- [x] Confirm Vite guard checks required browser exports and Node-only dependency/global leakage.
- [x] Complete caller audit with no missing awaits or fire-and-forget repository persistence.
- [x] Verify the full browser transitive dependency graph through successful production builds.
- [x] Run workspace tests, typechecks and builds in a pnpm-enabled environment.
- [x] Define and test the payment activity consistent-read contract.
- [x] Decide and implement the browser-safe receipt render/print model export; keep PDF code server-only.
- [x] Document the bounded IndexedDB implementation and its remaining atomicity gates in [docs/30](./30-w2-indexeddb-foundation-and-local-setup.md).

**W1H is complete. Future browser persistence work must continue to follow the adapter-neutral repository and transaction contracts.**
