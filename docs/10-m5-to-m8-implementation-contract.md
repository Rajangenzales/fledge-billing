# Fledge Billing — M5 to M8 Implementation Contract

**Status:** Approved implementation brief for Cursor  
**Version:** 1.0  
**Prepared:** 2026-10-31  
**Applies to:** M5 GST Engine, M6 Invoice Templates & Vendor Customization, M7 PDF / Print / Share, M8 Payments  
**Baseline:** Existing M0–M4 implementation on main  
**Authority:** This document extends, and does not replace, docs/01–09. Where a conflict exists, stop and report it instead of silently changing the product.

---

## 0. Cursor execution contract

This is an implementation specification, not permission to implement all four milestones in one change.

1. Read README.md and docs/01-product-vision.md through docs/09-technology-stack.md before coding.
2. Read this document completely.
3. Inspect the current main branch and migrations before proposing changes. M0–M4 are already implemented; do not recreate or casually refactor them.
4. Implement one milestone issue at a time, in the order M5 → M6 → M7 → M8. Each issue must have a focused branch/PR, migration where needed, tests, and documentation.
5. Before coding each milestone, provide a concise implementation plan, list affected packages/files, identify migration changes and risks, and identify unresolved legal/product decisions. Do not block for approval on routine details already specified here.
6. Do not change the technology stack, layer boundaries, financial arithmetic, existing document lifecycle, or V1 scope without explicit approval.
7. Keep main buildable. Run pnpm test, pnpm typecheck, and pnpm build. Report actual command results; never claim a check passed if it was not run.
8. Do not add secrets, API keys, SMTP credentials, signing keys, real customer data, or local database files to Git.
9. Do not introduce GST rules as UI conditionals. UI calls application use cases; application use cases call domain services.
10. Do not let template, PDF, print, share, or payment presentation code recalculate or mutate document totals.
11. Every schema change must be a numbered, transactional migration. Preserve existing database compatibility and historical records.
12. Do not silently implement V2 features listed as non-goals.

### Current implementation facts to preserve

- M0–M4 are merged into main.
- The project is a TypeScript pnpm monorepo with domain, application, persistence and app packages.
- Local persistence uses SQLite and versioned migrations.
- Money uses exact arithmetic and explicit half-up rounding; never use JavaScript floating-point arithmetic for money.
- M4 stores documents, items, charges and numbering. M4 does not calculate CGST, SGST, UTGST or IGST.
- M4 tax_total remains zero pending M5. Do not treat the current zero tax total as a completed GST calculation.
- M4 has no template reference implementation, PDF renderer, payment repository, user account/authentication system or email verification workflow.
- The current app package is a CLI/local HTTP health shell, not a completed login-enabled customer UI.
- The current business profile persistence is single-business oriented. Do not claim cloud multi-tenancy exists.

---

## 1. Cross-cutting prerequisite: account security and offline access

### 1.1 Current status

Authentication is NOT implemented in the inspected M0–M4 repository. There is no implemented login page, password storage/verification, user account table, email verification, password reset, session management, or authorization boundary. Do not represent the application as protected by a login screen.

This is a required product capability and must be designed before the first customer-facing release. Treat it as a cross-cutting prerequisite and create a separately scoped security issue/branch before enabling account-dependent UI. It must not be hidden inside the GST engine.

The original product baseline is local-first and routine billing must work offline. Email verification necessarily requires network access. Therefore, distinguish online account verification from offline access to already activated local billing data.

### 1.2 Product behaviour

- A new account must register with an email address and password.
- The email address must be verified before the account can activate normal application access.
- Verification uses a short-lived, single-use, cryptographically random token delivered through a configured email provider. Store only a secure token hash server-side. Never log the token.
- Resending verification invalidates or safely supersedes previous tokens and is rate-limited.
- An unverified account can only access registration, verification, resend-verification and support flows.
- A verified account can sign in and activate the local installation.
- After successful online activation, normal billing operations must continue offline. Do not require an internet connection for creating customers, products, drafts, finalizing invoices, recording payments, PDF generation or viewing local history.
- On a device already activated, an internet outage must not lock the owner out of local billing data. Define a safe local unlock/session policy and document its limits.
- If account revocation, password reset, or a security event is received while online, update the account/device state. Never delete local business data as a side effect of account sign-out or verification failure.
- Account identity and business profile are separate concepts. The account authenticates a person; the business profile identifies the supplier printed on invoices.
- V1 may support one local business profile per installation as the current implementation does. Keep interfaces extensible for future multiple businesses, branches and roles, but do not implement advanced cloud multi-tenancy in this milestone.
- Provide explicit Sign out, Lock application, Change password, Forgot password and account verification states.
- A first-run local-only/demo mode, if offered, must be clearly labelled and must not bypass production account verification or create a false verified state.

### 1.3 Password and credential requirements

- Use a well-maintained password hashing implementation with Argon2id preferred. If the selected runtime/library cannot support it reliably, document the reason and use scrypt with secure parameters. Never store plaintext or reversibly encrypted passwords.
- Enforce a sensible minimum length (at least 12 characters), permit long passphrases and password managers, and do not impose arbitrary composition rules that encourage weak predictable passwords.
- Reject commonly compromised passwords where a suitable offline list/service is available; do not send raw passwords to third parties.
- Compare hashes using the library's constant-time verification.
- Rate-limit sign-in, registration, verification resend and password-reset requests. Use progressive delay/temporary lockout that does not enable easy denial-of-service against an account.
- Avoid account enumeration: responses for unknown email and known email should not reveal account existence in password-reset and sign-in flows.
- Password reset must use a single-use, short-lived token delivered to the verified email address. Revoke relevant server sessions and refresh credentials after reset.
- Never email a password or store password hints.
- Do not put passwords, verification tokens, session tokens or reset tokens in logs, analytics, crash reports, URLs that may be logged, or Git.
- Use HTTPS for every remote identity, verification and reset request. Validate TLS normally; never disable certificate validation.
- Protect remote endpoints against brute force, replay and token reuse. Add CSRF protection if cookie-based browser sessions are used.
- Use secure, HttpOnly, SameSite cookies for browser sessions where applicable. If the desktop/local shell uses tokens, store refresh credentials in the operating system credential store/keychain where supported, not in plaintext SQLite or localStorage.
- Keep access tokens short-lived. Rotate refresh tokens and detect reuse. Revoke on sign-out, password reset and account security events.
- Do not invent an authentication provider or email service. Define provider interfaces and configuration placeholders; document the provider decision and required secrets as deployment configuration.

### 1.4 Local installation protection

- Local account unlock must be separated from remote email verification.
- Use OS credential storage or a vetted local secret-protection mechanism. Do not store a plaintext local password.
- Provide automatic lock after configurable inactivity and a manual Lock now action. Defaults should be conservative but not interrupt active billing entry.
- Protect local database files with OS file permissions and appropriate disk/OS encryption guidance. Do not claim SQLite encryption unless actually implemented and tested.
- Backups must be treated as sensitive financial data. Define whether backups are encrypted and how recovery keys are protected before enabling backup distribution.
- Do not promise that a local application can enforce remote account revocation while the device is permanently offline. State this limitation clearly.
- Account sign-out must lock the app and remove active credentials, not delete invoices or business data.
- If multiple local users are introduced later, add explicit ownership/roles and audit events before allowing shared access. Do not infer authorization from hidden UI controls.

### 1.5 Security acceptance tests

- Registration rejects malformed email and invalid password inputs.
- Verification token is random, expires, is single-use, is stored hashed, and cannot be replayed.
- Unverified accounts cannot access protected account functions.
- Verified accounts can activate; offline billing works after activation.
- Unknown and known email reset requests return indistinguishable public responses.
- Passwords are never persisted or logged in plaintext.
- Sign-in/reset/resend rate limits are enforced.
- Password reset invalidates previous sessions/refresh credentials.
- Sign-out locks the application without deleting business data.
- Expired/revoked credentials are handled safely.
- No secret is present in repository history, test fixtures or logs.
- Security tests cover session fixation, token replay, brute-force throttling and unauthorized access to another account's data where a remote account service exists.

---

# M5 — GST Engine

## 2. Objective and user value

Implement a deterministic, versioned Indian GST calculation engine that consumes M4 document source values and returns complete tax calculations. It must support GST and non-GST documents, State/UT context, place of supply, CGST, SGST, UTGST, IGST, rate snapshots, inclusive/exclusive pricing, exempt/nil-rated/non-GST categories and a Cess foundation.

A user must be able to create a valid draft and see a transparent tax breakdown before finalization. A finalized document must retain exactly the calculation and rule version used at the time of issue.

## 3. Mandatory inputs

The engine must receive structured, validated inputs from the application layer:

- Supplier business identity, GST registration status, GSTIN where applicable, supplier State/UT and GST state code.
- Recipient/customer identity, registration type, GSTIN where applicable, customer State/UT and GST state code.
- Document type and GST enabled/disabled state.
- Document date, financial year and place of supply.
- Supply context required by the applicable rule, including goods/services classification and any legally relevant movement/delivery facts.
- Item description snapshot, HSN/SAC, quantity, unit, source rate, discount type/value, discount amount, line amount, tax category, configured rate and tax-inclusive/exclusive flag.
- Charge descriptions, amounts and whether each charge is taxable, with the rule-defined treatment.
- Reverse-charge indicator and other explicit document metadata required by verified rules.
- Applicable GST rule version and effective date.

Do not infer missing legal facts from a display label. If an input required to determine treatment is missing or contradictory, return a clear validation error and prevent finalization.

## 4. GST rule and rate model

- Rates and compliance rules are data, not hard-coded constants.
- Keep user-saved GST rates distinct from official/versioned tax rules. A saved rate is a user configuration; it is not proof that the rate is legally applicable.
- Each rule/rate record must support stable ID, version, jurisdiction/context, effective_from, optional effective_to, source_reference, status, category and calculation parameters.
- A finalized document must store the rule version and actual rate snapshots used.
- A new rule version must not rewrite or recalculate historical finalized documents.
- Support taxable, exempt, nil-rated, non-GST and other explicitly modelled categories required by the approved specification.
- Support CGST, SGST, UTGST, IGST and a Cess foundation. Implement Cess calculation only where the applicable rule and source are verified.
- Do not silently use a generic rate for an unknown HSN/SAC or classification.
- User-configured rates must be validated against the selected rule set where applicable, and any mismatch must be visible rather than silently corrected.

## 5. Legal source and version discipline

Use the official source hierarchy already established in docs/05-gst-compliance-spec.md:

1. CGST Act, IGST Act, UTGST Act and applicable rules.
2. Official CBIC notifications and circulars.
3. Official GST Portal guidance.
4. Other official government publications.

Relevant baseline links:
- https://cbic-gst.gov.in/gst-invoice-rules.html
- https://cbic-gst.gov.in/hindi/CGST-bill-e.html
- https://cbic-gst.gov.in/hindi/UTGST-bill-e.html
- https://tutorial.gst.gov.in/userguide/returns/Creation_of_Outward_Supplies_in_GSTR-1.htm

For every implemented compliance rule, record:
- Official source title and URL/reference.
- Relevant section/rule/notification/circular identifier.
- Published/effective date and the date the rule becomes effective.
- Rule version identifier.
- Short implementation rationale.
- Deterministic examples and expected outputs.
- Reviewer/review date where the project has a compliance review process.

Do not invent legal conclusions. If current official sources do not resolve a scenario, flag it as unresolved and block automatic tax determination for that scenario until reviewed. This software is not a substitute for professional tax advice.

## 6. Tax determination

- Determine applicable tax components from supplier context, recipient context, legally determined place of supply, nature of supply, document date, item classification and the effective rule version.
- Do not use the shortcut "supplier State equals customer State, therefore CGST + SGST" as a universal rule.
- Implement place-of-supply decision paths for goods and services only from verified applicable IGST Act/rules and official guidance.
- Support State and Union Territory jurisdiction correctly, including UTGST where applicable.
- Keep supplier State, recipient State and place of supply as distinct values.
- Support registered and unregistered recipients.
- Preserve the place-of-supply State/UT snapshot on finalized documents.
- Reverse charge must be an explicit document/tax treatment flag. Build the data and calculation interfaces needed for verified RCM cases; do not invent an exhaustive RCM list or apply RCM to all supplies.
- If the application cannot determine a legally valid treatment from supplied facts, return an actionable error rather than guessing.

## 7. Calculation and rounding

- Reuse the existing exact Money/Rational domain implementation from M0 and M4.
- Never convert monetary values to JavaScript number for calculations.
- Calculate from original source quantities, rates, discounts and charges, not from formatted display strings or previously rounded display totals.
- Support tax-exclusive pricing: derive taxable value and tax components from the applicable rate and verified rule.
- Support tax-inclusive pricing: extract taxable value and embedded tax using exact rational arithmetic, without adding embedded tax a second time.
- Define and document rounding at each legal/calculation stage. Use the existing centralized half-up operation where the approved rule specifies it. Do not create separate UI/PDF rounding.
- Handle per-line versus document-level rounding according to the verified rule and retain calculation metadata so the result is explainable.
- Allocate any rounding residual deterministically where the verified rule requires allocation. Never hide a one-paise difference.
- Taxable charges must be treated according to verified rules and their explicit taxable flag; non-taxable charges must not be accidentally taxed.
- Return line-level taxable value, tax rate, tax component amounts and total; document-level taxable total, component totals, cess total, total tax and grand total.
- Ensure grand total is derived once in the domain engine and reused everywhere.
- GST-off documents must not accidentally retain taxable GST rates or tax-inclusive flags from a previous draft configuration.
- A valid draft may switch GST mode where M4 allows it, but all dependent values must be recalculated from source values.

## 8. Document snapshots and persistence

Add migration-controlled persistence for, at minimum:

- gst_rule_version (or the existing equivalent).
- Versioned tax rules/rates and their source/effective dates.
- document_tax rows linked to document and, where relevant, document item.
- Tax type/component, rate, taxable value, amount, jurisdiction State/UT and rule version.
- Explicit reverse-charge metadata and any required calculation metadata.
- Snapshot fields required to explain the finalized result.

Use existing table names and current migration conventions where possible. Inspect current schema before adding entities; do not duplicate a table or rename an existing column without a migration plan.

On finalization:
- Persist the exact tax result and rule version in the same transaction as document finalization and number allocation.
- Reject finalization if required tax inputs are invalid or the rule version is unavailable.
- Preserve finalized tax results forever unless a separate legally controlled correction document is created.
- Drafts may be recalculated when source values change.
- Historical invoice display must use stored tax snapshots, not current GST rules.

## 9. M5 deliverables

- Domain GST types, rule model, tax determination engine and calculation engine.
- Application use cases for preview/recalculate/validate/finalize tax documents.
- Repository interfaces and SQLite implementations.
- Migration(s) for GST rule versions and document tax snapshots.
- Rule source registry/documentation.
- Deterministic fixtures for every supported tax path.
- Human-readable validation errors.
- No UI-only tax calculations.

## 10. M5 acceptance criteria and test matrix

At minimum, automated tests must cover:

- GST disabled and non-GST document.
- Tax invoice, bill of supply and GST/non-GST quotation rules.
- Intra-State supply resulting in the legally applicable State/UT components.
- Inter-State supply resulting in IGST where legally applicable.
- Union Territory cases and UTGST applicability.
- Goods and services place-of-supply scenarios selected from official source examples.
- Registered and unregistered recipient cases.
- Taxable, exempt, nil-rated and non-GST categories.
- Tax-exclusive and tax-inclusive prices.
- Multiple rates on one document.
- Discounts before tax and relevant charge treatment.
- Cess foundation and verified supported Cess case, if enabled.
- Reverse-charge supported case and unsupported/unknown case rejection.
- Financial-year boundary and document date selecting the correct rule version.
- Rule effective-from/effective-to boundary.
- Exact arithmetic, paise rounding, negative/invalid inputs and residual handling.
- Missing/mismatched State/UT, GSTIN and place-of-supply inputs.
- Finalized snapshot remains unchanged after rule/rate/master updates.
- Re-finalization, duplicate numbering and transaction rollback behaviour.
- GST mode change on a draft recalculates correctly from source values.

Every test must state its source/rule reference, input facts and expected values. Do not write tests whose expected values are merely copied from the implementation.

### M5 definition of done

M5 is complete only when the supported legal scenarios have source-backed rules, deterministic tests pass, migrations pass from an empty database and an M4 database, finalized documents persist complete tax snapshots, and pnpm test/typecheck/build pass.

---

# M6 — Invoice Templates and Vendor Customization

## 11. Objective and user value

Allow each business/vendor to make invoices look and read like its own business documents without changing statutory fields, calculations or historical invoices.

The user must be able to select a built-in template and configure supported fields, labels, visibility, order, brand styling and custom business-specific details. This is controlled customization, not an unrestricted form builder.

## 12. Built-in templates

Provide the initial template families from docs/06:

- Standard.
- GST.
- Service.
- Retail.
- Quotation.
- Receipt.
- Bill of Supply.

Templates must be usable without customization. Each template must have a clear purpose and must display all legally required information for its document type.

## 13. Template model

Use versioned, data-driven template definitions. The model should support:

- Template ID, business scope, name, document type/family, version, active/default state.
- Design tokens: brand colours, typography, font sizes, spacing, borders, alignment, logo sizing/placement and page settings.
- Sections: header, supplier/business, recipient/customer, custom details, items, charges, tax summary, payment, notes/terms and footer.
- Per-section visibility, ordering, label overrides and safe configuration.
- Field definitions with stable field IDs, data type, default label, editable label, required/optional state, visibility, order and validation rules.
- Custom fields with stable IDs, label, type, optional helper text, required/optional state, default value where appropriate, visibility, order and allowed section.
- Supported field types: short text, long text, number, date, phone, email, URL and checkbox. Money/tax/HSN/GSTIN/state fields must use typed domain validation and must not be arbitrary text.
- Business-specific settings must be isolated by business ID even though V1 currently supports one business per local installation.
- Template configuration must be validated against an allow-listed schema. Never execute arbitrary JavaScript, HTML, CSS, SQL or uploaded code from a template.

## 14. Vendor-editable fields

This requirement is mandatory: different vendors must be able to edit the labels and supported optional fields shown on their invoices.

Examples include:
- Rename a safe presentation label such as "Customer" to "Buyer" or "Client".
- Show/hide optional phone, email, shipping address, website, salesperson, delivery note, purchase order reference, vehicle/reference number, bank details, UPI ID, payment terms, notes and footer.
- Add custom text/date/number fields such as "Batch No.", "Delivery Route", "Project Name", "Contact Person", "Order Reference" or a vendor-defined note.
- Reorder supported sections and fields.
- Choose which optional custom fields appear on a particular template/document family.
- Configure brand colours, logo, typography, spacing and page layout within supported design tokens.
- Save a vendor's preferred default template and field configuration.

Guardrails:
- A label may be changed, but the underlying field identity and meaning must remain stable.
- Statutory and calculation-critical fields cannot be hidden, renamed in a way that misrepresents their legal meaning, or replaced with custom text. If a display alias is permitted, retain the legally required label or an unambiguous equivalent.
- GSTIN, supplier identity, invoice number/date, HSN/SAC where required, taxable value, tax rates/components, place of supply where required, reverse-charge indication and required declarations remain protected by document-type/rule-specific constraints.
- Never allow a custom field to change invoice amounts, tax classification, tax rate, payment status, invoice numbering or the document lifecycle.
- A custom field must not masquerade as a legally validated GST/HSN field.
- Custom field definitions are editable in settings; values entered on a draft are editable until finalization.
- On finalization, store a snapshot of custom field definitions/labels and values used for that document. Later vendor template changes must not alter historical documents.
- Validate required custom fields before finalization. Explain which field needs attention.
- Do not require every vendor to use every optional field.

## 15. Template editor UX

Provide a simple, guided editor rather than an unrestricted design canvas:

1. Choose a built-in template.
2. Preview a representative invoice.
3. Edit safe labels.
4. Toggle optional fields/sections.
5. Add supported custom fields.
6. Reorder sections/fields.
7. Configure logo and brand styling.
8. Preview GST, non-GST, quotation and receipt examples where relevant.
9. Save as a new template or set as default.
10. Restore template defaults.

The preview must use sample data and must clearly indicate that it is a preview. Do not create a finalized invoice or consume an invoice number during preview.

The editor must be usable by a small-business owner without technical knowledge. Keep advanced configuration out of the normal invoice-entry flow.

## 16. Template persistence and versioning

Use migration-controlled entities aligned with docs/04:

- invoice_template.
- template_section.
- A normalized custom-field definition/value model, or a validated versioned JSON configuration where justified and documented.
- Business-level default template setting.
- Template version and immutable finalized-document template reference.
- Document custom-field value snapshots.

Prefer normalized columns for fields requiring querying, validation or relationships. If JSON is used for presentation configuration, validate it against a versioned schema and keep it out of financial calculation logic.

On template update:
- Create a new template version or a controlled revision.
- Existing finalized documents continue to render with their stored template version/snapshot.
- Drafts may adopt the new version only through an explicit update/re-preview action.
- Never silently change historical invoice layout or content.

## 17. M6 acceptance criteria and tests

- Every built-in template family renders valid sample data.
- Vendor can edit safe labels, toggle optional fields, reorder sections and add supported custom fields.
- Field type and validation are enforced.
- Protected statutory/calculation fields cannot be hidden or misrepresented.
- Custom fields cannot alter totals, taxes or document status.
- Required custom fields block finalization with a clear error.
- Preview never consumes a document number or changes persisted invoice data.
- Different business/template configurations remain isolated.
- Template version changes do not alter finalized document snapshots.
- Existing M4/M5 documents remain readable after migration.
- Invalid template configuration is rejected safely.
- No arbitrary code, script or unsafe markup is executed.
- Tests cover GST and non-GST template variants, long text, missing optional fields, page overflow and historical rendering.

### M6 definition of done

M6 is complete when all built-in templates work, vendor customization is persisted and validated, statutory fields remain protected, preview is deterministic, finalized snapshots are stable, and automated tests/build/typecheck pass.

---

# M7 — PDF, Print and Share

## 18. Objective and user value

Generate a professional, consistent invoice output from one canonical render model. Screen preview, PDF, print and share must show the same content and amounts.

## 19. Canonical render model

- Build a deterministic render model from a document snapshot, its tax calculation snapshot and its template version.
- Rendering consumes data; it must not calculate GST, discounts, charges, totals or payment balances.
- Include supplier and customer snapshots, document metadata, items, HSN/SAC, quantities/units, discounts, charges, tax components, totals, payment details, custom fields, notes, terms and footer as permitted by the selected document type.
- Respect template section/field visibility and statutory-required field rules.
- Preserve exact stored amounts and apply only display formatting at the final presentation boundary.
- Define locale, date, currency and number formatting consistently. INR must display in a familiar Indian format and never change the underlying stored value.
- Use stable page dimensions and deterministic layout rules. Support A4 first; thermal/small-format layouts are future unless separately approved.
- Handle long descriptions, many line items, long addresses, custom fields, page breaks, repeated table headers, totals, footer placement and page numbering.
- Never split a monetary row in a way that makes the amount ambiguous.
- Ensure totals and required declarations are not clipped or omitted.

## 20. PDF generation

- Select a maintained PDF implementation compatible with the chosen runtime and architecture. Document the decision before adding a dependency.
- Generate PDFs locally without requiring internet access.
- Use the same canonical render model as print and share.
- Support multi-page invoices.
- Embed or safely reference required fonts and business logos. Do not depend on remote image URLs at render time.
- Validate logo/image type and size; reject unsupported or malformed uploads safely.
- Use deterministic filenames based on document type/number/date without exposing unrelated personal data.
- Write output atomically to avoid corrupt partial files.
- Handle missing output permissions, disk-full and rendering failures with human-readable errors.
- A failed PDF operation must not modify or unfinalize the financial document.

## 21. Print

- Provide a print-friendly layout using the same render model.
- Avoid browser/UI controls, navigation, backgrounds or editor handles in printed output.
- Respect page size, margins, scaling and page breaks.
- Do not silently shrink text below readable limits to force content onto one page.
- Provide a print preview and a clear return path to the app.
- Print failure must not alter invoice state.

## 22. Share and export

- Provide an explicit Save/Export PDF action and a platform-appropriate Share action where supported.
- Sharing must use the platform share sheet or a safe file handoff; do not silently email, upload or publish invoices.
- Never send invoice/customer information to an external service without explicit user action.
- Use safe temporary file handling and clean up temporary exports when no longer required, without deleting user-saved PDFs.
- Offline PDF export and local save must work.
- If a platform share target is unavailable, offer Save PDF as the fallback.

## 23. M7 acceptance criteria and tests

- The same document render model produces equivalent screen preview, PDF and print output.
- GST/non-GST invoice, quotation, receipt and bill of supply use correct document-specific layouts.
- Multi-page output handles long item lists, long descriptions, custom fields and page breaks.
- Required statutory information is present and visible.
- Historical documents render from stored tax/template snapshots after master/template updates.
- PDF generation works offline.
- Export/print/share errors do not alter document state or financial values.
- PDF files open in standard readers and have expected page count, dimensions and readable text.
- Tests compare extracted PDF text and key layout/amount assertions; add visual regression tests where practical.
- Security tests reject malformed or oversized logos and unsafe filenames.
- No network upload occurs during local export.

### M7 definition of done

M7 is complete when deterministic PDF, print preview and local share/export work for all supported document types, output is readable across multi-page cases, historical rendering is stable, and tests/build/typecheck pass.

---

# M8 — Payments

## 24. Objective and user value

Allow users to record money received against finalized documents, see outstanding balances and payment status, and include configured payment information on invoices/receipts.

Payments must be separate financial records. They must not rewrite the original invoice amount or tax calculation.

## 25. Payment record

Each payment must support:

- Stable payment ID.
- Business ID and document ID.
- Amount in exact INR money representation.
- Payment date.
- Payment method: cash, UPI, bank transfer, card, cheque and other configurable/manual method.
- Reference/transaction/UTR/cheque number where applicable.
- Notes.
- Created timestamp and updated timestamp where applicable.
- Status such as recorded, reversed or voided only where supported by an explicit controlled workflow.
- Actor/audit metadata when authenticated users are introduced.

Do not store card numbers, CVV, banking passwords, UPI PINs or other payment credentials. Fledge records payment events; it is not a payment processor in V1.

## 26. Payment behaviour

- Payments may be recorded only against eligible finalized documents. Do not record payment against a draft.
- Support one or multiple payments against one document.
- Support partial payments and full settlement.
- Calculate total paid as the exact sum of valid recorded payments.
- Calculate outstanding as invoice grand total minus valid payments, with explicit handling for zero and overpayment.
- Derive payment status from document total and recorded payment events: unpaid/outstanding, partial and paid. Do not allow an arbitrary manual status to disagree with the ledger.
- Define and test overpayment behaviour. Do not silently discard excess payment or create a negative outstanding balance without a clearly specified credit/customer-account workflow. For V1, reject an overpayment by default unless a separately approved policy is implemented.
- Payment date may differ from invoice date.
- A payment can be edited only through a controlled correction/reversal process with audit history; do not silently erase a financial event.
- Reversal/void must retain the original payment record and reason. Recalculate the derived balance from valid payment events.
- A cancelled invoice must not accept new payments. Existing payments remain visible and require an explicit resolution path; do not delete them automatically.
- Preserve original invoice grand total and tax snapshot regardless of payment activity.
- Record payment method and reference without calling external payment APIs.
- Payment QR/UPI information is business configuration, not proof of payment. A displayed QR must never mark an invoice as paid.
- Support configurable business payment details: bank name, account holder, account number, IFSC, branch, UPI ID and optional QR image/reference. Validate format where possible, mask sensitive account details in settings where appropriate, and never store payment passwords/PINs.
- Do not generate a QR containing an unverified amount or recipient identity. If a static UPI QR is supported, clearly label it as payment instructions and allow the user to verify its details.
- A receipt document may be generated from a payment event, linked to the original invoice and payment. Do not create a duplicate unrelated receipt record.

## 27. Payment and invoice lifecycle

- Keep document lifecycle and payment state conceptually separate.
- Draft/finalized/cancelled remain document lifecycle states.
- Outstanding/partial/paid are derived payment states.
- Do not write partial/paid into the document lifecycle column if the current schema intentionally reserves those values for payment status.
- Finalized invoices remain immutable; payments are appended as separate records.
- Payment status and balance must be computed consistently in list, detail, PDF and receipt views.
- Payment recording and any audit event must occur in one database transaction.
- Concurrent payment writes must not create duplicate payment IDs or inconsistent balances.

## 28. M8 acceptance criteria and tests

- Cannot record payment against draft or cancelled documents.
- Can record one full payment and multiple partial payments.
- Correct outstanding balance after each payment.
- Paid status appears only when the valid payment sum equals the invoice total under the approved policy.
- Overpayment is rejected by default and does not corrupt balances.
- Reversal/void requires a reason and preserves history.
- Payment date, method, reference and notes persist correctly.
- Payment QR/configuration never marks an invoice paid.
- Receipt links to the payment and source document.
- Payment changes do not change invoice line values, GST snapshots or grand total.
- Cancelled invoice with previous payments remains auditable.
- Concurrent writes and transaction rollback are tested.
- Historical payment status remains correct after restart/offline use.
- Payment data is isolated by business ID.
- PDF/print views show payment information without changing invoice calculations.
- All payment amounts use exact money arithmetic.

### M8 definition of done

M8 is complete when payment records, derived balances/statuses, controlled corrections, business payment information and receipts work offline, preserve history, pass repository/domain tests and do not mutate finalized invoice calculations.

---

## 29. Database and migration guidance across M5–M8

Before each migration, inspect the actual current schema and migration version. The current M4 migration is version 5; do not assume the original design document's table list is already implemented.

Likely entities to introduce or extend, subject to inspection:

- M5: gst_rule_version, tax_rate/rule records, document_tax, document reverse-charge and calculation snapshots.
- M6: invoice_template, template_section, versioned template configuration, custom field definitions and document custom-field snapshots.
- M7: document render metadata only if genuinely required. Avoid storing generated PDFs inside SQLite by default; use managed local files and stable references.
- M8: payment, payment audit/reversal metadata and business payment settings.

Migration requirements:
- Contiguous migration versions.
- Transactional application and rollback on failure.
- Stable migration names.
- Foreign keys and indexes for business/document relationships.
- Unique constraints for identifiers and applicable payment/document relationships.
- Preserve all M0–M4 data.
- Test upgrade from a fresh database and from schema version 5.
- Never delete or recalculate finalized historical documents during migration.
- Database newer than application must continue to fail safely as current migration runner requires.

## 30. UI and user experience principles

- Build simple business workflows, not a tax/accounting control panel.
- Keep routine billing usable offline.
- Use plain language and explain errors next to the field/action that caused them.
- Keep GST detail visible but understandable; allow a clear tax breakdown.
- Do not expose internal rule IDs or database terminology to normal users.
- Keep invoice entry fast: select customer, add items, review tax, save draft or finalize.
- Make draft/finalized/cancelled state unmistakable.
- Keep payment status visually distinct from document lifecycle.
- Vendor template customization belongs in settings, not in every invoice-entry session.
- Do not hide important warnings behind colour alone; provide readable labels and text.

## 31. Explicitly out of scope for M5–M8

Unless separately approved, do not implement:

- GST return filing or direct GST Portal submission.
- Full e-invoice/IRN or e-way bill integration.
- Automated GST reconciliation.
- Full accounting ledger, payroll or inventory accounting.
- Payment gateway processing, card vaulting or UPI collection APIs.
- Advanced cloud multi-tenancy, branch management or complex role administration.
- Unrestricted drag-and-drop HTML/CSS/JavaScript template builder.
- Template marketplace or user-uploaded executable templates.
- Automated tax advice.
- Automatic rewriting of historical invoices or payment records.

## 32. Recommended issue breakdown

Cursor should create focused issues before implementation. Suggested sequence:

### Security prerequisite (before customer-facing account UI)
- SEC-01: Decide and document account/identity deployment boundary and email provider interface.
- SEC-02: Registration, password hashing and email verification.
- SEC-03: Sign-in, reset, session lifecycle, rate limits and local offline unlock.
- SEC-04: Authorization boundary, data ownership checks, audit events and security tests.

### M5
- M5-01: GST rule/version data model and source registry.
- M5-02: Tax input validation and place-of-supply decision model.
- M5-03: CGST/SGST/UTGST/IGST determination from verified rules.
- M5-04: Inclusive/exclusive calculations, discounts, charges and rounding.
- M5-05: Document tax persistence and immutable finalization snapshots.
- M5-06: Rule-version boundary, regression and compliance test suite.

### M6
- M6-01: Template schema/version model and migration.
- M6-02: Built-in template definitions.
- M6-03: Vendor field/label/section customization.
- M6-04: Custom field validation and document snapshots.
- M6-05: Template editor and safe preview.
- M6-06: Historical template compatibility tests.

### M7
- M7-01: Canonical render model.
- M7-02: Deterministic PDF generation.
- M7-03: Print preview and page layout.
- M7-04: Local save/export/share integration.
- M7-05: PDF text/layout, multi-page and offline tests.

### M8
- M8-01: Payment domain model and migration.
- M8-02: Payment repository and application use cases.
- M8-03: Derived outstanding/partial/paid calculations.
- M8-04: Controlled payment correction/reversal and audit.
- M8-05: Business payment settings and QR/UPI display.
- M8-06: Receipt generation and payment regression tests.

## 33. Release gates after M8

Do not call the application V1-ready merely because M8 is merged. The existing roadmap still requires M9 Backup & Recovery, M10 Update System, M11 QA and M12 V1 Release.

Before a public/customer release, additionally verify:
- Authentication and email verification are implemented and security-reviewed.
- Offline unlock and data-preservation behaviour are tested.
- Vendor customization cannot hide/misrepresent required invoice fields.
- GST rules have source references and a documented review date.
- Invoice numbering and finalized history are preserved.
- PDF, print and share outputs are verified on supported platforms.
- Payments reconcile exactly with outstanding balances.
- Backup/restore and update/migration recovery are tested.
- Privacy, data retention, support and deployment configuration are documented.
- No credentials, secrets, private keys or customer data are committed.

**Cursor final instruction:** Implement the smallest complete issue, not the entire milestone in one pass. Report changed files, migration number, tests run and results, unresolved questions, and the next issue. Stop on legal ambiguity, data-loss risk, security boundary ambiguity or a conflict with docs/01–09; explain the conflict instead of guessing.
