# W1D — Async Product and Saved GST Rate Repositories

**Status:** Implemented in PR #40; pending review and merge  
**Depends on:** W1A repository contract (docs/23), W1B business/customer migration (PR #38), W1C browser boundary (PR #39)  
**Scope:** Migrate product and saved GST rate application workflows to explicit Promise-based repository contracts.

## 1. Application contract

All methods in `ProductRepository` now return Promises:
- Active business lookup.
- Tax-category listing.
- Saved GST rate listing and lookup.
- Saved GST rate insert/update.
- Product listing and lookup.
- Product insert/update.

All product application use cases are asynchronous and await their repository operations:
- `listTaxCategories`
- `listSavedGstRates`
- `createSavedGstRate`
- `updateSavedGstRate`
- `listProducts`
- `getProduct`
- `createProduct`
- `updateProduct`

Pure product validation, normalization and category ordering remain synchronous domain/application work. Storage failures reject; they are not converted into empty/default success results.

## 2. SQLite compatibility and ownership

The SQLite adapter keeps its synchronous `DatabaseSync` driver internally and returns Promise-based results at the application boundary. Existing write transactions remain within their repository commands. No SQLite migration or table definition was changed.

Product writes now verify, inside the same SQLite write transaction, that any referenced saved GST rate belongs to the same active business as the product. This supplements the existing business-profile check and prevents a cross-business GST-rate reference from being persisted through a direct repository call.

Existing database uniqueness constraints remain authoritative for business-scoped product codes and saved GST rate names. Application-level duplicate checks remain useful for clear user-facing validation; they are not a substitute for storage constraints under concurrent writes.

## 3. Browser entry

The curated `@fledge/application/browser` entry now also exports the eight product and saved-rate use cases and their public types. The retained browser-contract build entry and Vite guard include all fourteen approved business, customer and product use-case exports.

No server configuration, PDF export, SQLite persistence or root application barrel is introduced into the browser import graph by this addition.

## 4. Tests

- Existing SQLite product integration tests now await the Promise-based use cases.
- Added application tests for delayed write completion, repository read failure propagation and write failure propagation.
- Added a persistence ownership test for a product attempting to reference a saved GST rate belonging to another business.
- Existing product normalization, active/inactive filtering, saved-rate lifecycle and failed-validation preservation scenarios remain covered.

## 5. Explicitly deferred

W1D does not:
- Migrate document, template, receipt, allocation, payment-adjustment or customer-activity repositories.
- Introduce a generic transaction runner.
- Add IndexedDB, a wrapper, schema or browser migrations.
- Add product UI or browser persistence.
- Change SQLite migrations 1–12.

The next async migration slices must preserve the atomicity map in docs/23, particularly invoice finalization/numbering, receipt idempotency, allocation/release, refunds/reversals, template revision/default changes and consistent payment-activity reads.

## 6. Verification

Required checks:

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build
pnpm web:build
```

These commands have not been run in the implementation environment because pnpm is unavailable. The PR must not be treated as test/build verified until they run in a pnpm-enabled environment.

## 7. Acceptance criteria

- Every ProductRepository method is Promise-based.
- Every product and saved GST rate use case awaits repository operations.
- SQLite product and saved-rate writes preserve their existing atomic transaction boundaries.
- Product writes validate active-business ownership of referenced saved GST rates inside the write transaction.
- Browser entry and retained production contract include the migrated product use cases.
- Application tests verify awaited completion and rejected storage errors.
- No schema migration or IndexedDB implementation is introduced.
