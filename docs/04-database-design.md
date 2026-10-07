# Fledge Billing — Database Design

**Phase:** 4 of 8  
**Status:** Data model baseline  
**Version:** 1.0

## 1. Principles
Use normalized core entities, immutable finalized financial snapshots where needed, version references for tax/template calculations, and migration-controlled schema evolution.

## 2. Core Tables

### business
id, legal_name, display_name, address, district_id, state_id, pin_code, gst_registered, gstin, business_type, phone, email, logo_reference, created_at, updated_at

### state_ut
id, name, code, gst_state_code, type, country_code, active

### district
id, state_ut_id, name, code, active

### customer
id, business_id, name, phone, email, gstin, registration_type, billing_address, shipping_address, district_id, state_ut_id, pin_code, active, created_at, updated_at

### product_service
id, business_id, type, name, code, description, hsn_sac, unit, default_price, default_discount, tax_category_id, saved_gst_rate_id, tax_inclusive, active

### tax_rate
id, name, percentage, category, active, source_reference, effective_from, effective_to, rule_version_id

### gst_rule_version
id, version, effective_from, effective_to, source_reference, status, notes

### document
id, business_id, customer_id, document_type, status, document_number, financial_year, document_date, place_of_supply_state_id, gst_enabled, gst_rule_version_id, template_id, subtotal, discount_total, taxable_total, tax_total, grand_total, created_at, finalized_at, updated_at

### document_item
id, document_id, product_service_id, description_snapshot, hsn_sac_snapshot, quantity, unit, rate, discount_type, discount_value, taxable_value, gst_rate_snapshot, tax_inclusive, sort_order

### document_tax
id, document_id, document_item_id, tax_type, rate, taxable_value, amount, jurisdiction_state_id, rule_version_id

### document_charge
id, document_id, description, amount, taxable, sort_order

### payment
id, document_id, amount, method, payment_date, reference, notes, created_at

### number_series
id, business_id, document_type, financial_year, prefix, next_number, padding, active

### invoice_template
id, business_id, name, type, version, design_tokens, active

### template_section
id, template_id, section_key, label, sort_order, visible, configuration

### app_setting
id, key, value

### business_setting
id, business_id, key, value

### audit_event
id, business_id, entity_type, entity_id, action, actor_type, metadata, created_at

## 3. Snapshot Principle
Finalized financial documents store relevant descriptions, HSN/SAC, rates, addresses and tax calculation metadata as snapshots. Later editing of master product/customer records must not change historical invoices.

## 4. GST Rate Storage
A product may point to a saved user configuration. A finalized document stores the actual rate used plus the GST rule version.

## 5. State/UT Storage
Use foreign keys rather than free-text state names wherever possible. Historical documents retain the relevant state/UT context.

## 6. Money
Never use floating-point arithmetic for financial amounts. Use a decimal/numeric strategy with explicit currency precision and defined rounding rules.

## 7. IDs
Use stable internal IDs. Human-readable invoice numbers are separate from database IDs.

## 8. Schema Version
Store database schema version in migration metadata. Application startup must know the schema version before accessing domain data.

## 9. Future Entities
Possible later entities: branch, user, role, sync_event, e_invoice, e_way_bill, credit_note, debit_note, inventory, ledger, reconciliation.
