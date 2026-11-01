# W1F — Async Template Repository and Rendering Workflows

**Status:** Implemented in PR #42; pending review and merge  
**Depends on:** W1A async repository contract (docs/23), W1B business/customer migration (PR #38), W1C browser boundary (PR #39), W1D product/saved GST rate migration (PR #40), W1E invoice/document migration (PR #41)  
**Scope:** Convert template repository operations and template application/rendering workflows to explicit Promise-based contracts.

## 1. Changes

- Every `TemplateRepository` method now returns a Promise:
  - business identity and business details
  - built-in template installation
  - list and get
  - default-template selection
  - immutable template revision creation
- Template application use cases are asynchronous:
  - `listTemplates`, `getTemplate`
  - `setDefaultTemplate`, `reviseTemplate`
- Template preview, restoration and issued-document rendering now await repository operations.
- The SQLite adapter exposes async methods while retaining its synchronous `DatabaseSync` implementation and existing SQL transaction boundaries.
- The curated `@fledge/application/browser` entry and retained Vite browser contract now include template management, preview, restoration and issued-document rendering workflows.
- Existing template persistence tests now await async calls. Application tests cover delayed listing, built-in installation ordering and read-failure propagation.
- Corrected two missed async assertions in the existing document persistence tests: number-series reads and product creation are now awaited.

## 2. Template and document invariants

- Built-in template installation remains an atomic SQLite transaction.
- Selecting a default template remains atomic: the old default is cleared and the selected active template is marked default within one transaction.
- Template revision remains an atomic immutable-version operation. Source-version validation, default transition, new template row, sections, fields and custom fields commit together.
- Revision still rejects a stale source version. Existing document snapshots continue to reference the exact template version selected when the document was created.
- Preview remains read-only: it does not create a billing document or consume an invoice number.
- Issued-document rendering loads the stored template version, not the current default or latest revision. Historical template and custom-field labels/values remain stable.
- No GST calculation, invoice total, document-date or numbering logic was changed.

## 3. Verification and limits

- Updated template integration tests for asynchronous application/repository operations.
- Added application tests for delayed completion, ordering and error propagation.
- Local test/typecheck/build execution was not possible because pnpm is unavailable in the current execution environment. The PR requests:
  - `pnpm install --frozen-lockfile`
  - `pnpm test`
  - `pnpm typecheck`
  - `pnpm build`
  - `pnpm web:build`
- No GitHub Actions workflow is configured in the repository, so no CI pass is claimed.

## 4. Explicitly not included

- No SQLite schema or migration changes.
- No IndexedDB wrapper, schema, adapter or offline browser billing.
- No template editor UI or browser PDF export implementation.
- No payment repository migration or payment activity changes.
- No GST statutory-rule changes, cloud backup/sync, authentication or subscriptions.

## 5. Next migration

After W1F is reviewed and merged, migrate the payment repositories and their application workflows in focused slices. Keep payment activity composition consistent and preserve receipt idempotency, allocation/release, refund/reversal and derived-balance invariants. IndexedDB remains deferred until the remaining payment/application repositories and browser boundary are fully migrated and verified.
