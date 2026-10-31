# Fledge Billing — M8-02 Payment & Customer Advance Domain Model

**Status:** Product/domain design approved for implementation planning; no schema or application code changed  
**Version:** 1.0  
**Prepared:** 2026-10-31  
**Scope:** Payment events, customer advances, allocation-ready domain boundaries and correction rules  
**Depends on:** docs/12-m8-payments-advances-and-adjustments-design.md and the M8-01 decision record in docs/13-m8-01-gst-compliance-and-product-decisions.md

> This document defines product and domain behaviour. It does not approve statutory GST automation. Receipt-voucher classification, advance tax treatment, credit/debit-note tax effects and unresolved M8-01 decisions remain subject to qualified GST-practitioner review.

## 1. Approved product principles

1. Draft bills remain freely editable, including dates, parties, items, quantities, rates, discounts and tax inputs. Validation runs again before finalization.
2. Finalized financial documents are not silently rewritten. A correction must use an explicit, permitted correction workflow and retain the original values, actor, timestamp and reason.
3. Payment activity never changes the original invoice's line values, tax calculation snapshot, issue date, identity snapshot or grand total.
4. A payment is a financial event, not an invoice status.
5. A customer may pay before an invoice exists. That receipt is held as an unallocated customer advance until the user allocates, refunds or reverses it.
6. All money uses the repository's exact INR money abstraction. No floating-point arithmetic.
7. Every write is business-scoped, auditable, transactional and safe to retry through an idempotency key.
8. The domain does not assume that every receipt is a statutory GST receipt voucher. That classification is an explicit compliance decision.

## 2. Domain vocabulary

| Term | Meaning |
|---|---|
| Receipt event | Money actually received from a customer. |
| Customer advance | The unallocated portion of valid receipt events for a customer. It can exist before an invoice. |
| Allocation | A directed application of part of a receipt to an eligible finalized invoice receivable. |
| Allocation release | A compensating event that makes a prior allocation available again without deleting history. |
| Refund event | Money actually returned to the customer, linked to the receipt being refunded. |
| Reversal | A controlled compensating event for an erroneous receipt/refund/allocation. It is not deletion. |
| Payment status | A derived view of the invoice's outstanding receivable, never its lifecycle state. |
| Receipt document | A rendered record generated from a receipt event. Statutory receipt-voucher status is separately determined. |

## 3. Aggregate boundaries

### 3.1 Payment event

A payment event is the durable record of a movement of money between the business and a customer.

Required conceptual attributes:
- Stable internal ID.
- Business ID and customer ID.
- Event kind: `receipt` or `refund`.
- Positive exact amount and currency (INR for V1).
- Effective payment date selected by the user.
- Method: cash, UPI, bank transfer, card, cheque or other configured/manual method.
- Optional external reference, notes and reason.
- Optional link to the original receipt when the event is a refund.
- Idempotency key scoped to the business and command.
- Recorded timestamp and, when available, actor/audit metadata.
- State sufficient to distinguish a valid event from a reversed/voided event without erasing the record.

Direction is represented by event kind. Amounts are always positive. A refund must link to a prior receipt for the same business and customer. Never store card credentials, CVV, UPI PIN, banking password or provider secret.

### 3.2 Customer advance balance

Do not maintain a mutable advance balance as the only source of truth. Derive it from valid events and allocation history:

`unallocated = valid_receipts - valid_refunds - active_allocations`

This is a customer/business scoped balance. It may never be negative. It is not an invoice with a negative total and must not be silently netted against a future invoice.

The customer ledger should expose:
- Total receipts.
- Total refunds/reversals.
- Total currently allocated.
- Current unallocated advance.
- A chronological event/allocation history.

### 3.3 Allocation boundary

An allocation links one receipt event to one finalized invoice for the same business and customer. Many-to-many settlement is achieved through multiple allocation rows: one receipt can fund multiple invoices and one invoice can be funded by multiple receipts.

An allocation records:
- Stable allocation ID.
- Business, customer, receipt and invoice IDs.
- Positive exact amount.
- Effective/recorded timestamps.
- Idempotency key and audit metadata.

Allocation history is append-only in meaning. Releasing an allocation creates a compensating release record referencing the original allocation and reason. Reallocation is release plus a new allocation, performed transactionally. Do not update an allocation amount in place.

### 3.4 Refund and reversal boundary

A refund is a new money-out event linked to its source receipt. It must not exceed the receipt's remaining refundable amount. If the receipt has active allocations, the user must explicitly choose how to resolve them; the system must not silently make an invoice unpaid or create a negative customer balance.

A reversal/void is reserved for correcting an erroneous event. It requires a reason and references the original event. The original remains visible and is marked as reversed through its event history/derived state. A reversal is not the same as a customer refund: a refund is a real return of money; reversal corrects the record of an invalid/erroneous event.

## 4. Core invariants

1. Receipt/refund amounts are greater than zero.
2. Every event, allocation and document belongs to the same business scope.
3. Customer IDs must match across receipt, refund, allocation and invoice.
4. An allocation can target only a finalized, eligible invoice, never a draft.
5. A cancelled invoice accepts no new allocation. Existing allocations remain visible and require an explicit resolution.
6. Active allocations for a receipt cannot exceed its remaining valid receipt amount after refunds and reversals.
7. Active allocations for an invoice cannot exceed its eligible outstanding receivable.
8. Refunds cannot exceed the unrefunded amount of the source receipt.
9. No event is hard-deleted after it has been recorded.
10. Duplicate command retries with the same idempotency key return the original result and do not create duplicate financial events.
11. A failed multi-record command leaves no partial state.
12. Customer advances cannot be transferred across customers or businesses through an allocation.
13. Payment activity cannot mutate invoice totals, tax snapshots, invoice number/date or party snapshots.
14. Payment status is derived, not manually writable.
15. All calculations use exact money and a documented rounding/settlement policy.

## 5. Command contracts

The following are domain/application command contracts, not prescribed function names.

| Command | Preconditions | Result |
|---|---|---|
| Record customer receipt | Valid business/customer, positive amount, valid payment date/method, unique idempotency key | New receipt event; amount initially unallocated. |
| Allocate receipt | Receipt has available unallocated amount; invoice is finalized and eligible; same business/customer | New allocation and updated derived balances. |
| Release allocation | Allocation is active; reason supplied | Release event; receipt availability and invoice outstanding recomputed. |
| Reallocate receipt | Release existing allocation and create replacement allocation in one transaction | Full history retained; final balances consistent. |
| Record refund | Source receipt exists; amount is refundable; allocation resolution explicit | New refund event linked to receipt. |
| Reverse receipt/refund | Original event is valid and not already reversed; reason supplied; dependent allocations resolved | Compensating event; original retained. |
| Get customer advance | Business/customer scope supplied | Derived received, refunded, allocated and unallocated totals plus history. |
| Get invoice settlement | Finalized invoice supplied | Derived valid allocations, outstanding and payment status. |

Each command must validate ownership and state inside the transaction, not rely on UI checks. The UI may preview a balance, but the application layer revalidates it at commit time.

## 6. Draft editing and finalized document correction

- Drafts: editable in place. The user can correct any supported field before finalization.
- Finalized invoices: no silent edit or delete. The UI may offer a correction path that creates a new draft from the original, clearly labels it as a correction/replacement workflow, and preserves a link to the original. Whether and how the original can be cancelled, replaced or adjusted depends on the document's legal and operational state.
- Finalized payment events: never edit in place. Use reversal/correction events with a reason.
- Finalized allocations: release and reallocate through compensating history.
- Credit/debit notes: separate linked documents; their statutory eligibility and receivable effect remain governed by the approved M8-01 decision and practitioner review.

The interface must distinguish **Edit draft**, **Create correction**, **Record payment**, **Allocate advance**, **Refund**, and **Reverse entry**. Do not label every action simply “Edit”.

## 7. Derived balances and statuses

For an invoice, define the receivable only after the approved adjustment policy is implemented:

`net_receivable = finalized_invoice_total + applicable_debit_adjustments - applicable_credit_adjustments`

`outstanding = net_receivable - active_payment_allocations`

For the initial payment/advance model, credit/debit-note adjustments are excluded until their approved accounting treatment is implemented. Do not infer that a credit note automatically creates a refund or customer advance.

Derived payment states:
- **Unpaid:** no active allocation and positive outstanding.
- **Partially paid:** active allocations exist and positive outstanding remains.
- **Paid:** outstanding is zero under the approved exact settlement policy.
- **Customer advance:** positive unallocated customer receipt balance, independent of invoice payment state.

Do not use a negative invoice outstanding to represent customer credit. Do not mark an invoice paid merely because a receipt exists; it must be allocated.

## 8. Persistence and transaction direction

This is a conceptual design. Before migration, inspect the actual schema and migration registry. The repository currently has migrations through version 8; use the next contiguous migration number after rechecking main.

Suggested persistence concepts:
- Receipt/refund event table with positive amount and event kind.
- Allocation table or append-only allocation-event table that records allocate/release relationships.
- Idempotency uniqueness scoped to business and operation.
- Foreign keys and indexes for business, customer, receipt and invoice.
- Typed payment-method values with safe extension for “other”.
- Audit metadata for reason, actor and event timestamps.

Prefer one append-only financial event history for allocation/release rather than mutable amount/status fields with no audit record. If a current-state projection is added for performance, it must be rebuildable from immutable events and verified against them.

Migration must:
- Preserve all existing documents and migration history.
- Inspect and safely handle any legacy `payment` rows, including document association and payment date.
- Not invent customer identity where legacy rows lack it; quarantine or report unresolvable rows for explicit migration handling.
- Not silently translate legacy `partial`/`paid` lifecycle values without a tested mapping.
- Run transactionally and roll back on failure.
- Test fresh database and upgrade from current schema version 8.
- Keep a reversible backup/restore plan before destructive transformations.

No migration is specified or authorized by this design document alone.

## 9. Offline, retry and concurrency behaviour

- A receipt saved offline receives a stable local ID and idempotency key.
- Replaying the same command after restart must not create a second receipt.
- Allocation and refund commands re-read balances within a write transaction.
- Concurrent commands must not over-allocate the same receipt or invoice.
- On conflict, return a clear retryable conflict and preserve the user's unsaved intent; do not silently drop the event.
- Multi-device synchronization is out of scope for this implementation slice. Do not claim globally unique offline numbering or synchronized balances.

## 10. Minimum acceptance tests

- Receipt before invoice creates unallocated advance.
- Advance balance is derived correctly after allocation, release, refund and reversal.
- One receipt can be allocated across multiple invoices.
- Multiple receipts can settle one invoice.
- Draft and cancelled invoices reject allocation.
- Cross-business and cross-customer operations are rejected.
- Over-allocation and over-refund are rejected transactionally.
- Release/reallocation preserves the full event history.
- Idempotent retries do not duplicate events or allocations.
- Concurrent allocation attempts cannot exceed receipt or invoice balances.
- Payment dates and methods persist exactly.
- Invoice totals, GST snapshots, document date and party snapshots remain unchanged.
- Payment status is derived and independent of document lifecycle.
- Historical legacy payment rows are migrated or explicitly surfaced for manual resolution.
- Fresh and version-8 upgrade migration tests pass when implementation begins.
- Offline restart preserves receipts and allocation history.

## 11. Explicitly unresolved and blocked

The following remain outside this domain model until separately approved:
- Statutory receipt-voucher classification, numbering and mandatory fields.
- GST time-of-supply and tax calculation for service/goods advances.
- Refund-voucher eligibility and statutory particulars.
- Credit/debit note statutory eligibility, deadline, reporting and effect on receivables/customer credit.
- Payment/advance treatment for cancelled invoices and disputed transactions.
- Historical import and late-document policies where statutory facts are uncertain.
- Multi-device synchronization and globally safe offline allocation conflict resolution.

Use docs/13 as the current M8-01 decision baseline. Qualified GST-practitioner review is still required before statutory automation or release claims.

## 12. Implementation sequence after design approval

1. Inspect actual schema, migration version and legacy payment rows on current main.
2. Implement receipt/refund event persistence and customer advance derivation in a focused migration/PR.
3. Implement allocation/release history and transactional idempotency in a separate focused slice.
4. Add derived invoice outstanding/payment status without changing document lifecycle.
5. Add refund/reversal workflows.
6. Add credit/debit notes only after the unresolved M8-01 receivable/tax decisions are signed off.
7. Add receipt rendering and PDF/print integration against immutable payment snapshots.

**Cursor instruction:** Implement only the smallest complete issue. Report changed files, migration number, tests run and actual results. Stop if legacy payment rows cannot be migrated without guessing, or if an implementation would mutate finalized financial history.
