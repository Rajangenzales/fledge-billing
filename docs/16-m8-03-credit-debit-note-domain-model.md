# Fledge Billing — M8-03 Credit/Debit Note Domain Model

**Status:** Design proposal only; owner decisions and qualified GST-practitioner review required  
**Version:** 1.0  
**Date:** 31 October 2026  
**Depends on:** docs/12, docs/13, docs/14 and docs/15  
**Scope:** Domain boundaries, immutable note records, invoice linkage, numbering, balance effects and implementation gates

> This document is a product/domain design proposal, not legal or tax advice. It does not approve statutory GST treatment, accounting entries, tax calculations, schema changes or implementation. Verify the Act, Rules, notifications and amendments applicable to each transaction date with a qualified GST practitioner.

## 1. Purpose and boundary

M8-02A, M8-02B and M8-02C provide receipt, allocation/release, refund and reversal foundations. M8-03 defines how credit/debit adjustments should fit beside those events without conflating them.

Three concepts must remain distinct:

1. **Statutory GST credit note:** a document intended to meet the applicable statutory credit-note requirements and, only when eligible, support the corresponding GST output-tax adjustment.
2. **Statutory GST debit note:** a separate linked document for an eligible increase in taxable value or tax under the applicable statutory provisions.
3. **Commercial customer-credit adjustment:** a business/customer-account adjustment that does not automatically claim a GST output-tax reduction. Its accounting and tax treatment requires an approved policy.

A money refund is not a credit note. A receipt allocation is not a credit note. A commercial discount, write-off or settlement is not automatically a statutory GST credit note. A debit note is not an edit to an invoice.

**This milestone is documentation only.** It introduces no migration, persistence model implementation, application command, numbering algorithm, tax calculation or rendered statutory document.

## 2. Source-backed statutory boundary

The current M8-01 research baseline describes:

- CGST Act section 34(1): credit-note grounds include taxable value/tax charged exceeding the correct amount, return of goods, or deficiency in goods/services.
- Section 34(2): declaration timing and conditions for reducing output tax, including the restriction where tax incidence and interest have been passed to another person.
- Section 34(3): debit note where taxable value/tax charged in the original invoice is lower than the correct amount.
- Section 34(4): debit-note details are declared in the return for the month of issue.
- CGST Rules Rule 53: prescribed particulars, including reference to corresponding invoice(s).

The M8-01 document records the currently researched section 34(2) deadline as 30 November following the end of the financial year of the underlying supply, or filing of the relevant annual return, whichever is earlier, reflecting the 2022 amendment. This must be re-verified against the law and effective dates applicable to the transaction. Do not hard-code this text as a timeless rule.

See [docs/13](./13-m8-01-gst-compliance-and-product-decisions.md), especially sections 4, 6, 7 and 8. That document's official-source list is the starting reference set, not a substitute for practitioner review.

## 3. Domain categories

| Category | Purpose | Tax effect | Customer-account effect |
|---|---|---|---|
| Statutory GST credit note | Document an eligible section 34(1) circumstance | Output-tax reduction only when current statutory conditions are met and approved | Not yet decided; must not be inferred |
| Statutory GST debit note | Document an eligible section 34(3) increase | Tax/return treatment follows applicable law and approved rules | Not yet decided; must not be inferred |
| Commercial customer-credit adjustment | Record a commercial credit/settlement that is not being claimed as a statutory GST output-tax reduction | No automatic GST output-tax reduction | Policy unresolved; could affect customer account only after owner/accountant approval |
| Cash refund | Record money actually returned | Not itself a credit note or GST tax adjustment | Implemented as a separate refund event under M8-02C |
| Receipt allocation/release | Apply/release received money against invoice receivable | No invoice tax mutation | Implemented as separate allocation events under M8-02B |

The application must require an explicit category. It must not infer category from a negative line, a refund, a discount, a payment, a reason phrase or a date.

## 4. Conceptual note record

A future note record is expected to preserve, at minimum, the following information. This is a conceptual contract, not a database schema.

### 4.1 Identity and lifecycle metadata

- Stable internal note ID.
- Business ID and customer ID.
- Explicit category and document type.
- User-selected note issue date.
- Actual created timestamp and actual finalized timestamp, stored separately.
- Optional due date only if an approved workflow requires it.
- Independent note number and series after D-07 is resolved.
- Lifecycle and correction/reversal history, with permitted transitions still subject to policy approval.
- Actor/audit metadata where available.
- Idempotency key for commands that can be retried.

Never substitute system date for the saved note date. Do not silently edit a finalized note or erase its history.

### 4.2 Original-invoice linkage

- Link to the original finalized invoice record, not only a free-text invoice number.
- Preserve the original invoice number and date as a snapshot for display/audit.
- Enforce same business and customer.
- Reject draft, unrelated, cross-business and cross-customer references.
- Preserve links if the original invoice later enters a correction/cancellation workflow.
- Support for one note referencing one or multiple invoices is unresolved. Do not implement multi-invoice linkage until legal/practitioner and product-owner review confirms the allowed workflow and its allocation semantics.

A free-text external reference may be retained for imported historical evidence, but it must not silently substitute for an internal original-invoice relationship where that relationship is required.

### 4.3 Reason and adjustment details

- Required reason classification and explanatory text.
- Adjustment lines or a structured adjustment breakdown.
- Quantity/unit/value references where relevant to the source transaction.
- Exact INR monetary values using the existing money abstraction; no floating-point arithmetic.
- Separate taxable value and tax-component snapshots where the approved statutory document requires them.
- Effective rule/source version and effective date for any future tax calculation.
- Supporting evidence reference/attachment metadata if later approved; no assumption that files are stored in this milestone.

The reason catalogue must be practitioner-reviewed. Do not create a generic reason such as “other” that permits statutory tax reduction without adequate facts and validation.

### 4.4 Party and tax snapshots

A finalized note should preserve supplier and recipient identity/address/GSTIN particulars required for that document, as well as relevant original-invoice and adjustment tax/value snapshots. It must not read mutable current customer/business master data to reconstruct a historical note.

The exact snapshot fields and whether the existing M5/M6 snapshot contracts are sufficient must be confirmed before implementation. No tax rate, place of supply, HSN/SAC or tax amount is calculated by this design.

## 5. Lifecycle and correction principles

Proposed safe principles:

1. Draft note data may be edited before finalization.
2. Finalized notes are immutable.
3. Corrections must be explicit, linked and auditable; no silent update/delete.
4. A cancellation or reversal is a distinct event/workflow and does not erase the original note.
5. Whether a finalized note can be cancelled, replaced or reversed, and what return/accounting consequences follow, remains an approval gate.
6. A note must not change the original invoice's stored total, tax snapshot, issue date, invoice number or party snapshot.
7. A note cannot be finalized until its category, original-invoice linkage, date, reason, required particulars and policy validations pass.
8. Future dates, historical imports, late notes and note issue-date controls remain unresolved. Do not copy invoice date rules blindly to notes.

Do not implement status transitions or correction semantics beyond these principles until the owner and practitioner approve them.

## 6. Numbering and dates

Credit and debit notes require independent numbering decisions. The design direction is a distinct document-type series, with uniqueness and financial-year treatment, but the exact format is open.

D-07 must decide:
- Whether credit and debit notes use separate series.
- Whether statutory and commercial adjustments use distinct series.
- Prefix and sequence format.
- Maximum length and allowed characters.
- Uniqueness scope and concurrency guarantees.
- Financial-year boundary and treatment of imported historical notes.
- Whether cancelled numbers remain permanently consumed.

Note date, created timestamp and finalized timestamp must remain distinct. The saved note date is the date displayed on the note. Financial-year derivation and date validation must not be implemented until the relevant date policy is approved.

## 7. Customer-balance and payment interactions

No balance formula is approved by this document.

For a credit note, owner/accountant decision is required between possible outcomes such as:
- reduce the receivable on the linked invoice;
- create an unallocated customer credit;
- create a customer credit that can later be allocated;
- trigger a separate cash refund workflow; or
- a controlled combination, with anti-double-counting rules.

For a debit note, owner/accountant decision is required on whether it increases the original invoice receivable, creates a separate receivable, or follows another accounting treatment. The note remains an independent document in every case.

Rules that must hold regardless of the selected accounting policy:
- A note never creates a cash movement. Actual cash returned is a separate refund event.
- A note never creates a payment allocation by implication.
- A refund and a credit-note balance effect must not count the same value twice.
- An allocation must not exceed the approved receivable after applicable approved adjustments.
- An invoice payment state remains derived and distinct from document lifecycle.
- Customer credit must not be represented as a negative invoice outstanding.
- No note effect is applied to the customer ledger until its category and accounting treatment are approved.

M8-02A/B/C remain the source for receipt, allocation, refund and reversal event semantics. See [docs/14](./14-m8-02-payment-advance-domain-model.md) and [docs/15](./15-m8-02c-refunds-and-reversals.md).

## 8. Decision register and gates

| Decision | Question to resolve | Required approver/evidence | Until resolved |
|---|---|---|---|
| D-05 | How is a commercial credit after the section 34 deadline classified and accounted for? | Owner + accountant/GST practitioner | No automatic tax reduction or customer-ledger effect |
| D-06 | What happens where tax incidence has been passed to another person? | Qualified GST practitioner | No output-tax reduction assumption |
| D-07 | What are the note series, format, uniqueness and FY rules? | Product owner + practitioner review of particulars | No numbering implementation |
| D-08 | What happens to notes/payments when the original invoice is cancelled? | Owner + accountant/practitioner | Block ambiguous workflows; preserve history |
| N-01 | Can one note reference multiple original invoices? | Practitioner + product owner | Design one-to-one as baseline; do not code until confirmed |
| N-02 | What note date/backdating/future-date/import rules apply? | Practitioner + product owner | No date validator or exception path |
| N-03 | What exact customer receivable/credit/refund effects apply to credit notes? | Owner + accountant | No note balance integration |
| N-04 | What exact receivable effect applies to debit notes? | Owner + accountant | No debit adjustment in outstanding formula |
| N-05 | Which identity, tax and line fields must be snapshotted? | GST practitioner + M5/M6 review | No persistence schema |
| N-06 | Which cancellation/correction transitions and reporting consequences are allowed? | Practitioner + product owner | No finalized-note correction automation |
| N-07 | What evidence and reason-code catalogue is required? | Practitioner + product owner | No statutory reason catalogue |

D-01 to D-04, D-09 and D-10 from docs/13 also remain open and may affect note eligibility or the broader M8 workflow. This document does not close them.

## 9. Proposed future application boundaries

These are names for discussion only, not approved APIs:

- Create/edit a draft note.
- Validate note category and original invoice linkage.
- Preview statutory particulars from immutable snapshots.
- Finalize a note using approved numbering and date policy.
- Retrieve note history by invoice/customer.
- Derive approved customer-ledger adjustments.
- Cancel/correct a note only through an approved compensating workflow.

Every command will need business/customer ownership checks, exact money validation, transactional writes, idempotency, audit history and explicit policy validation. No command should mutate a finalized invoice.

## 10. Acceptance criteria for a later implementation issue

A future implementation issue should not be opened until the approval gates are complete. When authorized, acceptance tests should cover:

- statutory GST credit note, statutory GST debit note and commercial customer-credit adjustment are distinct categories;
- required original invoice linkage and cross-business/customer rejection;
- immutable invoice and note snapshots;
- independent note numbering and concurrent uniqueness;
- exact issue date rendering and separate system timestamps;
- practitioner-approved statutory eligibility, particulars, deadlines and effective-dated rule references;
- commercial credit after statutory deadline does not automatically reduce output tax;
- tax-incidence condition is explicitly handled;
- credit-note and debit-note receivable effects follow the approved accounting policy;
- refunds and allocations are not double-counted with note effects;
- cancellation/correction preserves all historical events;
- idempotent retries and transaction rollback;
- fresh-database and upgrade migration tests, only if a schema is later approved.

## 11. Explicit non-goals

This milestone does not:
- create a schema or migration;
- implement credit/debit note persistence or UI;
- calculate or adjust GST;
- determine statutory eligibility automatically;
- choose accounting/receivable effects;
- create note numbering;
- render statutory note PDFs;
- generate receipt/refund vouchers;
- change receipt, allocation, refund or reversal code;
- approve multi-invoice notes, historical imports or cancellation semantics.

## 12. Implementation gate

Before code or migration:
1. Product owner resolves the product/accounting decisions in section 8.
2. A qualified GST practitioner reviews statutory categories, reasons, particulars, deadlines, passed-tax-incidence condition and date/cancellation edge cases.
3. Applicable Acts, Rules, notifications and amendments are checked for effective dates relevant to the transaction.
4. M5 tax snapshots, M6 party snapshots and M7 canonical rendering are inspected and confirmed adequate.
5. docs/12 and docs/13 are updated with approved decisions.
6. A separate focused implementation issue/PR is authorized.

Until then, this is a design-only milestone. Do not implement open decisions by inference.
