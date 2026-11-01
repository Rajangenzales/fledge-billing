# W2 — IndexedDB Foundation and Local Setup Workflow

**Status:** Initial business/customer vertical slice implemented  
**Depends on:** W1H completion, docs/23 async repository contract, docs/29 payment activity snapshot contract  
**Scope:** Browser persistence for one business profile and customer records

## 1. Adapter decision

The first browser persistence slice uses the browser's native IndexedDB API without a wrapper dependency. This keeps the adapter small while exercising the existing Promise-based application repository contracts. It does not choose a reusable library for the full product or expose IndexedDB types outside `packages/web`.

The database is named `fledge-billing`, at version 1:

| Object store | Key | Indexes | Records |
| --- | --- | --- | --- |
| `business` | `id` | None | One active business profile |
| `customers` | `id` | `businessId` | Business-owned customer records |

Version 1 creates missing stores/indexes inside the browser's version-change transaction. Future schema changes must increment the database version, preserve existing records, handle blocked upgrades, and include upgrade tests. SQLite migrations 1–12 are unchanged.

## 2. Atomic repository behaviour

- Business profile reads/writes resolve only after the IndexedDB transaction completes. A write rejects if a different business profile already exists; a profile update retains its stable ID.
- Customer insert/update uses a read-write transaction spanning `business` and `customers`. The transaction verifies the active business and customer ownership before writing, preventing cross-business records and stale updates.
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
- active-business scoping and rejection of writes for a missing business or stale/cross-business customer;
- transaction abort on duplicate records without partial changes;
- surfaced storage quota and unavailable-IndexedDB failures;
- blocked upgrades, connection closure on version change and preservation of existing records during an upgrade.

Production `web:build` retains the browser contract and checks required exports, Node built-in imports and Node runtime globals. The SQLite schema/migrations and Node `/health` shell remain separate and unchanged.

## 5. Current limits and next slices

This is the initial W2/W3 foundation, not complete browser billing:

- Products, saved GST rates, invoices, document numbering, templates, receipts, allocations and adjustments are not yet stored in IndexedDB.
- Payment activity's SQLite implementation reads one consistent snapshot. A future IndexedDB implementation must load all contributing records and totals in one readonly transaction.
- Invoice finalization and payment commands must preserve their atomic command boundaries; do not implement them as independent object-store requests.
- The web assets still require a network load. There is no manifest, service worker, offline first-load guarantee, cloud backup, sync, authentication or subscription handling.

Implement additional browser workflows in focused vertical slices, then add the PWA lifecycle and platform matrix separately as described in [docs/21](./21-pwa-frontend-foundation-plan.md) and [docs/11](./11-pwa-offline-sync-and-platform-operations.md).
