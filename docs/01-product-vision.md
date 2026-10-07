# Fledge Billing — Product Vision

**Phase:** 1 of 8  
**Status:** Approved product baseline  
**Version:** 1.0  
**Last reviewed:** 2026-10-07

## 1. Vision

Fledge Billing is an India-ready, local-first billing application for small and growing businesses. It supports GST and non-GST billing, configurable invoices, Indian State/UT awareness, offline operation, server-distributed updates, and versioned tax rules.

Kerala is an initial practical context, not a geographic limitation. The product is designed for all Indian States and Union Territories from the foundation.

## 2. Mission

Make Indian business billing simple, professional, flexible, maintainable, and safe.

## 3. Product Principles

### India-first
All Indian States and Union Territories are first-class master data. Business state/UT, customer state/UT, and applicable place-of-supply rules feed billing decisions.

### GST as a rules engine
GST calculations are separated from invoice presentation and generic billing math. Rates, classifications, effective dates, and rules are versioned and updateable.

### User configuration vs tax rules
Users may save/select GST percentages for products/services. This configuration must remain distinct from the authoritative/versioned GST rules layer.

### Draft flexibility, finalized integrity
Draft invoices can be edited, including GST/non-GST mode where valid. Finalized documents must not be silently overwritten. Corrections use controlled revision, cancellation, credit/debit note, or replacement workflows as appropriate.

### Local-first
Core billing works offline and stores data locally first. The architecture remains cloud-ready for future synchronization and multi-device services.

### Updates are a product feature
Users receive the application through a server-hosted distribution mechanism. Fledge includes Check for Updates, in-app notifications, release notes, compatibility checks, and safe database migrations.

### Templates are data-independent
Invoice content is separated from presentation. Templates control sections, fields, visibility, labels, and design tokens without changing billing data.

## 4. Primary Users

- Retailers
- Wholesalers and distributors
- Manufacturers
- Service businesses
- Freelancers and professionals
- Local shops
- Small businesses needing GST or non-GST invoices

Future users may include accountants, branches, multi-user organizations, and cloud-connected businesses.

## 5. V1 Scope

### Billing
- Customers
- Products/services
- Invoices
- Line items
- Quantity, unit, rate, discount, taxable value and charges
- Payments/payment status
- Financial-year invoice numbering
- PDF, print and share

### GST
- GST on/off workflow
- GSTIN
- HSN/SAC
- Configurable GST rates
- Tax-inclusive and tax-exclusive pricing
- CGST
- SGST/UTGST
- IGST
- Supplier state/UT
- Customer state/UT
- Place of supply
- Reverse-charge foundation
- Exempt/nil-rated foundation
- Bill of Supply foundation
- Versioned GST rules

### India master data
- All States and Union Territories
- GST/state codes
- State/UT type
- District/PIN architecture for expansion
- Financial-year handling

### Customization
- Business identity
- Address/GSTIN/logo
- Invoice templates
- Custom labels/sections/fields
- Brand colours and design tokens
- Payment information

### Updates
- Server release metadata
- Check for Updates
- In-app update notification
- Release notes
- Minimum supported version
- Database migration handling

## 6. V1 Non-Goals

The first implementation will not silently expand into:

- Full GST return filing
- Direct GST portal filing
- Full e-invoice integration
- E-way bill integration
- Automated reconciliation
- Full accounting/ledger
- Payroll
- Inventory accounting
- Advanced cloud multi-tenancy
- Unrestricted form building
- Automated tax advice

These may become future modules.

## 7. Conceptual Product Model

```text
Business + Customer + Items
          ↓
     Billing Engine
          ↓
     GST Rules Engine
          ↓
   Document Calculation
          ↓
    Invoice Document
          ↓
 Template / PDF / Print / Share
```

Supporting masters and versions:

```text
State/UT Master
GST Rules
Tax Rates
HSN/SAC Data
Invoice Number Series
Application Version
Database Schema Version
Template Version
```

## 8. Versioning

Fledge tracks at least four independent versions:

```text
Application Version      1.0.0
Database Schema Version  1
Template Engine Version  1
GST Rules Version        YYYY-MM
```

A release can therefore update software and GST rules independently while preserving compatibility information.

## 9. V1 Success Criteria

A business must be able to configure itself, select its State/UT, create customers and products/services, create GST or non-GST invoices, select applicable GST rates, calculate taxes correctly, operate offline, preserve billing data, generate/print/share invoices, and safely receive software updates.

## 10. Quality Bar

Priority order:

1. Calculation correctness
2. Data integrity
3. Document numbering
4. Transparent tax treatment
5. Reliable offline storage
6. Safe upgrades/migrations
7. Maintainable rules
8. Clear UX
9. Testability

## 11. Regulatory Boundary

Fledge Billing is software and is not a substitute for professional tax advice. GST rates, notifications, classifications, place-of-supply rules, invoice requirements and portal processes can change. Compliance-sensitive rules must therefore be versioned, sourced, dated and updateable.

Official baseline sources:

- CBIC Tax Invoice Rules: https://cbic-gst.gov.in/gst-invoice-rules.html
- GST Portal GSTR-1 guidance: https://tutorial.gst.gov.in/userguide/returns/Creation_of_Outward_Supplies_Return_in_GSTR-1.htm
- CBIC CGST Act: https://cbic-gst.gov.in/hindi/CGST-bill-e.html
- CBIC UTGST Act: https://cbic-gst.gov.in/hindi/UTGST-bill-e.html

## 12. Phase 1 Exit Criteria

- India-wide scope locked
- State/UT-aware billing locked
- GST/non-GST billing locked
- Configurable GST rates locked
- Versioned GST rules locked
- Draft/finalized document behaviour locked
- Local-first operation locked
- Server distribution and updates locked
- Template/customization direction locked
- V1 boundaries locked

Phase 2 may begin from this baseline.
