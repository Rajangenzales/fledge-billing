# Fledge Billing — M8 Customer Payment Activity Statement

**Status:** Implementation proposed in PR  
**Scope:** Read-only customer-scoped payment activity and summary  
**Depends on:** docs/14, docs/15, docs/17, docs/18 and docs/19

## Purpose

Provide a chronological view of a customer's existing payment events. This is a payment activity statement, not a general-purpose or double-entry accounting ledger.

## Included source events

- Customer receipt events, using the saved payment date, amount, method, reference and notes.
- Allocation events, linked to the target invoice.
- Allocation release events, retaining the original allocation relationship and reason.
- Actual refund events, using the saved refund date and method.
- Receipt reversal events, clearly distinguished from actual cash refunds.
- Refund-entry reversal events, clearly distinguished from new receipts.

The statement is read-only. It does not create, edit, allocate, release, refund or reverse any event.

## Summary

Expose exact INR totals derived from existing event repositories:

- Receipt count and gross receipts recorded.
- Currently active allocated amount.
- Net refunds (excluding reversed refund entries).
- Reversed receipt amount.
- Currently unallocated customer advance.

All calculations continue to use exact money values and integer-paise persistence calculations. The statement does not create a mutable balance.

## Ordering and history

Entries are ordered chronologically by effective date, then recorded timestamp, then stable event ID. Effective date is the selected payment date for receipts/refunds; allocation/release and reversal events use their recorded date because no separate user-selected effective date exists in the current event model.

Original events remain visible when later compensated. A reversal is not represented as a deletion or as a real-world cash movement.

## Boundaries

- No credit-note or debit-note effects are included.
- No GST advance treatment, receipt-voucher classification or tax calculation is inferred.
- No invoice outstanding recalculation is introduced; existing invoice settlement remains its own derived view.
- No full accounting ledger, double-entry postings, bank reconciliation or journal entries.
- No new schema migration or mutable customer balance.
- No UI, PDF, email or WhatsApp delivery in this application-layer slice.

## Acceptance coverage

- Combines receipts, allocation/release events and refund/reversal events for one business/customer.
- Preserves links to receipt and invoice IDs.
- Uses saved effective dates and recorded timestamps.
- Sorts deterministically.
- Summary agrees with existing derived customer advance and allocation/refund projections.
- Does not mutate financial events or finalized invoices.
- Rejects customers outside the active business scope through existing application guards.
