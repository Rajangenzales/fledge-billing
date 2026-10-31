# Fledge Billing — M8-01 GST Compliance & Product Decision Record

**Status:** Research baseline; owner approval and professional review required before M8 implementation  
**Version:** 1.0  
**Research date:** 2026-10-31  
**Scope:** Indian GST rules affecting invoice dates, advances, receipt/refund vouchers, credit notes and debit notes  
**Related:** docs/02-prd-v1.md, docs/05-gst-compliance-spec.md, docs/08-roadmap-and-cursor-contract.md, docs/12-m8-payments-advances-and-adjustments-design.md

> This is a product-engineering decision record based on publicly available official materials. It is not legal or tax advice. The CBIC materials surfaced for this review include consolidated pages and older FAQs; before release, the applicable Act, Rules, notifications and amendments must be checked for the transaction date and the taxpayer's facts by a qualified GST practitioner.

## 1. Executive decisions proposed

| Topic | Proposed Fledge decision | Basis / qualification |
|---|---|---|
| Meaning of invoice date | Treat it as the actual date the document is issued/finalized, not an arbitrary accounting date or system-generated date. Preserve it exactly in PDF/print. | CGST Act section 31 and Rule 46 require issue timing/date and prescribed particulars. |
| Future-dated tax invoice | Allow future dates on drafts/pro-forma documents only. Block finalization of a GST tax invoice whose issue date is later than the actual finalization date. | GST invoice timing is tied to removal/delivery for goods and prescribed timing for services. A future issue date must not disguise when a document was actually issued. |
| Historical/backdated records | Permit importing/recording an invoice that was genuinely issued earlier outside Fledge, with original issue date preserved and separate system entry timestamp. Do not permit users to finalize a newly issued invoice today with a false earlier issue date. | Product integrity control; the law prescribes issue timing. Practitioner review is required for late/missed invoice scenarios and corrective reporting. |
| Invoice numbering | Derive financial-year series from the genuine document issue date, while keeping number uniqueness and audit timestamps separate. | Rule 46 requires consecutive serial number(s) unique for a financial year. |
| Goods advances | Record the receipt and customer advance. Do not automatically calculate/pay GST on an advance for supply of goods where Notification 66/2017-Central Tax applies. Still generate the applicable receipt voucher for an advance received by a registered supplier. | Notification 66/2017 exempts payment of tax on advances for goods; section 31(3)(d) separately requires receipt voucher. Confirm scope and exceptions. |
| Services advances | Treat as potentially triggering GST time-of-supply on receipt, subject to section 13, classification, exemptions and applicable exceptions. Capture tax-relevant facts; never treat all advances as tax-free. | CGST Act section 13 and section 31(3)(d); Notification 66/2017 is not a general services exemption. |
| Receipt voucher | Model a statutory receipt voucher separately from an ordinary payment receipt. For registered suppliers receiving an advance against a supply, capture prescribed particulars and numbering. | Section 31(3)(d), Rule 50 and CBIC FAQ. |
| Refund voucher | When an advance was received, a receipt voucher issued, and no supply is made/no tax invoice follows, support a refund-voucher workflow with required particulars and link to the original advance. | Section 31(3)(e) and Rule 51. Refund of money and statutory refund-voucher issuance are distinct actions. |
| Credit note | Support a linked credit note for statutory section 34 reasons. Track issue date, original invoice(s), reason, tax/value adjustment and whether statutory output-tax reduction remains within deadline and conditions. | Section 34(1)-(2); no reduction in supplier output tax if incidence of tax and interest has been passed to another person. |
| Debit note | Support a linked debit note where original taxable value/tax was less than required. It is a separate document and return adjustment, not an edit to the invoice. | Section 34(3)-(4); debit-note details declared in return for month of issue. |
| Credit-note deadline | Use 30 November following the end of the financial year of the underlying supply, or filing of the relevant annual return, whichever is earlier, as the statutory tax-adjustment deadline currently reflected in amended section 34(2). Make the deadline configurable/versioned. | Finance Act 2022 amendment brought into force 1 October 2022 by Notification 18/2022-Central Tax; PIB release confirms the 30 November rule. |
| Commercial adjustment after GST deadline | Do not automatically reject every commercial credit adjustment after the GST deadline. Separate commercial/customer-account credit from statutory GST output-tax reduction. Require explicit classification and practitioner-configured workflow. | Section 34 deadline governs declaration/tax adjustment. A commercial settlement is not automatically a valid GST credit note. Exact accounting/tax treatment needs professional review. |
| Payment status | Keep document lifecycle separate from derived payment status. Receipts, allocations, refunds and notes are separate immutable events. | Product architecture decision; consistent with M8 design. |

## 2. Invoice issue date, past dates and future dates

### 2.1 Statutory anchors

- CGST Act section 31(1): for taxable goods, issue the tax invoice before or at the time of removal where movement is involved, or delivery/making available in other cases.
- CGST Act section 31(2): for taxable services, issue the invoice within the prescribed period.
- CGST Rules Rule 47: general service-invoice timing is within 30 days from the date of supply of service; specified banking/financial/insurance categories have a 45-day period.
- CGST Rules Rule 46: invoice includes the date of its issue and a consecutive serial number unique for a financial year.
- Section 34 separately governs credit/debit notes and must not be used as a generic way to rewrite an invoice.

### 2.2 Product policy

Fledge must distinguish three cases:

1. **Draft scheduling:** a user may prepare a draft or pro-forma with a planned future date. It is not a finalized tax invoice and must be clearly labelled as draft/pro-forma, with no GST invoice number consumed until finalization.
2. **New issue now:** when the user finalizes/issues a tax invoice, Fledge records the actual issue date. A future date is blocked. For goods, issue timing must also be validated against removal/delivery facts. For services, apply the prescribed service-invoice window and show an overdue compliance warning where the due window has passed.
3. **Historical import/entry:** a user may enter an already-issued invoice from an external/manual process. Preserve its original issue date and original number where applicable; record the date/time it was entered into Fledge separately. Mark it as imported/historical and do not pretend Fledge issued it at that earlier time.

The selected issue date must print exactly as saved. Creation, recording, finalization, due and payment dates are separate fields. The system clock must never silently overwrite the saved issue date.

**Open validation detail:** the product needs a controlled exception flow for late-issued invoices and corrective entries. The application should warn, preserve the actual issue date and capture the reason; it must not fabricate an earlier issue date to make the document appear timely. Final policy requires GST-practitioner approval.

## 3. Advances and receipt/refund vouchers

### 3.1 Receipt voucher

CGST Act section 31(3)(d) requires a registered person, on receipt of advance payment with respect to a supply, to issue a receipt voucher or prescribed equivalent. Rule 50 specifies particulars including supplier/recipient identity, unique serial number, issue date, description, advance amount, applicable tax rate/amount, place of supply for inter-State supply, reverse-charge indication and signature/digital signature.

CBIC's sectoral FAQ states that a receipt voucher is required for every advance received. Fledge should therefore not treat an advance as only a hidden customer credit balance. It needs a traceable payment event and, where applicable, a statutory receipt-voucher document.

### 3.2 Goods

Notification 66/2017-Central Tax (15 November 2017) exempts all taxpayers from payment of tax on advances received in case of supply of goods, subject to the notification's scope. This is a tax-payment timing relief, not permission to ignore the advance or the receipt-voucher requirement.

Fledge should:
- Record the actual date and amount received.
- Keep the amount as an unallocated customer advance until applied/refunded.
- Avoid charging GST on the goods advance merely because money was received, where the notification applies.
- On invoice finalization, allocate the advance and account for tax on the supply under the applicable invoice/time-of-supply rules.
- Retain a link between advance receipt, receipt voucher, invoice allocation and any refund.

### 3.3 Services

Section 13 governs time of supply of services. In general, where the invoice is issued within the prescribed period, time of supply is the earlier of invoice date or receipt of payment; where invoice timing is not compliant, the service-provision date and receipt-of-payment rules apply as set out in section 13. Therefore, an advance for taxable services may create a tax liability on receipt. Do not apply the goods notification to services.

Fledge must collect enough information to determine supply type, taxability, rate, place of supply and applicable exceptions. If these facts/rules are not available, do not guess a tax amount. A GST practitioner must review service-advance handling and any relevant exceptions before release.

### 3.4 Refund voucher

Section 31(3)(e) allows a refund voucher where an advance was received and receipt voucher issued, but subsequently no supply is made and no tax invoice is issued in pursuance. Rule 51 prescribes particulars. Fledge must link the refund voucher to the original receipt voucher/advance and separately record the actual refund payment event. Issuing a refund voucher and transferring money are not the same event.

## 4. Credit notes and debit notes

### 4.1 Credit notes

Section 34(1) permits a supplier to issue a credit note where the taxable value or tax charged in the original tax invoice exceeds the correct amount, goods are returned, or goods/services are deficient. The note must link to the original invoice(s) and retain its own date, number, reason and tax/value details.

Section 34(2) requires declaration in the return for the month of issue, no later than 30 November following the end of the financial year of the underlying supply, or the relevant annual return date, whichever is earlier. The supplier cannot reduce output tax where the incidence of tax and interest has been passed to another person.

A commercial/customer-account credit after this deadline must not be automatically represented as a GST output-tax reducing credit note. Fledge should separate:
- Statutory GST credit note with eligible tax adjustment.
- Commercial credit/settlement entry that adjusts customer balance but does not claim an automatic GST output-tax reduction.

### 4.2 Debit notes

Section 34(3) requires a debit note where the taxable value or tax charged in the original invoice is less than the correct amount. Section 34(4) requires its details to be declared in the return for the month of issue. Rule 53 prescribes particulars, including reference to the corresponding invoice(s).

A debit note must be an independent linked document. It must not mutate the original invoice or its historical tax snapshot.

### 4.3 Common note requirements

For both note types:
- Use independent serial numbering unique for the relevant financial year and document series, as prescribed.
- Preserve the original invoice number/date reference(s).
- Snapshot supplier and recipient identity, relevant tax/value and reason.
- Keep issue date, creation timestamp and due/payment dates separate.
- Preserve the full event history.
- Do not assume every commercial discount, write-off, refund or customer settlement is a statutory GST credit note.
- Do not issue a tax adjustment without the required original-invoice linkage and verified legal reason.

## 5. Payment ledger and accounting product decisions

These are product decisions, not statutory conclusions:

1. A customer receipt may exist before any invoice. It is recorded as an unallocated advance/credit.
2. One receipt may be allocated to multiple invoices; one invoice may receive multiple receipts.
3. Allocation/release/reallocation are auditable events. Do not overwrite history.
4. Refund is a separate event linked to the original receipt and, where relevant, released allocations.
5. Invoice lifecycle is draft/finalized/cancelled. Payment status is derived separately.
6. A statutory receipt voucher is a document generated from an advance event where required; a generic payment receipt is not automatically a statutory voucher.
7. Credit/debit notes affect customer balances according to a separately approved accounting policy. A note must not be double-counted with a refund or payment allocation.
8. Payment events never rewrite invoice totals, tax calculations, saved dates or party snapshots.
9. All monetary calculations use exact INR arithmetic; all commands are idempotent and transactional.
10. Local/offline event creation must retain stable IDs and safe retry behaviour.

## 6. Decisions that remain open and require owner/practitioner approval

| ID | Open decision | Why it remains open |
|---|---|---|
| D-01 | Exact late-invoice workflow and warning/block thresholds by supply type | Requires review of section 31, Rule 47 and transaction-specific facts. |
| D-02 | Full service-advance tax workflow, including exceptions and tax-rate/place-of-supply capture | Section 13 depends on facts and applicable notifications/exemptions. |
| D-03 | Applicability edge cases/exceptions to Notification 66/2017 for goods | Must verify current notification text and taxpayer category. |
| D-04 | Whether and how to support advances for exempt, zero-rated, export, RCM or mixed supplies | Multiple statutory regimes and facts. |
| D-05 | Whether a commercial credit after the section 34 deadline is represented as a non-GST customer credit adjustment and exact accounting treatment | Requires accountant/practitioner approval. |
| D-06 | Treatment of credit note where tax incidence has been passed to another person | Section 34(2) restricts output-tax reduction; accounting/refund treatment needs review. |
| D-07 | Note numbering format, series, maximum length and per-financial-year uniqueness | Rule 53 and Rule 46 particulars must be mapped to product series policy. |
| D-08 | Whether cancelled invoices may receive payments/notes and the required reversal workflow | Product/accounting policy plus GST correction rules. |
| D-09 | GST registration and non-GST mode eligibility/onboarding guardrails | Registration thresholds/exemptions vary by facts, State and activity. |
| D-10 | Historical imported document controls and evidence fields | Product integrity and audit policy; practitioner review needed. |

No code should implement these open decisions by inference.

## 7. Official sources reviewed

1. **CBIC Tax Information Portal, CGST Act section 31 (Tax invoice):** https://taxinformation.cbic.gov.in/content-page/explore-act/1000300/1000001/invoice/ACTS
2. **CBIC, CGST Act text, sections 12, 13, 31 and 34:** https://cbic-gst.gov.in/hindi/CGST-bill-e.html
3. **CBIC, CGST Rules, Invoice Rules (Rules 46–53):** https://cbic-gst.gov.in/gst-invoice-rules.html
4. **CBIC, Central Tax Notifications, Notification 66/2017-Central Tax dated 15-11-2017:** https://cbic-gst.gov.in/hindi/central-tax-notifications.html
5. **CBIC Sectoral FAQs, advance receipt voucher and advance reporting:** https://cbic-gst.gov.in/sectoral-faq.html
6. **Press Information Bureau, Ministry of Finance, 04-10-2022, Notification 18/2022-Central Tax and 30 November time limit:** https://www.pib.gov.in/Pressreleaseshare.aspx?PRID=1865179&lang=2&reg=3
7. **CBIC Circular 237/31/2024-GST (15-10-2024):** https://cbic-gst.gov.in/pdf/circular-237-31-2024-GST.pdf (reviewed as a current amendment reference; it concerns section 16 ITC deadlines, not the section 34 credit-note deadline).

## 8. Implementation gate

M8 implementation may begin only after:
- Product owner approves the product decisions in sections 1, 2, 5 and 6.
- A qualified GST practitioner reviews the statutory interpretation and open items.
- The source/rule catalogue is checked for amendments effective on the actual transaction dates.
- The payment domain contract in docs/12 is updated to reflect the approved decisions.
- M5/M6/M7 dependencies are confirmed sufficient for immutable tax/party snapshots and deterministic rendering.

Until then, M8-01 is a research/decision milestone only. No payment code, schema migration or statutory tax automation is authorized by this document.
