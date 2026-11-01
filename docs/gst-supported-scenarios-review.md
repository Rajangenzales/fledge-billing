# GST V1 supported-scenarios review

**Review date:** 1 November 2026
**Review type:** Internal engineering audit and automated-test review
**Qualified GST-practitioner review:** Pending; no reviewer or approval is recorded
**Rule version implemented:** `gst-structure-2017-07-01`, effective 1 July 2017
**Status:** Limited calculation scope only; not a GST compliance sign-off

This record describes what the current GST calculation engine does and does not
verify. It is not tax advice. Applicable Acts, Rules, notifications, amendments,
transaction facts and taxpayer circumstances must be checked by a qualified GST
practitioner before release and before relying on a calculation.

## Implemented calculation scope

| Scenario | Current behavior | Trace and automated coverage |
| --- | --- | --- |
| Effective calculation structure | Selects one active rule by document date; rejects missing or overlapping rules. The only seeded structure starts 1 July 2017. | `GST_RULE_VERSIONS` records an ID, version, effective date and CBIC Act references. `GST rule selection` tests check date boundaries and overlap. |
| Tax components from known locations | Compares supplier State/UT with the explicitly selected place of supply. Same jurisdiction produces CGST plus SGST, or UTGST for codes 04, 26, 31, 35 and 38; different jurisdictions produce IGST. | IGST Act sections 7 and 8; UTGST Act sections 2(8) and 7. Tests cover each configured UTGST code, Delhi, a differing place of supply and a customer location that differs from place of supply. |
| Taxable, nil-rated, exempt and non-GST lines | Applies explicit line categories and rejects inconsistent rate/category combinations. | `gst.test.ts` covers mixed categories, bill of supply and non-GST documents. |
| Tax-exclusive and tax-inclusive amounts | Uses the entered percentage, extracts inclusive tax and records paise residuals. | `gst.test.ts` covers exclusive amounts, inclusive amounts and a one-paise residual. |
| Line discounts and taxable charges | Applies line discounts before calculating tax; applies the entered rate to charges explicitly marked taxable. | CGST Act section 15(3) is recorded in the rule source. Tests cover a discounted taxable line, saved-rate mismatch visibility and taxable freight. |
| Rounding | Rounds each calculated tax component half-up to paise; does not apply nearest-rupee rounding to invoice line tax. | `gst.test.ts` covers split-component and IGST rounding examples. |
| HSN/SAC presentation | Carries the supplied HSN/SAC through the document calculation and canonical preview model. | `preview.test.ts` asserts the supplied HSN/SAC appears in the preview item. |

The calculation structure references IGST Act sections 7 and 8, CGST Act
sections 9, 15(3) and 31, and UTGST Act sections 2(8) and 7. The source URLs
are recorded in `packages/domain/src/gst.ts` and
`docs/05-gst-compliance-spec.md`. Those references establish the implementation
basis, not a confirmation that every current amendment or transaction-specific
rule has been reviewed.

## Limitations and enforced boundaries

- **Place of supply:** The user must select a State/UT. The engine does not
  derive the legally applicable place of supply from goods movement, delivery,
  service type, recipient facts or the IGST Act sections 10–13 rules. Missing
  or inactive jurisdictions are rejected. The browser now displays this limit
  before users create or issue documents.
- **Rates and classification:** The rate is supplied on the document line.
  Saved product rates are user configuration, not statutory rate evidence.
  There is no HSN/SAC rate lookup or legal validation of a code/rate pairing.
  A mismatch with a product's saved rate is surfaced, not silently corrected.
- **Reverse charge:** The engine accepts a user-selected yes/no flag and
  adjusts its calculation accordingly, but does not determine eligibility,
  liability, applicable category or exceptions. Reverse-charge categories are
  rejected as unverified. The browser warns that applicability is not
  determined by Fledge.
- **Cess:** Cess is not calculated. A supplied cess rate is rejected.
- **Outside the modeled domestic calculation:** Exports, imports, SEZ
  treatment, cross-border place-of-supply rules, transaction-specific goods
  and services place-of-supply rules, and statutory rate schedules are not
  automated or verified by this engine.
- **GSTIN and invoice compliance:** Existing validation checks input shape and
  jurisdiction consistency; they do not establish GST registration status or
  replace verification of all applicable tax-invoice particulars and
  transaction-specific requirements.

The browser notice and these constraints prevent the current calculation from
being presented as a rate classifier, place-of-supply determination, or
complete statutory workflow. The engine must not be expanded into those areas
without source-backed rules, deterministic tests and review.

## Review and release gate

- Internal engineering review: completed 1 November 2026 for the implemented
  calculation paths and repository test coverage described above.
- Qualified GST-practitioner review: **pending**. Record the reviewer's name
  or organization, review date, transaction scope, sources/amendments checked,
  findings and approval here before claiming V1 GST compliance.
- No official HSN/SAC rate catalogue or exhaustive place-of-supply/RCM rule
  catalogue is part of this implementation.
- This record does not close C1. Reopen this review when GST behavior, source
  data or the supported transaction scope changes.

## Official source references

- [IGST Act — CBIC](https://cbic-gst.gov.in/hindi/IGST-bill-e.html)
- [CGST Act — CBIC](https://cbic-gst.gov.in/hindi/CGST-bill-e.html)
- [UTGST Act — CBIC](https://cbic-gst.gov.in/hindi/UTGST-bill-e.html)
- [CGST Rules: tax invoice particulars — CBIC](https://cbic-gst.gov.in/gst-invoice-rules.html)
- [GST compliance specification](./05-gst-compliance-spec.md)
