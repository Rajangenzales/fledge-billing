# W1G — Async Payment Repository and Application Workflows

**Status:** Implemented on `feat/w1g-async-payment-repositories`; pending review and merge  
**Depends on:** W1A async repository contract, W1B business/customer migration, W1C browser boundary, W1D product/saved-rate migration, W1E document migration, and W1F template migration.

## 1. Scope

W1G moves the payment persistence boundary and dependent application workflows to Promise-based repository contracts:

- Customer receipts and customer advances.
- Receipt-to-invoice allocations and compensating allocation releases.
- Refunds, receipt reversals and refund reversals.
- Read-only customer payment activity composition.
- SQLite adapter compatibility and browser-safe application exports.
- Existing persistence/application tests updated to await asynchronous workflows.

## 2. Preserved invariants

- Receipt idempotency lookup, customer ownership validation, receipt-time identity capture and insert remain inside one SQLite write transaction.
- Allocation and release commands remain transactional, business-scoped and idempotent. Releases remain compensating events; original allocation history is not deleted.
- Refund and reversal commands remain transactional, business-scoped and idempotent. They enforce active-allocation, refundable-balance and prior-reversal constraints.
- Customer payment activity remains a read-only activity projection. It is not a double-entry ledger and does not infer tax treatment.
- Financial values remain decimal strings and are summed using integer paise, never floating-point arithmetic.
- Existing migrations and schema versions are unchanged.

## 3. Browser boundary

The curated `@fledge/application/browser` entry now exports receipt, advance, allocation, settlement, adjustment and customer-payment-activity use cases and their public types. The retained Vite browser contract and dependency guard require the payment use-case exports.

Node filesystem receipt-PDF export remains on the server-only application entry. It now awaits asynchronous receipt rendering. No SQLite persistence implementation, Node filesystem access or PDF exporter was added to the browser graph.

## 4. Deliberate non-goals

W1G does not introduce:

- IndexedDB or a browser persistence adapter.
- Database schema changes or new migrations.
- A generic transaction runner or a cross-repository snapshot API.
- Customer-facing payment UI, browser PDF export or PWA/offline service-worker behaviour.
- Credit/debit-note accounting, statutory voucher automation or GST advance automation.

Customer payment activity composes asynchronous repository reads. The current repository contract does not promise a cross-repository point-in-time snapshot; callers must not interpret the activity projection as a transactionally consistent accounting ledger.

## 5. Verification

- Updated receipt, allocation, refund/reversal and customer activity tests to await Promise-based workflows.
- Local pnpm test, typecheck and build verification remains outstanding in a pnpm-enabled environment.
- Review the production Vite bundle guard and run the full workspace checks before merging.

## 6. Exit criteria

- [x] Payment repository interfaces return Promises.
- [x] Payment application use cases and customer payment activity await repository operations.
- [x] SQLite adapter exposes async methods while retaining synchronous transaction ownership.
- [x] Receipt PDF export awaits the asynchronous receipt render model and remains server-only.
- [x] Browser-safe payment exports and Vite contract checks are updated.
- [x] Existing payment tests await asynchronous operations.
- [ ] Full tests, typecheck and production builds pass in a pnpm-enabled environment.
- [ ] PR reviewed and merged.

After W1G is verified and merged, audit the complete application/browser boundary. IndexedDB remains deferred until the asynchronous application/repository boundary is complete and verified.
