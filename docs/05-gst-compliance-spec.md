# Fledge Billing — GST Compliance Specification

**Phase:** 5 of 8  
**Status:** Compliance design baseline; rates/rules require periodic official-source review  
**Version:** 1.0  
**Last reviewed:** 2026-10-07

## 1. Purpose
Define how Fledge represents Indian GST without embedding unstable tax assumptions in application code.

## 2. Official Source Hierarchy
Compliance-sensitive implementation should prioritize:
1. CGST Act / IGST Act / UTGST Act and rules
2. Official CBIC notifications/circulars
3. Official GST Portal guidance
4. Other official government publications

Every implemented rule should retain a source/reference and effective date.

## 3. Invoice Baseline
The application must support Rule 46-style tax invoice particulars including supplier identity/GSTIN where applicable, consecutive invoice number, date, recipient information, HSN/accounting code, description, quantity/unit for goods, value/taxable value, tax rate and tax amount, place of supply for applicable inter-State supplies, reverse-charge indication and signature/digital signature requirements as applicable.

## 4. Invoice Number
GST invoice numbering must support consecutive numbering, uniqueness for the financial year, and applicable character/length constraints. Exact validation rules must be encoded from current official rules and GST Portal guidance, not guessed.

## 5. State / UT
Maintain all Indian States and Union Territories with their GST/state codes. Supplier and recipient locations are structured data.

## 6. Supply Type
The GST engine must determine tax treatment from the applicable legal context. It must not implement a universal shortcut of “same state = CGST + SGST” without considering place-of-supply and nature-of-supply rules.

## 7. Tax Components
The model supports CGST, SGST, UTGST, IGST and a Cess foundation. The engine determines which components apply.

## 8. GST Rate Model
Rates are data, not source-code constants. Each rate has classification/category context, effective dates, source/reference and rule version.

User-saved rates are configuration and do not replace the compliance rule layer.

## 9. Pricing Modes
Support tax-exclusive and tax-inclusive pricing. The engine must calculate from unrounded source amounts and apply defined rounding only at the specified stage.

## 10. Rounding
Rounding behaviour must be centralized in the calculation engine. UI must never independently round tax values.

## 11. HSN / SAC
Products/services support HSN/SAC fields. Classification data should be updateable independently of the core application.

## 12. Exempt / Nil-rated
The document model must distinguish taxable, exempt, nil-rated and other relevant tax categories where required. Tax treatment must affect document presentation and calculations.

## 13. Bill of Supply
Support Bill of Supply as a separate document type rather than a tax invoice with hidden tax fields.

## 14. Reverse Charge
Store reverse-charge status as explicit document metadata. Detailed RCM logic should be implemented only from verified applicable rules.

## 15. Place of Supply
Place of supply is a first-class field and engine input. Detailed goods/services rules must be encoded from applicable IGST Act/rules and official guidance.

## 16. GST Registration
Business GST registration status and GSTIN are separate fields. Customer GST registration status/GSTIN is also captured where applicable.

## 17. Historical Integrity
A finalized invoice retains the GST rule version, rate, tax component, taxable value and relevant location/classification snapshots used in its calculation.

## 18. Rule Updates
A software release may update GST rule definitions, tax rates, HSN/SAC reference data, validation rules and document requirements. Migration/update code must never silently recalculate historical finalized invoices.

## 19. Future Compliance Modules
Not V1: GSTR-1 filing, GSTR-3B assistance, e-invoicing, e-way bill, advanced RCM automation, reconciliation, portal integrations.

## 20. Official References
- CBIC Tax Invoice Rules: https://cbic-gst.gov.in/gst-invoice-rules.html
- CBIC CGST Act: https://cbic-gst.gov.in/hindi/CGST-bill-e.html
- CBIC IGST Act: https://cbic-gst.gov.in/hindi/IGST-bill-e.html
- CBIC UTGST Act: https://cbic-gst.gov.in/hindi/UTGST-bill-e.html
- GST Portal GSTR-1 guidance: https://tutorial.gst.gov.in/userguide/returns/Creation_of_Outward_Supplies_Return_in_GSTR-1.htm

## 21. Compliance Review Rule
Before every release that changes GST behaviour, verify the implementation against current official sources and record the review date and source references.
