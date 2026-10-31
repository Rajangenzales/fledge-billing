# Fledge Billing — M8-04 Payment Receipt Generation

**Status:** Design and implementation contract; ordinary payment receipt only  
**Version:** 1.0  
**Date:** 31 October 2026  
**Depends on:** docs/12, docs/14, docs/15 and M8-02A/B/C

> This document covers a commercial acknowledgement of money received. It does not define or generate a statutory GST receipt voucher under CGST Act section 31(3)(d) or Rule 50. Statutory voucher classification and GST treatment remain subject to qualified GST-practitioner review.

## 1. Purpose

Generate a printable/PDF payment receipt from an existing, persisted `customer_receipt` event. The receipt acknowledges a recorded payment; it is not an invoice, tax invoice, receipt voucher, refund voucher, credit note or debit note.

The payment event remains the source of truth. Rendering must not create a payment, allocation, refund, invoice or tax event.

## 2. Current repository boundary and prerequisite

M8-02A stores receipt identity, business/customer IDs, amount, currency, payment date, method, reference, notes, idempotency key and recorded timestamp. It does **not** snapshot business or customer identity fields.

The existing invoice render path uses saved document totals and dates, but historical party details for older documents may still be sourced from current master records. That approach is not acceptable for a durable payment receipt: changing a customer name/address or business contact after receipt recording must not silently rewrite a previously issued receipt.

Therefore M8-04 must be delivered in two focused implementation slices:

- **M8-04A — Receipt-time identity snapshots:** add an additive migration and capture the business/customer display particulars at the same transaction that records a new receipt. Existing receipt rows must not be backfilled from today's mutable master records and represented as historical truth. They remain explicitly marked as legacy records without a receipt-time snapshot.
- **M8-04B — Receipt render and export:** render ordinary payment receipts from the receipt event plus its immutable snapshots; provide printable text and local PDF export. A legacy receipt without snapshots must be clearly identified as lacking historical identity snapshots or be blocked from formal PDF issue until the user resolves it through an approved process. Do not silently substitute current master details.

## 3. Receipt content contract

A rendered ordinary payment receipt should include, where captured:

### Business / issuer
- Legal or trading name according to the approved display preference.
- Address.
- Phone and email.
- GSTIN only as an identity detail when registered; displaying it does not make the receipt a statutory voucher.
- Logo only if the selected logo is intentionally included as a current branding asset; historical logo snapshot policy is still open.

### Customer / payer
- Customer name.
- Billing address.
- Phone and email.
- GSTIN and registration status where present in the receipt-time snapshot.

### Payment event
- Clearly labelled **Payment Receipt** or **Receipt**.
- Stable receipt number/reference. M8-02A currently has an internal ID and idempotency key but no human-facing receipt number. Numbering format, series, financial-year rule and uniqueness need an owner decision before inventing a number.
- Receipt date exactly as saved in `payment_date`.
- Amount in INR, formatted from the stored exact decimal value.
- Payment method.
- External transaction/reference number, if supplied.
- Notes, if supplied and appropriate for customer-facing output.
- Recorded/issued timestamp must not replace the saved payment date or be printed by default.

### Allocation information
- The receipt can exist before an invoice and can be partially or fully unallocated.
- If allocation details are shown, they must be read from the append-only allocation/release event history and clearly distinguish active allocations from released allocations.
- Never imply that an unallocated advance has been applied to an invoice.
- Rendering a receipt must not change allocation state or customer advance balance.

### Refund and reversal information
- A receipt PDF is a historical acknowledgement of the original receipt event.
- A later refund, receipt reversal or refund reversal does not rewrite the original receipt.
- A separate account statement or adjustment history may show subsequent events; do not silently alter the original receipt.
- Do not call a payment receipt a refund voucher.

## 4. Snapshot contract

M8-04A should snapshot the identity fields available at receipt time, at minimum:

- Business: legal name, display name, address, state identifier/name, PIN code, GST registration flag, GSTIN, business type, phone and email.
- Customer: name, phone, email, GSTIN, registration type, billing address, shipping address, state identifier/name and PIN code.

The snapshot is a historical display record, not a fresh GST determination. The exact display choice between legal and display name should follow the approved invoice identity/display preference if one exists; otherwise retain both and choose a clearly documented display rule.

Snapshot capture must happen atomically with receipt insertion. A retry with the same business-scoped idempotency key must return the original receipt and its original snapshots, even if master data has since changed.

Do not backfill old receipt snapshots using current business/customer master data. A migration may add nullable snapshot columns or a related snapshot record. Existing records without evidence of historical values must remain explicitly legacy/unavailable, not falsely reconstructed.

## 5. Numbering decision

The current receipt event has an internal ID, not an approved customer-facing receipt number.

Before M8-04B exposes a numbered receipt, the owner must decide:
- Whether ordinary payment receipts need a human-facing serial number.
- Whether the series is independent from invoice and statutory receipt-voucher series.
- Prefix, sequence, financial-year basis, uniqueness scope and maximum length.
- Whether numbering is assigned at payment recording or at first formal receipt issue.
- How retries, reversals and legacy records are represented.

Until decided, use the stable internal receipt reference only if the owner accepts that it is an internal reference, and label it accurately. Do not reuse invoice numbering or claim statutory serial-number compliance.

## 6. Rendering and export invariants

- Render from the persisted receipt event and receipt-time snapshots only.
- No current-date insertion; display the saved payment date exactly.
- Exact INR arithmetic and formatting; no floating-point calculations.
- A rendering/export request is read-only and idempotent.
- Re-exporting the same receipt produces the same financial and identity content, subject only to explicitly selected non-historical branding assets.
- Filename must be safe and derived from the stable receipt reference and saved payment date.
- PDF output must not recalculate GST or present a tax breakdown.
- Local export must use the existing safe partial-file then rename pattern.
- No network transmission, payment gateway, email/WhatsApp delivery or cloud sync is included in this slice.
- Do not store card credentials, CVV, UPI PIN, banking passwords or provider secrets.

## 7. Acceptance criteria

### M8-04A
- Additive migration only; preserve migrations 1–11.
- New receipts capture business/customer snapshots atomically.
- Idempotent retries return the originally saved snapshots.
- Editing business/customer master data later does not change receipt snapshots.
- Existing receipts are not backfilled from current master records.
- Business/customer ownership validation remains enforced.
- Fresh database and version-11 upgrade tests cover the new migration.
- No payment, allocation, refund or invoice totals are changed.

### M8-04B
- Retrieve a receipt only within the active business.
- Print/PDF content includes the approved receipt fields and saved payment date.
- Legacy records without snapshots are visibly distinguished or blocked from formal export according to owner decision.
- Active allocation details, if shown, are derived from event history and are not confused with original receipt amount.
- Refunds/reversals do not rewrite the original receipt.
- Export is read-only, safe, deterministic and uses the existing local export conventions.
- Tests cover exact INR formatting, special characters, long content, missing optional fields, legacy records and repeated export.

## 8. Explicit exclusions

M8-04 does not:
- generate a statutory GST receipt voucher or refund voucher;
- determine whether GST is payable on an advance;
- calculate or display GST on the payment receipt;
- issue invoice numbers or change invoice numbering;
- mutate invoice/payment/allocation/refund events;
- create an allocation when rendering;
- add email, WhatsApp, payment gateway or cloud delivery;
- implement credit/debit notes or customer-ledger accounting policy.

## 9. Delivery sequence

1. Owner confirms the ordinary receipt label, human-facing numbering requirement and legacy-record export treatment.
2. Implement M8-04A receipt-time snapshots in a focused migration/PR.
3. Verify fresh and upgrade migrations, idempotency and snapshot immutability.
4. Implement M8-04B print/PDF export from the immutable receipt snapshot.
5. Run the full typecheck, build and test suite in CI before merge.
6. Keep statutory receipt-voucher automation blocked until qualified GST-practitioner review and the applicable source/effective-date checks are recorded.

**Stop condition:** If the receipt number, legacy-record handling or snapshot display policy is not approved, do not invent it in code.