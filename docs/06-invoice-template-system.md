# Fledge Billing — Invoice & Template System

**Phase:** 6 of 8  
**Status:** Design baseline  
**Version:** 1.0

## 1. Principle
Invoice data, calculations and presentation are separate systems.

## 2. Document Model
A document contains business/customer snapshots, items, charges, tax results, totals, payment information, document metadata and a template reference.

## 3. Template Structure
Invoice Template
- Metadata
- Header
- Business
- Customer
- Custom Details
- Items
- Charges
- Tax Summary
- Payment
- Notes / Terms
- Footer

## 4. Template Controls
Templates may control visibility, order, labels, typography, spacing, alignment, borders, logo placement, brand colours, number/date formatting and page behaviour.

Templates must not alter financial calculations.

## 5. Built-in Templates
Initial template families:
- Standard
- GST
- Service
- Retail
- Quotation
- Receipt
- Bill of Supply

## 6. Custom Fields
Custom fields may be attached to supported business/customer/document sections. A custom field is presentation/data metadata, not an excuse to bypass domain validation.

## 7. GST Presentation
The template engine receives calculated tax components from the GST engine. It does not decide whether CGST, SGST/UTGST or IGST applies.

## 8. Editing
Draft documents can switch template and supported GST/non-GST settings. Finalized documents render from their stored snapshot and template version.

## 9. PDF
PDF generation consumes a deterministic render model. PDF output must be testable independently of UI.

## 10. Print / Share
Print and share use the same canonical invoice render model to avoid differences between screen, PDF and printed output.

## 11. Template Versioning
Templates have their own version. Updating a template must not change historical invoice calculations or snapshots.

## 12. Future
Possible later features: drag-and-drop designer, user-uploadable templates, marketplace templates, multilingual templates, thermal printer layouts.
