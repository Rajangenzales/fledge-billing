# Fledge Billing — W1A Async Repository & Transaction Contract

**Status:** Approved and merged in PR #37  
**Baseline:** `main` at `f4e368eaa344fdf0327f0644c6ad69a72fa61c99` (PR #36 merged)  
**Scope:** Define asynchronous repository behaviour, atomicity boundaries and the SQLite transition. This document does not implement the migration or select an IndexedDB library.

## 1. Decision summary

Fledge will use **explicit Promise-based repository contracts** at the application boundary. Pure domain calculations, validation, normalization, formatting and deterministic mapping remain synchronous.

Repository methods must describe completion: a resolved Promise means the requested read or write has completed, and a rejected Promise means it failed. Callers must await every operation. No synchronous facade, hidden background write, preload cache or fire-and-forget persistence is permitted.

Atomic business commands remain repository operations. A generic transaction coordinator is available for a genuinely multi-repository use case, but ordinary use cases must not open a transaction merely to group unrelated reads. The storage adapter owns the driver-specific transaction and connection lifecycle.

The first migration slice remains business profile and customer management. This contract covers the wider repository surface so later vertical slices do not invent incompatible patterns.

## 2. Current repository facts verified against source

The current application interfaces are synchronous:
- `BusinessRepository`: `get`, `save`.
- `CustomerRepository`: business lookup, list/get, insert/update.
- `ProductRepository`: product, tax-category and saved-rate reads/writes.
- `DocumentRepository`: document reads/writes, finalization/cancellation and number-series operations.
- `TemplateRepository`: built-in creation, listing, default selection and revision writes.
- Payment repositories: receipt insert/list/advance reads, allocation/release events, settlement reads, refund/reversal events and activity totals.

The SQLite adapter uses Node's synchronous `DatabaseSync`. Business profile save currently wraps business and setting writes in one SQLite transaction. Customer insert/update checks the active business and writes the customer inside a SQLite transaction. Other persistence repositories also own atomic write commands.

These are implementation facts, not a reason to preserve synchronous contracts. The SQLite driver can remain synchronous internally while its application-facing adapter returns Promises.

## 3. Application contract rules

### 3.1 Promise semantics

Use these rules consistently:

| Operation | Contract shape |
| --- | --- |
| Read one optional record | `Promise<T | null>` |
| Read a required collection | `Promise<T[]>` |
| Read a scalar/aggregate | `Promise<T>` |
| Complete a write without a returned record | `Promise<void>` |
| Complete a write that returns its persisted result | `Promise<T>` |
| Atomic command | `Promise<T>` or `Promise<void>`, with atomicity documented |

Method names and domain return values should remain meaningful. Do not mechanically add `async` while leaving a method returning a non-awaited value from an asynchronous storage operation.

### 3.2 No Promise leakage into domain logic

- Domain validation and calculations stay synchronous unless they genuinely perform I/O, which domain code should not do.
- Application use cases await repository calls and return Promises.
- UI loading/error state belongs to the presentation layer.
- Repository contracts expose domain/application types, never SQL rows, IndexedDB requests, IDBDatabase, IDBTransaction or wrapper-specific types.
- Do not use `Promise.all` for operations that must observe a consistent transactional snapshot or share a transaction.

### 3.3 Business scoping and ownership

Every business-owned read and write must remain scoped to the active business. A client-side business ID is not authorization.

For writes whose validity depends on ownership or current state, the adapter must perform the check and mutation within the same atomic boundary. In particular, customer create/update must not perform a separate business/customer check and then write later without revalidation.

### 3.4 Errors and retries

- Preserve existing domain-facing error types/messages where possible.
- Storage failures reject; they must not be converted to empty collections, null records or success-shaped defaults.
- Idempotency keys remain enforced by the storage command, not by a prior application read.
- A retry with the same key must return the established result or the existing documented conflict behaviour. It must not duplicate an event.
- A transaction failure rejects the whole command. No partial result may be returned.

## 4. Transaction abstraction

### 4.1 Two supported levels

**Level A: atomic repository command (default).** A repository method owns the complete read/validate/write sequence required for one business invariant. Examples include saving a business profile with its settings, inserting a customer after verifying business ownership, recording an idempotent receipt, allocating a receipt, recording a refund, and finalizing an invoice with its number-series update.

**Level B: explicit unit of work (only when needed).** If a future use case truly spans multiple repositories and must commit them together, the application may request a transaction through an adapter-neutral transaction runner. The runner receives a declared read/write mode and the complete resource scope. Repositories participating in the unit of work receive an opaque transaction context. The context is a capability, not a database handle.

Conceptual shape (illustrative, not a committed API signature):

```ts
type TransactionMode = "readonly" | "readwrite";

interface TransactionRunner<Tx> {
  run<T>(
    options: {
      mode: TransactionMode;
      resources: readonly string[];
    },
    work: (tx: Tx) => Promise<T>,
  ): Promise<T>;
}
```

The concrete transaction context and repository binding will be specified alongside the first real multi-repository use case. Do not export IndexedDB or SQLite transaction objects from the persistence package.

### 4.2 Transaction lifetime rules

An IndexedDB implementation must not assume that an open transaction remains active across arbitrary asynchronous work. Inside a transaction callback:

- Await only operations that are part of the same transaction and whose requests keep that transaction active.
- Do not await network calls, timers, user interaction, file selection, unrelated promises or CPU-heavy work.
- Perform pure validation/calculation before opening the transaction whenever possible.
- Keep the transaction resource scope as small and explicit as possible.
- Resolve the outer Promise only after the underlying transaction has committed; reject on abort.
- Do not report success merely because an individual request succeeded before the transaction's final commit.

The SQLite adapter must provide equivalent all-or-nothing semantics, even though its driver is synchronous.

### 4.3 Avoid a premature universal transaction API

Do not build a generic ORM, unit-of-work framework or arbitrary transaction scripting language. Start with atomic repository commands. Add cross-repository coordination only when a concrete workflow requires it and its resource scope can be stated and tested.

## 5. Required atomicity map

| Workflow / repository | Atomic command boundary | Invariants that must survive |
| --- | --- | --- |
| Business profile | Save profile and replace its settings together | One business profile; no partial settings replacement |
| Customer | Insert/update with active-business ownership check | Customer belongs to the active business; update cannot silently recreate a missing customer |
| Product and saved GST rate | Validate relevant business-owned references and persist the mutation | No cross-business reference; unique code/rate-name rules remain race-safe |
| Invoice finalization | Read draft, validate current prerequisites, allocate number, persist finalized document and advance number series in one transaction | No duplicate issued number; financial-year series uses document date; finalized document is immutable |
| Invoice draft replacement | Replace only while the stored document is still a draft | Finalized/cancelled history cannot be overwritten |
| Receipt recording | Enforce idempotency and persist receipt plus receipt-time identity snapshot atomically | No duplicate receipt on retry; snapshot corresponds to the committed receipt |
| Receipt allocation/release | Validate receipt, invoice, customer, business, available balance and idempotency; append event atomically | No over-allocation; no cross-business/customer allocation; release references a valid allocation; append-only history |
| Refund/reversal | Validate original receipt/event, remaining refundable/reversible amount and idempotency; append adjustment atomically | No excess refund/reversal; no silent event deletion; compensating events remain traceable |
| Template revision/default | Save revision or change default as one coherent command | Immutable prior revision; one valid default per applicable scope |
| Customer payment activity | Read all contributing events and totals from a consistent snapshot where the adapter supports it | Statement totals and entries must describe one coherent read point; remain read-only and not a ledger |

The table is a preservation map, not permission to expand statutory GST or credit/debit-note behaviour.

## 6. Repository contract inventory and async migration direction

The next implementation slices should apply the same Promise semantics to all methods in these interfaces:

1. `BusinessRepository`
2. `CustomerRepository`
3. `ProductRepository`
4. `DocumentRepository`
5. `TemplateRepository`
6. `CustomerReceiptRepository`
7. `AllocationRepository`
8. `PaymentAdjustmentRepository`

Read-only activity composition must also become asynchronous and await its component reads. Its read consistency requirement must be explicit; it must not be upgraded into a ledger or mutate payment events.

Do not keep parallel synchronous and asynchronous public application interfaces indefinitely. During the migration, use narrowly scoped internal compatibility helpers only if required to keep commits buildable. Remove them when the relevant use cases and SQLite adapter have moved.

## 7. SQLite compatibility strategy

- Keep `DatabaseSync`, SQLite migrations 1–12 and existing table semantics unchanged.
- The SQLite adapter may execute synchronous statements internally, then return resolved Promises from the async repository contract.
- Keep each existing transaction in the same logical repository command. Do not split a transaction into separately awaited calls.
- If a repository command needs multiple SQL statements, execute them inside the existing SQLite transaction before resolving.
- Keep SQL transaction begin/commit/rollback in the persistence layer.
- Do not introduce a second SQLite schema, rewrite migration history or require data export/import.
- Existing CLI and local HTTP workflows must continue to use the same persisted data and behaviour.

This compatibility layer is a transition path, not an assertion that synchronous SQLite I/O is non-blocking.

## 8. First vertical slice: business profile and customers

W1B should migrate only business profile and customer use cases plus their SQLite repository implementations and tests.

Acceptance requirements:
- All business-profile and customer application use cases return Promises and await every repository operation.
- Existing validation, normalization, generated IDs and timestamps retain their current meaning.
- Business profile and its settings still save atomically.
- Customer ownership is checked within the customer write transaction.
- Missing business, missing customer, duplicate/invalid data and persistence failures retain clear error behaviour.
- Add tests proving the use case waits for delayed repository operations and propagates rejected operations.
- Add SQLite tests for rollback and preservation of existing records.
- Existing CLI callers are updated to await the new API; no fire-and-forget calls.
- No IndexedDB, browser storage schema, wrapper, UI workflow or service worker is introduced in this slice.

## 9. Decisions deliberately deferred

- IndexedDB wrapper/library selection.
- IndexedDB database name, object stores, indexes and version number.
- Browser migration/import from SQLite.
- Cross-device sync, cloud backup and conflict resolution.
- Generic transaction context implementation beyond the contract required by a concrete use case.
- Browser PDF generation and file export.
- Public authentication, subscriptions and remote authorization.

These decisions require later evidence and must not be smuggled into W1A.

## 10. W1A acceptance checklist

- [x] Inspect current application repository interfaces and SQLite transaction ownership.
- [x] Define Promise semantics and error propagation.
- [x] Define atomic repository command and explicit unit-of-work boundaries.
- [x] Record financial, ownership, idempotency and immutable-history invariants.
- [x] Specify a SQLite compatibility strategy without changing migrations 1–12.
- [x] Bound W1B to business profile and customer workflows.
- [x] Review and merge this contract (PR #37).
- [x] Implement the first business-profile/customer async migration (W1B, PR #38).
- [ ] Run the repository test, typecheck and build commands in a pnpm-enabled environment.
- [x] Implement the product/saved GST rate async migration (W1D, PR #40 merged).
- [x] Implement the invoice/document async migration (W1E, PR #41 merged).
- [x] Implement the template repository and rendering async migration (W1F, PR #42 pending review).

## 11. Source files inspected

- `packages/application/src/business-profile.ts`
- `packages/application/src/customer.ts`
- `packages/application/src/product.ts`
- `packages/application/src/document.ts`
- `packages/application/src/template.ts`
- `packages/application/src/customer-receipt.ts`
- `packages/application/src/allocation.ts`
- `packages/application/src/payment-adjustment.ts`
- `packages/application/src/customer-payment-activity.ts`
- `packages/persistence/src/business.ts`
- `packages/persistence/src/customer.ts`
- `packages/persistence/src/connection.ts`
