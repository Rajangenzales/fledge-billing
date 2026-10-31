# Fledge Billing — M8-02C Refund & Reversal Implementation

**Status:** Implemented on feature branch; review and automated validation required  
**Date:** 31 October 2026  
**Migration:** 11 — `payment-refund-reversal-events`  
**Depends on:** M8-02A customer receipts, M8-02B allocation/release history, docs/13 and docs/14

## Delivered behaviour

- Record a real customer refund as a separate append-only event linked to its source receipt.
- Capture refund amount, effective payment date, refund method, reason, idempotency key and recorded timestamp.
- Permit partial refunds and multiple refunds, but never exceed the source receipt's remaining refundable amount.
- Require all active allocations on the source receipt to be explicitly released before a refund.
- Reverse an erroneous receipt through a separate compensating event. The original receipt is retained.
- Reverse an erroneous refund entry through a separate compensating event referencing the original refund. This corrects the ledger entry; it does not claim that cash was returned to the business.
- Require a reason and idempotency key for each refund/reversal command.
- Derive customer unallocated advances after active allocations, net refunds and reversed receipts.
- Prevent allocations against refunded or reversed receipt value.
- Validate ownership, available balances and dependent event state inside SQLite write transactions.

## Event distinctions

| Event | Meaning | Balance effect |
|---|---|---|
| Refund | Money actually returned to the customer | Reduces available customer advance |
| Reverse receipt | Corrects an erroneous receipt record | Removes the receipt amount from available advance |
| Reverse refund | Corrects an erroneous refund record | Restores the refund amount to the ledger balance; does not record a cash receipt |

## Safety rules

- A receipt with active allocations cannot be refunded or reversed. The user must release allocations first, with reasons and full allocation history retained.
- A receipt with a net refund cannot be reversed until its refund entries are corrected/resolved.
- A reversed receipt cannot receive a new refund or allocation.
- A refund reversal can occur only once per original refund.
- A receipt reversal can occur only once per source receipt.
- Refund and reversal amounts are positive exact INR values; no floating-point arithmetic.
- All events are business-scoped and idempotent.
- No payment gateway credentials or banking secrets are stored.

## Migration and compatibility

Migration 11 is additive. It creates `payment_adjustment_event` and indexes for one-time receipt/refund reversals and customer history. Migrations 1–10 are unchanged. Existing receipt, allocation and invoice rows are not rewritten.

The customer advance projection now subtracts active allocations, net refunds and reversed receipts. Allocation availability also excludes refunded and reversed receipt value.

## Explicitly out of scope

- Statutory GST refund-voucher classification, numbering, rendering and Rule 51 particulars.
- GST time-of-supply or tax treatment for advances.
- Credit/debit notes and their effect on invoice receivables.
- Refund gateway integration, bank reconciliation or proof of actual bank transfer.
- UI screens, PDF receipts, multi-device synchronization and cross-device concurrency.
- Automated tests have been added but must be run by CI/reviewer before merge.

**Compliance boundary:** A money refund event is not automatically a statutory GST refund voucher. Statutory voucher automation remains gated on qualified GST-practitioner review under docs/13.
