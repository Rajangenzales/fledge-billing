# Fledge Billing — M8 Payments, Advances & Financial Adjustments Design

**Status:** Product/technical design baseline; M8-02A/B/C payment-event foundations implemented; M8-03 note design documented; statutory/accounting decisions remain open  
**Version:** 1.1  
**Date:** 2026-10-31  
**Related:** docs/02-prd-v1.md, docs/04-database-design.md, docs/05-gst-compliance-spec.md, docs/06-invoice-template-system.md, docs/08-roadmap-and-cursor-contract.md, docs/10-m5-to-m8-implementation-contract.md

## 1. Purpose and implementation baseline

M8 adds a traceable financial-event model for customer receipts, advances, allocations, refunds/reversals, receipts and linked credit/debit notes.

The read-only audit found no payment domain model, payment repository/use case, payment migration, advance/allocation/refund workflow or credit/debit-note implementation. Existing `paymentDetails` is unstructured business-profile text. The standalone receipt document is not linked to payment events. Existing `partial`/`paid` document status values conflict with the required separation of document lifecycle and payment state.

This is a design, not permission to begin implementation before statutory and product decisions are resolved.

## 2. Product principles and billing dates

- GST is optional at business-profile level. GST/non-GST use remains subject to registration and transaction law.
- Preserve the actual issue date on finalized documents. Future dates may be used on drafts/pro-forma documents only; historical imports must retain their original issue date and a separate system-entry timestamp. Do not backdate a newly issued invoice to misrepresent its issue date.
- Follow the statutory/product decision record in docs/13-m8-01-gst-compliance-and-product-decisions.md for goods/service invoice timing, advances, receipt/refund vouchers and credit/debit-note treatment.
- `document_date` / `invoice_date` is the saved user-selected date and the date printed on the invoice.
- `created_at` and `finalized_at` are actual system timestamps for internal audit, not invoice dates.
- `due_date` is optional and separate. `payment_date` records the actual receipt/refund date.
- Do not print today's date, creation/finalization timestamps or generated-on date by default. Generated-on display requires explicit user choice.
- Financial-year numbering follows the saved document date.
- Future/backdated technical acceptance is not legal approval. Verify statutory invoice timing and tax-point consequences before implementing finalization guards.
- Finalized invoices, tax snapshots and party identity snapshots are immutable.
- Payments, allocations, refunds and notes are separate financial events; they never rewrite the original invoice.
- Retries must be idempotent and offline-safe.

## 3. Payment events

A payment event records money received from a customer or refunded to a customer. Conceptual fields: stable ID, business/customer IDs, event type (receipt/refund), positive exact INR amount, user-selected payment date, method, reference, notes, idempotency key, status and timestamps. Direction is represented by event type, not negative money.

Never store card numbers, CVV, UPI PINs, banking passwords or provider secrets. Fledge records payments; it is not a payment processor.

## 4. Customer advances and allocations

A receipt may exist before an invoice. It is associated with a business and customer and initially contributes to that customer's unallocated advance balance. Show received, allocated, refunded/reversed and currently unallocated amounts. Advances cannot cross business/customer boundaries.

Use a separate allocation relationship between receipt events and finalized invoice receivables. A receipt may be allocated across multiple invoices; an invoice may receive multiple receipts. Conceptual fields: allocation ID, business ID, payment-event ID, document ID, exact amount, allocation timestamp and audit metadata.

- Allocate and release/reallocate transactionally.
- Reallocation is a release/reversal event plus a new allocation. Never overwrite history.
- Do not allocate more than the receipt's available unallocated amount or invoice's eligible outstanding amount.
- Default: reject over-allocation. A user may explicitly retain excess money as unallocated customer advance; never convert it silently.
- Validate business/customer/document ownership on every operation.
- Use idempotency keys for allocation commands.

## 5. Refunds, reversals and corrections

- A refund is a distinct event linked to the original receipt and customer, with amount, date, method/reference and reason.
- Reversal/void of an erroneous receipt or allocation preserves the original event and creates an auditable compensating event.
- Never silently delete or edit a recorded payment.
- Partial refunds cannot exceed the unreversed receipt amount.
- Refunding an allocated receipt must explicitly release/reverse affected allocations in the same transaction and preserve history.
- Refunds/reversals do not alter invoice grand total or GST snapshots.
- Customer advances may be refunded before allocation, subject to available balance and explicit confirmation.

## 6. Derived balances and payment status

Conceptual calculation, subject to approved note-accounting policy:

`net_receivable = invoice_grand_total + applicable_debit_note_adjustments - applicable_credit_note_adjustments`

`outstanding = net_receivable - valid_payment_allocations`

Do not double-count a note and an allocation. Define whether a credit note reduces receivable, creates customer credit or triggers refund, and how debit notes are applied, before implementing the formula.

Derived states:
- **Unpaid:** no valid allocation and positive outstanding.
- **Partially paid:** valid allocations exist and positive outstanding remains.
- **Paid/settled:** outstanding is zero under approved adjustment/rounding policy.
- **Customer credit:** unallocated receipts or approved excess credit are tracked at customer level, not as negative invoice outstanding.

Document lifecycle remains draft/finalized/cancelled. Payment status is separate and derived. A finalized invoice can be unpaid, partially paid or paid. Safely migrate any legacy `partial`/`paid` lifecycle values if persisted.

Default overpayment policy: reject allocation above outstanding. If user explicitly chooses to retain excess, record it as unallocated customer credit with confirmation and audit history.

## 7. Credit notes and debit notes

Credit/debit notes are independent financial documents linked to an original finalized invoice. Each has stable ID, business/customer identity, original invoice reference/number, independent document type and number series, user-selected date and financial year, reason code/text, adjustment lines, amount/tax snapshots, timestamps and audit history.

A credit note records an eligible reduction/correction and may reduce receivable, create customer credit or lead to a refund under the approved workflow. A debit note records an eligible increase/correction and may increase receivable.

Never edit the original invoice. Reject draft, unrelated or cross-business references. Preserve original invoice, note, tax and allocation history. Do not conflate a commercial credit/debit adjustment with a statutory GST credit/debit note unless compliance review confirms the applicable treatment. GST eligibility, particulars, deadlines, reporting and tax adjustments must be verified from current official sources.

## 8. Receipts

Generate a receipt from a recorded payment event, not as an unrelated manually paid document. It links to the payment and shows invoice allocation details where applicable. A receipt does not itself mark an invoice paid; allocation determines settlement. Receipt number/date and whether it is a statutory GST receipt voucher are separate decisions requiring official-source verification.

## 9. GST and non-GST requirements

- GST/non-GST modes depend on business profile and applicable law; a toggle cannot suppress tax legally due.
- Saved user rates are not proof of legal applicability. Official rates/rules must be effective-dated and versioned.
- Do not infer place of supply solely from supplier/customer state equality.
- Advance GST treatment depends on supply type, registration and current law. Do not automatically calculate GST on every advance.
- Determine when a receipt voucher or other prescribed document is required.
- Credit/debit note tax snapshots must use verified rules and retain the original invoice relationship.
- If required facts/rules are unavailable, block automatic tax treatment and show an actionable compliance error.

The initial official-source review and proposed decisions are recorded in docs/13-m8-01-gst-compliance-and-product-decisions.md. Product-owner approval and qualified GST-practitioner review remain required for its open items. Use current CGST/IGST/UTGST Acts and Rules, CBIC notifications/circulars and GST Portal guidance. Record source, section/rule, effective date, version and tested example. Neither this design nor the decision record is legal advice or permission to automate unresolved treatment.

## 10. Numbering and rendering

- Invoice number financial year follows saved invoice date.
- Credit/debit notes use independent document-type series and financial year derived from their own saved dates.
- Payment events and allocations do not consume invoice/note numbering. Receipt numbering is an explicit product/compliance decision.
- Number allocation must be transaction-safe. Multi-device offline uniqueness remains a separate sync design gate.
- PDF/print shows exact saved invoice/note date. Due date appears only when configured. Payment date appears on payment/receipt documents as appropriate.
- Do not automatically print today's date, `created_at`, `finalized_at` or generated-on date.
- Canonical rendering consumes snapshots and never recalculates tax, totals, balances or payment status.

## 11. Persistence and migration direction

Conceptual target entities, subject to inspection of actual schema and migration registry:
- `payment_event`: receipt/refund, business/customer, amount, method, date, reference, reason, idempotency key and timestamps.
- `payment_allocation`: receipt-to-invoice allocation.
- Immutable allocation event/history for allocate/release/reallocate.
- Customer credit/unallocated advance derived from events where practical, not maintained as the only mutable source of truth.
- Credit/debit note document entities with original invoice link, note number/date/reason, lines and tax snapshots.
- Typed business payment settings separate from payment events.

Use contiguous numbered transactional migrations. Preserve current documents and migration history. Enforce business/customer/document foreign keys and indexes. Add idempotency uniqueness constraints. Test fresh database and upgrade from current schema version 8. Migrate legacy lifecycle/payment status safely. Never rewrite finalized invoice totals, tax rows, date or identity snapshots. Do not assume conceptual tables in docs/04 already exist in SQLite.

## 12. Domain/application operations

Expected operations (names illustrative): record customer receipt/advance; allocate receipt; release/reallocate allocation; record refund; reverse/void receipt or allocation with reason; calculate customer unallocated advance; calculate invoice outstanding and derived payment status; issue/finalize credit note; issue/finalize debit note; generate receipt from payment event; retrieve customer payment/adjustment history.

Every command validates business/customer/document ownership, amount, event state, date policy, idempotency and available balance. Multi-record changes run in one transaction. UI never calculates balances.

## 13. Dependencies

- **M5:** M8 depends on stable finalized totals and immutable GST snapshots. Statutory treatment of invoice dates, advances and notes must be source-backed.
- **M6:** Complete supplier/customer identity snapshots and typed payment settings; historical rendering must not read mutable party master data.
- **M7:** Canonical render model must preserve date, due date, party snapshots, payment allocations and note tax snapshots without recalculation or automatic current date.
- **M8:** Build only on finalized immutable documents.

Recommended sequence: resolve M5 legal/date gaps; complete M6 identity snapshots and required fields; stabilize M7 canonical rendering; then implement M8 ledger and adjustment workflows.

## 14. Acceptance tests

- GST/non-GST business profile and draft editing rules.
- Past/current/future date policy and statutory validation.
- Exact saved date in PDF/print; no today/generated-on date unless configured.
- Separate created/finalized/due/payment dates; financial year from saved date.
- Advance before invoice and accurate unallocated customer balance.
- One receipt across invoices and multiple receipts on one invoice.
- Partial/full payments; release/reallocation with history.
- Cross-business/customer allocation rejection.
- Idempotent retry and concurrent-write safety.
- Refund/reversal reason and immutable original event; refund cannot exceed refundable amount.
- Invoice total, tax, date and identity snapshots unchanged.
- Linked credit/debit notes with independent numbering/date/reason/tax snapshots.
- Receipt generated from payment event and linked to payment/allocation.
- Document lifecycle separate from derived payment state.
- Migration preserves old records and safely handles legacy status values.
- Offline restart/retry preserves event/allocation history.

## 15. Open decisions before implementation

1. Which future-dated GST documents may be finalized, and what warnings/blocks apply?
2. Which advance scenarios require GST time-of-supply treatment or receipt vouchers?
3. Does a credit note reduce invoice receivable, create customer credit or trigger refund?
4. How exactly does a debit note affect the original invoice balance?
5. What backdating/date-range policy applies to each document type?
6. Should receipt numbering be independent, and when is it a statutory receipt voucher?
7. How are payments resolved when an invoice is cancelled?
8. How can an unallocated customer advance be refunded?
9. What balance/status labels are used for excess credit?
10. Which party identity/address/GSTIN fields must be snapshotted for invoices, receipts and notes?

Resolve product decisions with the owner and legal treatment from current official sources. Do not silently guess.

## 16. M8 delivery status and remaining sequence

The original issue sequence below is superseded by the merged implementation and focused design records:

- **M8-01 — Compliance/product decisions:** research baseline in [docs/13](./13-m8-01-gst-compliance-and-product-decisions.md). Open statutory and accounting decisions remain gated on owner approval and qualified GST-practitioner review.
- **M8-02A — Customer receipts/advances:** implemented in migration 9; receipt events, idempotent recording and derived customer advance.
- **M8-02B — Allocations/releases:** implemented in migration 10; append-only allocation/release events and derived invoice settlement.
- **M8-02C — Refunds/reversals:** implemented in migration 11; append-only refund and receipt/refund reversal events with derived advance adjustments.
- **M8-03 — Credit/debit note domain design:** documented in [docs/16](./16-m8-03-credit-debit-note-domain-model.md). Design only; no note schema, tax logic or workflow is authorized.
- **M8-04 onward — Note implementation, statutory voucher classification/rendering, customer-ledger integration and remaining payment rendering/settings:** sequence and scope must be re-baselined after open owner/accountant and practitioner decisions are resolved.

Keep each implementation issue focused. Preserve immutable finalized documents and event history. Stop on legal ambiguity or any risk of rewriting finalized financial history.
