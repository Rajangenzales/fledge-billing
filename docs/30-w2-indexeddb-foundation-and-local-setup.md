# W2 — IndexedDB Foundation and Local Setup Workflow

**Status:** Business, customer, product, saved-rate and initial billing-document browser slices implemented
**Depends on:** W1H completion, docs/23 async repository contract, docs/29 payment activity snapshot contract  
**Scope:** Browser persistence and local setup/catalog workflows

## 1. Adapter and schema

The browser persistence adapter uses the browser's native IndexedDB API without a wrapper dependency. This exercises the existing Promise-based application repository contracts and keeps IndexedDB details inside `packages/web`.

The database is named `fledge-billing`, at version 3:

| Object store | Key | Indexes | Records |
| --- | --- | --- | --- |
| `business` | `id` | None | One active business profile |
| `customers` | `id` | `businessId` | Business-owned customer records |
| `savedGstRates` | `id` | `businessId` | Business-configured saved percentages |
| `products` | `id` | `businessId` | Business-owned goods and services |
| `documents` | `id` | `businessId`, `businessTypeYear` | Drafts and immutable finalized document snapshots |
| `numberSeries` | `id` | Unique `businessTypeYear` | Per-business, type and financial-year numbering state |

Version 3 creates missing stores/indexes inside the browser's version-change transaction and preserves version 1 business/customer data. Future schema changes must increment the database version, preserve existing records, handle blocked upgrades, and include upgrade tests. SQLite migration 13 adds the optional document due date; earlier migrations remain unchanged.

## 2. Atomic repository behaviour

- Business profile reads/writes resolve only after the IndexedDB transaction completes. A write rejects if a different business profile already exists; a profile update retains its stable ID.
- Customer insert/update uses a read-write transaction spanning `business` and `customers`. The transaction verifies the active business and customer ownership before writing, preventing cross-business records and stale updates.
- Product writes use one read-write transaction spanning `business`, `savedGstRates` and `products`. The transaction verifies business ownership, referenced-rate ownership, active-rate selection for new references, existing-product ownership and business-scoped product-code uniqueness before writing. Existing products can retain their previously selected rate after it becomes inactive.
- Saved-rate writes use one read-write transaction spanning `business` and `savedGstRates`, verifying business ownership and business-scoped name uniqueness.
- Product and saved-rate reads are scoped to the current business. Inactive records remain retrievable for editing and historical references; default lists omit inactive records.
- Document reads are business-scoped. Draft create/edit checks current customer and product ownership; finalization recalculates against current business/customer/product/GST references and atomically writes the finalized snapshot and next number-series value.
- Finalized documents retain their number, document date, optional due date and calculated financial/tax snapshots. Number allocation uses the financial year derived from the document date; retrying finalization returns the existing finalized snapshot without consuming another number.
- The browser document screen supports tax invoices, non-GST invoices, bills of supply and quotations, with draft creation/editing, catalog lines, saved-draft totals, finalization and draft cancellation. Receipt/payment workflows are separate. Invalid or missing current references fail rather than issuing a partial document.
- Tax categories come from the domain catalog. Saved percentages remain user configuration and are not statutory tax rules or calculations.
- Customer list/get operations are scoped to the current business. The persisted customer record is validated and normalized by `@fledge/application` / `@fledge/domain`.
- Transaction aborts and storage failures reject; they do not return empty or success-shaped values.
- No localStorage business records, network sync, or automatic SQLite import/overwrite is used.

## 3. Storage durability and failure UX

The app feature-detects and requests persistent browser storage. If unsupported or denied, it displays a warning. Database open/upgrade and transaction errors are surfaced in the UI; a blocked upgrade tells the user to close other Fledge tabs.

Browser storage may still be cleared or evicted, and quota failures can prevent writes. The UI warns that this slice has no backup/export and should not be the only copy of critical records. M9 backup and validated restore are not implemented.

## 4. Verification

`fake-indexeddb` is a web-package development dependency used to verify:

- fresh database creation;
- business-profile and customer persistence after closing and reopening the database;
- product and saved-rate persistence after closing and reopening the database;
- draft document persistence after closing and reopening the database, optional due-date validation, date-based numbering, GST recalculation, retry-safe finalization and cancellation;
- transaction rollback when finalization cannot revalidate a referenced product, without consuming a number;
- product/rate edits and active/inactive filtering;
- business-scoped code/name uniqueness and rejection of cross-business writes;
- active-business scoping and rejection of writes for a missing business or stale/cross-business customer;
- transaction abort on duplicate records without partial changes;
- surfaced storage quota and unavailable-IndexedDB failures;
- blocked upgrades, connection closure on version change and preservation of existing records during an upgrade from schema version 1 to 3.

Production `web:build` retains the browser contract and checks required exports, Node built-in imports and Node runtime globals. The SQLite schema/migrations and Node `/health` shell remain separate and unchanged.

## 5. Current limits and next slices

This is a growing W2/W3 foundation, not complete browser billing:

- Browser document templates are limited to built-in defaults; custom template persistence/customization and custom fields remain in B3. PDF, print and share workflows remain in C2.
- Receipts, allocations, refunds, reversals and customer payment activity are not yet stored in IndexedDB.
- Payment activity's SQLite implementation reads one consistent snapshot. A future IndexedDB implementation must load all contributing records and totals in one readonly transaction.
- Payment commands must preserve their atomic command boundaries; do not implement them as independent object-store requests.
- The web assets still require a network load. There is no manifest, service worker, offline first-load guarantee, cloud backup, sync, authentication or subscription handling.

Implement additional browser workflows in focused vertical slices, then add the PWA lifecycle and platform matrix separately as described in [docs/21](./21-pwa-frontend-foundation-plan.md) and [docs/11](./11-pwa-offline-sync-and-platform-operations.md).
