# W1H — Final Async Application and Browser-Boundary Audit

**Status:** In progress  
**Baseline:** `main` after PR #43, 1 November 2026  
**Purpose:** Verify that the application/repository surface is genuinely asynchronous and browser-safe before choosing or implementing IndexedDB. This is an audit and verification slice, not authorization to add IndexedDB.

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

The curated `@fledge/application/browser` entry includes business, customer, product, document, template, preview, receipt, allocation, adjustment and customer-payment-activity workflows. The retained Vite contract entry imports that surface, and the Vite production guard checks required exports, Node built-in imports and Node runtime globals.

The SQLite adapters implement Promise-based repository methods while continuing to use the existing synchronous SQLite driver internally. Existing transaction ownership remains in persistence commands. The W1G slice did not add migrations or change schema versions.

## 2. Outstanding audit and verification work

Static signatures alone do not establish a completed async boundary. W1H must:

1. Audit all application callers, CLI/server routes, rendering/export workflows and tests for missing `await`, fire-and-forget writes or accidental Promise values.
2. Inspect every browser-exported module's transitive imports. Keep SQLite, Node filesystem, PDF and server configuration code outside the browser graph.
3. Confirm whether browser receipt preview/print requires a browser-safe receipt render-model API. The current browser entry does not export `renderCustomerReceipt`, `customerReceiptPrintLines` or `printCustomerReceipt`; do not export the Node PDF builder/exporter.
4. Run the full workspace test suite, typecheck, package builds and production Vite browser dependency guard in a pnpm-enabled environment. Previous migration PRs did not have a completed local pnpm verification result; do not infer a passing build from static review or PR merge status.
5. Preserve SQLite migrations 1–12 and validate existing data compatibility.

## 3. Payment activity consistency requirement

W1A's atomicity map says customer payment activity should read its contributing events and totals from one coherent snapshot where the adapter supports it. W1G intentionally migrated the query to asynchronous composition but did not introduce a cross-repository snapshot API.

Before IndexedDB implementation, specify and test how the read model obtains a consistent view of:
- customer receipts;
- allocation and release events;
- refunds and receipt/refund reversals;
- received, allocated, refunded, reversed and unallocated totals.

Do not solve this by summing independently timed reads and calling the result transactionally consistent. Choose the smallest adapter-neutral contract justified by the actual use case. Keep the query read-only; it is not a double-entry ledger and must not infer GST treatment.

## 4. IndexedDB remains gated

W1H does not select an IndexedDB wrapper or add browser persistence. After audit and verification, a separate proposal must define:
- database and object-store ownership;
- indexes and versioning/migration strategy;
- transaction scope and completion semantics;
- atomic command mapping for finalization, receipt recording, allocation/release, refund/reversal and template revision/default changes;
- snapshot/read-consistency handling for customer payment activity;
- browser persistence failure, quota, upgrade-blocked and recovery behaviour;
- compatibility and preservation strategy for SQLite data and migrations.

Do not expose IndexedDB types through application contracts. Do not assume a browser transaction remains active across arbitrary asynchronous work. Do not replace atomic repository commands with sequences of unrelated requests.

## 5. W1H exit criteria

- [x] Confirm all eight application repository interfaces expose Promise-based operations.
- [x] Confirm curated browser entry and retained Vite contract include the migrated workflows.
- [x] Confirm Vite guard checks required browser exports and Node-only dependency/global leakage.
- [x] Record the remaining customer payment activity snapshot gap.
- [ ] Complete full caller audit with no missing awaits or fire-and-forget persistence.
- [ ] Verify the full browser transitive dependency graph through a successful production build.
- [ ] Run all workspace tests, typechecks and builds in a pnpm-enabled environment.
- [ ] Decide and test the payment activity consistent-read contract.
- [ ] Decide whether a browser-safe receipt render/print model is required.
- [ ] Approve the IndexedDB architecture proposal as a separate implementation slice.

**Do not start IndexedDB implementation until every W1H exit criterion is resolved or explicitly waived by the product owner.**
