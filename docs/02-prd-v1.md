# Fledge Billing — PRD V1

**Phase:** 2 of 8  
**Status:** Product specification baseline  
**Version:** 1.0

## 1. Objective
Build a local-first Indian billing application that lets a business configure its identity, customers, products/services, GST settings, invoices, payments and invoice presentation without requiring internet access for routine billing.

## 2. Core User Flow
1. First launch → Business Setup.
2. Select State/UT and enter business details.
3. Configure GST registration and GSTIN where applicable.
4. Create products/services and customer records.
5. Create invoice.
6. Select document type and GST treatment.
7. Add line items, discounts and charges.
8. Calculate totals and taxes.
9. Save as draft or finalize.
10. Generate PDF / print / share.
11. Record payment.
12. Retrieve history later.

## 3. Business Setup
Fields: legal/business name, display name, address, district, State/UT, PIN, phone, email, GST registration status, GSTIN, business type, logo, invoice preferences, payment details.

State/UT selection is mandatory for the billing context.

## 4. Customer
Fields: name, phone, email, billing address, shipping address, district, State/UT, PIN, GSTIN, registration type, notes.

Customer State/UT must be available to the GST engine.

## 5. Product / Service
Fields: name, type, SKU/code, HSN/SAC, unit, default price, default discount, tax category, saved GST rate, tax-inclusive flag, active/inactive.

The saved GST rate is user configuration and must remain distinguishable from versioned tax rules.

## 6. Documents
Initial document types:
- Tax Invoice
- Non-GST Invoice
- Bill of Supply
- Quotation
- Receipt

Quotation and receipt may share infrastructure but must not be confused with a tax invoice.

## 7. Invoice Lifecycle
DRAFT → FINALIZED → CANCELLED (where cancellation is permitted)

Payment state is separate and derived from payment events and allocations: UNPAID / PARTIALLY PAID / PAID, with customer credit tracked separately. These payment states must not be stored as document lifecycle states.

Other controlled document states may be introduced only where required by an approved document workflow. Drafts are editable. Finalized documents preserve history and are not silently rewritten.

## 8. GST UX
The invoice must clearly show:
- GST enabled/disabled state
- HSN/SAC
- taxable value
- applicable rate
- CGST/SGST/UTGST/IGST as applicable
- place of supply where required
- reverse-charge indication where applicable
- tax-inclusive/exclusive mode

GST calculations must be performed by the GST engine, not UI code.

## 9. Invoice Editing
A draft can be changed from GST to non-GST or vice versa when valid. Recalculation must occur from stored source values, not accumulated display values.

A finalized invoice cannot be silently rewritten. Controlled correction workflows are required.

## 10. Invoice Numbering
Invoice series must support prefix, sequence, financial year, document type, uniqueness, configurable starting number and safe concurrency/locking.

The GST compliance phase defines exact constraints.

## 11. Payments
Payments are separate financial events. Support payment method, amount, payment date, reference and notes. Payment status and outstanding balances are derived from valid payment events and allocations, not manually set on the invoice. Payment QR information may be configured at business level. See sections 21–22 and the dedicated M8 design for advances, allocations, refunds, receipts and credit/debit notes.

## 12. Templates
Provide professional built-in templates. A template may control header, customer block, custom details, items, charges, tax summary, payment block, notes, terms and footer.

Content and calculations remain independent from template presentation.

## 13. Offline Behaviour
Creating and editing normal billing data must work offline. Network access is reserved for optional services such as update checks, future synchronization and external integrations.

## 14. Update UX
Settings → Application → Updates:
- installed version
- GST Rules version
- Check for Updates
- latest release information
- update available notification
- release notes
- update action where supported

Mandatory updates must be exceptional and must not casually prevent access to locally stored billing data.

## 15. Error Handling
Errors must be human-readable. Financial calculations must fail safely. No invoice should be finalized if required data is invalid.

## 16. V1 Acceptance Criteria
A test user can configure an Indian business, create a customer and item, generate GST and non-GST drafts, finalize valid invoices, retrieve them offline, produce PDF/print output, record payment, and check for application updates.

## 17. Out of Scope
Full accounting, GST return filing, direct GST portal submission, e-invoice/e-way-bill integrations, payroll and advanced cloud operations are outside V1.

## 18. PRD Rule
Any feature added during development must be classified as V1, future, or rejected before implementation. Cursor must not invent product scope.


## 19. Billing Modes and GST Optionality

Fledge supports both GST and non-GST businesses. GST registration is a business-profile setting and is not mandatory for every Fledge customer. GST/non-GST document workflows remain subject to registration and transaction law; a GST-off setting is not permission to suppress tax where legally due. Drafts may change between supported modes with recalculation from source values. Finalized documents are immutable and corrections use controlled workflows. Domain/application support does not mean the customer-facing setup and invoice-entry UI is complete.

## 20. Invoice Date, System Timestamps and Due Date

The invoice/document date is explicitly selected and saved by the user, not inferred from record creation time.

- `invoice_date` / `document_date`: user-selected date printed on the invoice.
- `created_at`: actual system creation timestamp for internal audit.
- `finalized_at`: actual system finalization timestamp for internal audit.
- `due_date`: optional user-selected payment deadline.
- `updated_at`: actual system update timestamp where applicable.

Requirements:
1. Support user-selected past, current and future invoice dates, subject to validation and applicable legal/accounting restrictions.
2. Never silently replace the saved invoice date with today's date.
3. Never print today's date, a generated-on date, creation timestamp or finalization timestamp by default. A generated-on date may appear only when explicitly enabled by the user.
4. PDF/print must show exactly the saved invoice date.
5. Derive financial-year numbering from the selected document date, not system timestamps.
6. Technical acceptance of a date is not legal approval. Future/backdated GST documents require validation based on verified statutory rules.
7. Due date is optional and must not change invoice date or numbering.

## 21. Payments, Customer Advances and Adjustments

Support advance receipts before an invoice exists, unallocated customer advance balances, partial and multiple payments, allocation across invoices, allocation release/reallocation history, refunds/reversals with reasons and audit history, receipts linked to payment events, and credit/debit notes linked to original invoices with independent numbering, dates, reasons and immutable amount/tax snapshots.

Payment status is derived from valid payment events, allocations and approved note adjustments. It is not a document lifecycle state. A finalized invoice remains finalized while unpaid, partially settled or settled. Payments, advances, refunds and note adjustments never rewrite the original invoice's date, line values, tax snapshot or grand total.

GST treatment of advances, receipt vouchers, credit/debit notes and reporting must follow verified current official sources. Do not assume every advance is taxable or every software note qualifies for statutory GST adjustment.

## 22. V1 Acceptance Additions

- Configure GST or non-GST business profiles, subject to legal eligibility and validation.
- Select past/current/future invoice dates where validation permits.
- Print the saved invoice date exactly; no automatic today/generated-on date.
- Keep creation/finalization timestamps internal and due date optional/separate.
- Derive numbering financial year from the saved document date.
- Record advances before invoice creation, show unallocated balances and allocate later.
- Record partial/multiple payments, reallocate with history, and record refunds/reversals without erasing original events.
- Issue linked credit/debit notes with independent dates/numbers/reasons and retained tax snapshots.
- Keep derived payment status separate from document lifecycle.
- Preserve finalized financial documents immutably.
