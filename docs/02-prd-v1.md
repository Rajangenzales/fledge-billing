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
DRAFT → FINALIZED → PAID / PARTIAL / OUTSTANDING

Other controlled states may include CANCELLED, VOIDED, REVISED, or document-specific correction states.

Drafts are editable. Finalized documents preserve history.

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
Support payment method, amount, date, reference, notes and payment status. Payment QR information may be configured at business level.

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
