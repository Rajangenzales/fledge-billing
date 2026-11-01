# W1E — Async Invoice and Document Repository

**Status:** Merged in PR #41  
**Depends on:** W1A async repository contract (docs/23), W1B business/customer migration (PR #38), W1C browser boundary (PR #39), W1D product/saved GST rate migration (PR #40)  
**Scope:** Convert the document repository and its application/rendering callers to explicit Promise-based contracts while preserving existing financial transaction boundaries.

## 1. Changes

- Every `DocumentRepository` method now returns a Promise, including business/customer/product lookups, GST rule reads, document reads/writes, number-series operations, template resolution and custom-field reads.
- Document application use cases are asynchronous and await all repository operations:
  - `listDocuments`, `getDocument`, `createDocument`, `updateDocument`
  - `finalizeDocument`, `cancelDocument`, `saveNumberSeries`
- Draft reconstruction and GST context loading are asynchronous. Draft presentation processes documents sequentially rather than using parallel reads that could imply a consistent snapshot the repository does not promise.
- The SQLite adapter exposes async methods while retaining its synchronous `DatabaseSync` implementation and existing SQL transaction ownership.
- Issued-document rendering is asynchronous. Invoice PDF export and print rendering await the document read before building output.
- The curated `@fledge/application/browser` entry and retained Vite browser contract now include the document use cases. The production dependency guard requires their exports.
- Application tests cover delayed repository completion and rejected document reads. Persistence tests now await the migrated document workflows.

## 2. Financial and data-safety invariants

- Invoice finalization remains one atomic SQLite transaction: read and validate the draft, recalculate from the stored date and current valid prerequisites, allocate the financial-year number, advance the number series, replace stored children with the finalized snapshot, and commit together.
- A failed finalization rolls back both the issued document and the number-series increment.
- Draft replacement rechecks stored draft status inside the transaction before replacing its child rows. Finalized or cancelled history cannot be overwritten.
- Document insert and draft replacement validate that the customer and every referenced product belong to the active business inside the same transaction as the write.
- Number-series edits recheck issued-number constraints inside the repository transaction. The application pre-check is validation feedback, not the storage authority.
- Existing document date, financial-year numbering, GST snapshots, exact string/minor-unit amounts, template/custom-field snapshots and finalized immutability are unchanged.

## 3. Verification and limits

- Updated existing persistence tests to await asynchronous document operations.
- Added application-level tests for delayed reads and repository failure propagation.
- Automated local verification was not run because pnpm is unavailable in the current execution environment. The PR requests:
  - `pnpm install --frozen-lockfile`
  - `pnpm test`
  - `pnpm typecheck`
  - `pnpm build`
  - `pnpm web:build`
- No GitHub Actions workflow is configured in the repository, so no CI pass is claimed.

## 4. Explicitly not included

- No SQLite schema or migration changes.
- No IndexedDB wrapper, schema, browser storage adapter or offline billing workflow.
- No invoice-entry UI or browser PDF implementation.
- No changes to GST legal rules, statutory automation, credit/debit notes or payment accounting.
- No cloud backup, sync, authentication or subscription work.

## 5. Next migration

W1E is merged. W1F now migrates the template repository and rendering workflows in PR #42. Payment repositories and payment activity composition remain for subsequent async migrations. IndexedDB remains deferred until the required application repositories and browser boundary are fully migrated and verified.
