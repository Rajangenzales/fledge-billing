# Fledge Billing — Product Completion PRD: Implementation, Quality Assurance & V1 Release

**Document ID:** PRD-COMP-001  
**Version:** 1.1  
**Status:** Completion planning baseline  
**Date:** 1 November 2026  
**Repository:** `Rajangenzales/fledge-billing`  
**Supersedes:** None  
**Extends:** [PRD V1](./02-prd-v1.md) and [Roadmap & Cursor Development Contract](./08-roadmap-and-cursor-contract.md)

---

## 1. Purpose

This document converts the approved Fledge Billing product direction and existing implementation roadmap into an actionable completion plan covering the remaining product work, implementation sequence, quality assurance, and V1 release.

It is an execution-oriented companion to the original PRD. It does not replace or silently revise the original product scope, architecture, database design, GST compliance specification, invoice-template system, or distribution strategy.

The objective is to take Fledge Billing from its current partially implemented state to a dependable, tested, distributable V1 product.

## 2. Product objective

Fledge Billing is a local-first billing application for Indian businesses. It must enable a business to configure its profile, manage customers and products/services, create compliant billing documents, record customer payments, and retrieve and present its records reliably.

The product must be designed around these principles:

1. **Local-first operation:** Routine billing and access to saved local records must not depend on a continuous internet connection.
2. **Financial correctness:** Money, tax, numbering, payment and document lifecycle rules belong in tested domain/application services, never in presentation code.
3. **Document integrity:** Finalized financial documents preserve their original values and snapshots. Corrections use explicit, controlled workflows.
4. **Data ownership:** Business records remain under the business owner's control. Backup and synchronization are distinct capabilities and must be opt-in.
5. **GST awareness:** GST behaviour must be sourced, versioned, testable and reviewed. A user setting must never override legal treatment.
6. **Safe evolution:** Database changes use versioned migrations. Updates must protect existing user data and provide a recoverable path.
7. **Release discipline:** A feature is not complete merely because a screen exists. It must work through its full user journey and meet its acceptance criteria.

## 3. Current implementation baseline

The following is a planning snapshot of the repository as reviewed on 1 November 2026. Status labels describe the implementation foundation, not blanket approval of every scenario or statutory case.

| Product area | Current baseline | Completion boundary |
| --- | --- | --- |
| Application foundation and shell | Implemented foundation | Resolve the current CI/test build-order failure and verify clean-checkout commands. |
| Business setup | Browser workflow implemented | Complete manual browser verification for validation, edit, reload and business scoping. |
| Customer management | Browser workflow implemented | Complete manual browser verification for CRUD, validation, reload and business scoping. |
| Products and saved GST rates | Browser persistence and catalog workflows implemented | Complete manual verification of editing, inactive states, saved-rate references and reload behaviour. |
| Billing/document engine | Browser draft, edit, numbering, finalization and historical snapshots implemented | Verify lifecycle edge cases, financial-year boundaries, retries and immutable issued values. |
| GST engine | Core calculations implemented; supported scenarios documented | Complete the source-backed scenario review and record qualified reviewer evidence; unsupported legal determinations must remain constrained. |
| Invoice templates | Browser persistence, safe customization, revision history and preview implemented | Verify realistic output, historical rendering and remaining brand/layout requirements. |
| PDF, print and share | Initial browser preview, PDF download, print and supported share/fallback flows implemented | Complete realistic browser/device output checks, font/logo support and long-document verification. |
| Payments and advances | Browser receipts, advances, allocations, releases, refunds and reversals implemented | Complete manual financial-invariant and retry/reload verification. |
| Payment activity statement | Browser customer activity view and consistent snapshot support implemented | Verify presentation and derived balances against realistic scenarios. |
| IndexedDB | Business, customer, product, saved-rate, document, template and payment stores implemented | Continue browser transaction, upgrade, quota, blocked-upgrade and real-browser durability verification. |
| Backup and recovery | Encrypted backup and validation-before-atomic-restore implemented; automated schema-v5 coverage present | Verify on supported real browsers and document the schema-v5 compatibility boundary. |
| PWA/offline lifecycle | Manifest, icons, service worker, offline shell cache and foreground update flow implemented | Verify install, previously-loaded offline startup, update and recovery on each supported platform. |
| Update and distribution system | Release manifest, compatibility checks and generated SHA-256 artifact checks implemented | Production release metadata, hosting/signing ownership and real-platform update verification remain open. |
| Authentication, accounts and subscription services | Not implemented | Resolve whether these are required for private testing or only a later public/commercial release; do not imply they exist. |
| Automated CI and release gates | GitHub Actions workflow exists; latest observed run fails during test resolution | Repair workspace build ordering, then require green test, typecheck and build checks. |
| Production release | Not ready; deployment intentionally deferred | Complete product verification, owner decisions, security/release gates and production operations. |

The current main-branch browser implementation includes IndexedDB persistence for business profiles, customers, products, saved GST rates, billing documents, templates and payment events; browser document output; encrypted backup/restore; and the PWA shell/update lifecycle. These capabilities are implemented foundations, not proof of release readiness. Real-browser/device verification, supported-output checks, GST review evidence, CI repair, security/product decisions and end-to-end acceptance testing remain open. Cloud backup and synchronization are not part of the current testing scope. Existing SQLite support and its migration history must be preserved.

Refer to [W2 IndexedDB Foundation](./30-w2-indexeddb-foundation-and-local-setup.md), [W1H Audit](./29-w1h-final-async-boundary-audit.md), and the original roadmap for detailed implementation boundaries.

## 4. V1 scope

### 4.1 Required product capabilities

V1 must provide the following complete business workflows:

- Business profile setup, including State/UT, address, contact details, GST registration status and invoice preferences.
- Customer creation, editing, retrieval and business-scoped ownership.
- Product/service creation, editing, retrieval, HSN/SAC, units, prices, discounts and saved GST-rate configuration.
- Tax invoice, non-GST invoice, Bill of Supply, quotation and receipt workflows, subject to the approved document rules.
- Draft creation and editing, validation, finalization, retrieval and controlled cancellation/correction where permitted.
- Invoice numbering with the approved series, financial-year and uniqueness rules.
- GST calculation and display for supported transactions, including applicable CGST, SGST, UTGST and IGST components.
- Professional built-in invoice templates and approved vendor-editable presentation settings.
- Deterministic document preview, PDF export, printing and supported sharing.
- Customer payment receipts, advances, partial and multiple payments, allocation/reallocation, refunds and reversals.
- Derived outstanding balances and payment status, separate from document lifecycle state.
- Local persistence and routine offline billing after the app has been installed/loaded and any required activation has completed.
- Backup, restore and recovery workflows.
- Safe application update checks and release/update handling.
- User-facing error states, data-safety guidance and product documentation.

### 4.2 Explicit V1 non-goals

Unless separately approved through product governance, V1 does not include:

- Full accounting/general ledger or financial statements.
- Payroll or HR management.
- Inventory accounting or warehouse management.
- GST return preparation/filing or direct GST portal submission.
- E-invoice IRN generation or e-way bill integration.
- Automated statutory tax advice.
- Full bank/payment reconciliation.
- Advanced cloud-based multi-tenant accounting operations.
- An unrestricted invoice-form or page-layout builder.
- Automatic statutory treatment of advances, vouchers or credit/debit notes without verified rules and qualified review.

A documented future direction is not automatically part of the V1 release commitment.

## 5. Primary end-to-end acceptance journey

A first-time business user must be able to complete this journey without developer intervention:

1. Open Fledge Billing and complete the required first-run setup.
2. Create or configure the business profile and select the correct State/UT.
3. Configure GST registration details where applicable.
4. Add a customer with the relevant address and registration information.
5. Add a product/service with price, unit and tax configuration.
6. Create a supported billing document and select the appropriate document type.
7. Add items, quantities, discounts and charges.
8. Review calculated taxable values, taxes and grand total.
9. Save the document as a draft, close/reopen the application and retrieve it.
10. Edit the draft and verify that totals are recalculated from source values.
11. Finalize a valid document and verify its number, saved date and immutable financial snapshot.
12. Preview, export, print and share the document through supported channels.
13. Record a full or partial payment and issue the corresponding receipt.
14. Verify outstanding balance and payment status from payment events and allocations.
15. Close and reopen the application, including while offline, and verify that saved records remain accessible.
16. Create a backup, restore it into a safe test environment and verify record integrity.
17. Check for an application update and complete the supported update/recovery path.

The journey must be tested using realistic test data and documented expected outcomes.

## 6. Completion workstreams and implementation sequence

Work should be delivered in small, reviewable vertical slices. Each issue must identify its dependencies and preserve the existing architecture boundaries.

### A0 — Repository and development environment health

**Objective:** Establish a reproducible baseline before adding further product scope.

Requirements:
- Confirm the supported Node.js and pnpm versions.
- Confirm lockfile consistency and clean frozen installation.
- Confirm typecheck, unit tests, package builds and web production build.
- Resolve existing baseline failures before treating subsequent failures as regressions.
- Add a concise contributor/developer setup guide.
- Ensure generated files and package-manager artifacts follow repository policy.

**Acceptance criteria:**
- A clean checkout installs with the documented frozen-lockfile command.
- The documented validation commands run reproducibly.
- Any known failure is recorded with a linked issue and is not silently waived.

### A1 — Continuous integration

**Objective:** Make repository quality checks repeatable on every proposed change.

Requirements:
- Add GitHub Actions for dependency installation, typecheck, tests and required builds.
- Use the repository's approved pnpm version and frozen lockfile.
- Cache dependencies safely without making the lockfile optional.
- Run the browser production bundle guard.
- Protect merge decisions with required checks once the workflow is stable.

**Acceptance criteria:**
- Pull requests trigger the required checks.
- A failed required check blocks normal merge approval.
- Workflow instructions and supported runtime versions are documented.

### B0 — IndexedDB foundation hardening

**Objective:** Make the existing browser persistence slice reliable before expanding it.

Requirements:
- Preserve the current business/customer repository contracts.
- Verify database creation, reopening, upgrade and blocked-upgrade behaviour.
- Verify transaction completion, abort and storage/quota error handling.
- Verify business ownership checks and stale-write rejection.
- Verify data survives reload and application restart.
- Keep IndexedDB implementation details inside the web/persistence adapter boundary.
- Do not store business records in localStorage.

**Acceptance criteria:**
- Automated tests cover successful persistence and failure paths.
- A browser user receives actionable storage errors and durability guidance.
- Existing SQLite adapters and migrations remain unaffected.

### B1 — Product and saved GST-rate browser persistence

**Objective:** Complete the product/service workflow in the browser.

Requirements:
- Implement IndexedDB persistence for products and saved GST-rate records.
- Preserve business ownership and referenced-rate validation.
- Keep writes atomic where the application contract requires it.
- Support product create, edit, list, retrieve and inactive/active behaviour.
- Ensure a product's saved GST-rate configuration remains distinct from versioned statutory tax rules.

**Acceptance criteria:**
- Product data survives reload and restart.
- Cross-business references and invalid saved-rate references are rejected.
- Browser tests cover normal and failure cases.
- The browser build remains free of Node-only dependencies.

### B2 — Billing document and invoice browser persistence

**Objective:** Deliver complete browser-based billing workflows.

Requirements:
- Persist document headers, line items, document snapshots and numbering state.
- Support drafts, draft editing, finalization, retrieval and permitted lifecycle actions.
- Preserve atomic invoice finalization and number allocation.
- Keep finalized financial snapshots immutable.
- Preserve user-selected document dates and optional due dates.
- Derive numbering financial year from the saved document date.
- Implement safe retry/idempotency behaviour for commands where required.
- Ensure payment state remains separate from document lifecycle state.

**Acceptance criteria:**
- A user can create, save, retrieve, edit and finalize supported documents in the browser.
- Concurrent/retried operations cannot create duplicate finalized numbers or partial documents.
- Finalized document values cannot be silently changed.
- Browser persistence tests cover transaction abort and reload scenarios.

### B3 — Template persistence and customization

**Objective:** Complete the user-facing invoice presentation workflow.

Requirements:
- Persist selected templates and approved vendor customization.
- Support safe label and visibility changes, approved custom fields and section configuration.
- Preserve template/revision snapshots required for historical documents.
- Ensure presentation configuration cannot alter tax or financial calculations.
- Provide a representative preview before a template is applied.

**Acceptance criteria:**
- Template settings survive reload.
- Historical finalized documents render using their retained presentation/data snapshots according to the approved design.
- Invalid or unsafe field configuration is rejected.
- Tests prove template changes cannot modify financial values.

**Implementation status:** Browser template persistence, defaults, safe customization, revision history, custom-field snapshots, document template selection and representative preview were merged in PR #66. IndexedDB upgrade, cross-business ownership, reload persistence, invalid configuration and historical-render behavior have focused coverage.

### B4 — Payment persistence and customer payment activity

**Objective:** Complete the browser payment workflow without weakening financial invariants.

Requirements:
- Persist receipts, customer advances, allocations, allocation releases, refunds and reversals.
- Keep financial commands atomic and idempotent where specified.
- Preserve receipt-time business/customer identity snapshots.
- Derive unallocated advance balances, invoice settlement and customer activity summaries from source events.
- Load payment activity from one consistent read snapshot.
- Keep ordinary payment receipts distinct from statutory GST receipt vouchers.
- Do not implement statutory automation without the required compliance approval.

**Acceptance criteria:**
- Users can record and retrieve receipts, allocate/release amounts and record approved refund/reversal events.
- Duplicate retries do not duplicate financial events.
- Customer balances and invoice settlement are derived consistently.
- Browser tests verify transaction atomicity and read-snapshot consistency.

**Implementation status:** Browser IndexedDB payment event stores, customer receipt identity snapshots, idempotent commands, allocations, refunds/reversals, invoice settlement and a customer payment activity screen are implemented on the current feature branch. Persistence, financial invariant, and consistent-snapshot tests are included; merge and release status must be tracked separately.

### C1 — Billing and GST completion

**Objective:** Close the gap between core calculation foundations and an adequately verified V1 GST workflow.

Requirements:
- Audit all supported GST paths against the approved GST compliance specification.
- Validate intra-state/inter-state treatment, place of supply and relevant transaction context.
- Verify CGST/SGST/UTGST/IGST component handling and rounding.
- Verify inclusive and exclusive pricing, discounts, charges and taxable-value calculations.
- Verify HSN/SAC display and the boundary between user-saved rates and statutory reference data.
- Identify unsupported scenarios explicitly in the product rather than implying support.
- Record source, effective date, version and review owner for GST reference data.
- Obtain qualified GST-practitioner review for statutory workflows and edge cases.

**Acceptance criteria:**
- Every supported GST scenario has traceable rules and automated tests.
- Unsupported or unverified scenarios are documented and safely blocked or clearly constrained.
- No tax calculation is implemented in UI components.
- A compliance review record identifies the reviewer, sources, date and scope.

**Current status:** An internal engineering audit, coverage expansion and browser limitations notice are recorded in [the GST supported-scenarios review](./gst-supported-scenarios-review.md). Qualified GST-practitioner review is reported complete by the project owner on 1 November 2026; the reviewer, sources/amendments, scope, findings and explicit approval still need to be recorded. C1 remains open until the review record is complete and must not yet be treated as V1 GST compliance sign-off.

### C2 — Document rendering, PDF, print and share

**Objective:** Provide reliable, consistent customer-facing document output.

Requirements:
- Use one canonical document/render model for preview, PDF and print.
- Ensure output uses persisted document values and tax snapshots.
- Display exactly the saved document date.
- Do not print a generated-on date by default.
- Verify page breaks, long descriptions, multiple items, addresses, tax summaries, notes and terms.
- Verify logo/image handling, fonts and supported paper sizes.
- Implement supported share/download behaviour without leaking local file paths or business data.
- Keep Node-only PDF/filesystem dependencies out of the browser dependency graph.

**Acceptance criteria:**
- Preview, PDF and print show matching business, customer, line, tax and total values.
- Historical finalized documents remain reproducible from their saved snapshots.
- Output is legible for realistic short and long invoices.
- Browser production bundle checks pass.

**Current status:** The initial browser implementation is merged: finalized documents render from the canonical issued render model, with print, PDF download and native file-share/fallback download actions. C2 remains in progress; realistic browser-output verification, template font/logo support and supported-platform manual checks are outstanding.

### M9 — Backup and recovery

**Objective:** Protect business records against accidental loss, browser storage eviction and device migration.

Requirements:
- Define a versioned backup format and include all required business-owned records and metadata.
- Validate backup structure, schema version, integrity and compatibility before restore.
- Provide a clear backup/export workflow.
- Provide a restore workflow with explicit confirmation and a safe failure path.
- Avoid partial restore states; use staging/validation before replacing or importing live data.
- Define behaviour for duplicate IDs, unsupported versions and corrupted backups.
- Decide and document whether backups are encrypted and how any password/key is handled.
- Explain browser storage limitations and the user's responsibility to maintain backups.
- Treat cloud backup as optional and distinct from synchronization.

**Acceptance criteria:**
- A complete backup can be created and independently validated.
- A backup can be restored into a clean test profile with record counts and financial invariants preserved.
- Invalid/corrupted backups are rejected without damaging current data.
- Backup and restore operations are tested across supported schema versions.
- User-facing guidance explains where the backup is stored and how to protect it.

**Current status:** M9 is complete for the current browser schema. AES-GCM/PBKDF2-protected export and validation-before-atomic-restore cover all ten business-owned IndexedDB stores. Automated tests restore a financial workspace into a clean profile, compare records and per-store counts, and verify invoice settlement and customer advance invariants. Backup format version 1 supports IndexedDB schema version 5 only and rejects other schemas; see [M9 backup and recovery guidance](./32-m9-backup-recovery.md). Real-browser/platform verification and future compatibility conversions remain maintenance work. Cloud backup and synchronization are out of scope.

### M10 — PWA lifecycle, update system and distribution

**Objective:** Deliver a predictable installable application and safe update path.

Requirements:
- Implement the PWA manifest, icons and service-worker lifecycle.
- Cache the application shell and required static assets for supported offline use.
- Define first-load, activation and offline limitations accurately.
- Provide visible installed version and update status.
- Implement Check for Updates and release notes.
- Define update availability, download/install, activation and rollback/recovery behaviour.
- Use a versioned release manifest containing at minimum semantic version, release date, minimum supported version, supported platforms, architecture, download/reference URL, integrity metadata, database migration information, GST rules version and release notes.
- Verify release integrity before applying an update where the platform permits.
- Ensure updates do not silently erase or downgrade user data.
- Keep a safe foreground retry path for platform-dependent background operations.
- Document hosting, distribution and support ownership.

**Acceptance criteria:**
- The app installs on every platform included in the V1 support matrix.
- Previously loaded application assets support the documented offline behaviour.
- Update checks handle available, unavailable, failed and incompatible releases.
- Update/migration failure does not silently destroy local business records.
- The installed and GST rules versions are visible to the user.

**Current status:** M10 implementation is present but release verification is open. The app has root-scoped PWA metadata and PNG/SVG icons, offline shell caching with prior-cache retention, and a foreground update flow that validates version/platform/browser/schema compatibility and generated SHA-256 hashes before user activation. The approved browser policy is the latest three major releases, with Windows/Android browser support for Chrome/Edge/Firefox and Safari-only iOS/iPadOS support; see [M10 lifecycle and release contract](./33-m10-pwa-lifecycle.md). The version remains `0.0.0-dev`; production hosting is intentionally deferred. Real-platform install/offline/update/recovery verification, minimum OS versions, and production hosting/signing ownership remain release gates.

### M11 — Quality assurance and release verification

**Objective:** Verify product correctness, data integrity, security and platform reliability.

The QA plan must include:

1. **Unit tests:** Money arithmetic, rounding, tax components, validation, numbering, lifecycle transitions and derived payment calculations.
2. **Application tests:** Use-case behaviour, authorization/ownership checks, command idempotency and error handling.
3. **Persistence tests:** SQLite and IndexedDB repository contracts, transaction boundaries, migrations, aborts and reload durability.
4. **Integration tests:** Full business/customer/product/document/payment workflows and canonical rendering.
5. **GST compliance tests:** Approved intra/inter-state cases, rates, discounts, charges, inclusive/exclusive pricing and documented limitations.
6. **Document tests:** Template snapshots, preview/PDF/print consistency, long content and historical rendering.
7. **Offline tests:** Previously loaded app startup, local CRUD, billing and recovery behaviour under disconnected conditions.
8. **Backup tests:** Integrity, restore, corruption, unsupported versions and preservation of financial invariants.
9. **Update tests:** Release metadata, integrity validation, migration compatibility, failed update and recovery.
10. **Security tests:** Authentication, authorization, session handling, data isolation, secret handling and administrative access.
11. **Browser/device tests:** The explicitly supported Windows, Android, iPhone/iPad and macOS browser/device combinations.
12. **Usability tests:** First-run setup, validation messages, empty states, recovery guidance and common billing tasks.

**Acceptance criteria:**
- Required automated checks pass on the release candidate.
- Critical user journeys pass on the supported platform matrix.
- No unresolved critical or high-severity defect remains.
- Known limitations are documented and accepted by the product owner.
- Test evidence is retained with the release record.

### M12 — V1 release and operational readiness

**Objective:** Publish a stable V1 release with support and recovery processes in place.

Requirements:
- Complete the approved V1 scope and all mandatory release gates.
- Finalize production hosting and distribution.
- Configure account, email and payment services if included in the approved V1 release scope.
- Configure production secrets and access controls outside source control.
- Publish privacy, backup, update and support documentation.
- Define support contact, issue intake, severity and escalation process.
- Define monitoring and privacy-conscious operational telemetry.
- Prepare release notes, known limitations and version metadata.
- Validate a production-like installation, activation, offline billing, backup and update.
- Prepare a rollback/incident response procedure.

**Acceptance criteria:**
- Product owner signs the V1 release checklist.
- Production smoke tests pass.
- A verified backup and restore path exists.
- Release artifacts and checksums/integrity metadata are published as designed.
- Support and incident ownership are assigned.
- The release is tagged and documented.

## 7. Cross-cutting architecture and data rules

All implementation work must continue to follow the approved architecture and repository contracts:

- UI components must not contain GST calculations, financial arithmetic or persistence policy.
- Domain and application layers must remain independent of browser and Node-specific runtime APIs.
- Persistence adapters implement the approved repository contracts.
- IndexedDB implementation details remain inside the browser persistence boundary.
- SQLite compatibility and its existing migration history must be preserved unless a separately reviewed migration plan authorizes a change.
- Schema changes require versioned migrations and upgrade tests.
- Financial command boundaries must remain atomic.
- Finalized documents and receipt-time identity snapshots must not be silently rewritten.
- Payment status and balances are derived from source events and allocations.
- Money calculations must use the approved exact decimal/numeric strategy, not binary floating-point arithmetic.
- Templates affect presentation only, never financial calculations.
- Network services must not become hidden dependencies for routine local billing.
- Cloud backup and cloud sync are separate, optional capabilities.
- Business data must remain local in local-only mode.
- Secrets, credentials and private keys must not be committed to the repository.

## 8. Security, account and service prerequisites

The repository's current browser foundation does not mean customer account security or cloud services are implemented.

Before public release, the product owner must confirm the exact V1 account/service scope. Where included, implementation must cover:

- Registration and authentication.
- Email verification and password reset.
- Secure password storage, session lifecycle and account recovery.
- Authorization and business/device ownership checks.
- Admin access separated from customer access, with MFA, role-based permissions and audited actions.
- Subscription/entitlement validation and payment gateway integration where required by the approved commercial model.
- Privacy-conscious telemetry with clear notice, appropriate controls and retention limits.
- Safe account suspension behaviour that does not delete locally stored business data.

Offline entitlement/grace behaviour must be explicit and tested. Remote revocation cannot be assumed to reach a permanently offline device until it reconnects.

## 9. Open product-owner decisions

The product owner has approved the following scope:

- **Distribution:** V1 includes both a PWA and packaged desktop distribution. Exact supported platforms and minimum versions remain deferred.
- **Accounts and commercial services:** V1 includes accounts, subscriptions and payment-gateway capability. Providers, plans, entitlement/grace rules and operational ownership remain to be decided.

The following decisions still require explicit confirmation before dependent work is treated as final:

1. **Supported environment matrix:** Confirm exact browser versions and minimum operating-system versions for the PWA and packaged desktop targets.
2. **Backup protection:** Resolved for M9: local backups must use passphrase-based authenticated encryption. A lost passphrase cannot be reset or recovered; the export/restore workflow must make this limitation clear.
3. **Business profiles:** Confirm whether one local installation supports one active business profile or multiple business profiles.
4. **Credit/debit note statutory workflows:** Confirm the approved correction workflows only after accountant and qualified GST-practitioner review.
5. **GST reference data:** Confirm source, update cadence, effective-date handling and review owner.
6. **Hosting and distribution:** Confirm production hosting, release artifact location and ownership of signing/integrity keys.
7. **Support model:** Confirm support channel, response expectations and incident owner.

Do not invent answers to these decisions inside implementation tasks. Record each approved decision in the relevant product/architecture document and link it from dependent issues.

## 10. Documentation deliverables

Keep the repository documentation aligned with implementation. At minimum, completion work must update or add:

- Product decisions and approved scope changes.
- Architecture and persistence adapter decisions.
- Database schema and migration notes.
- GST source/version/review records and known limitations.
- Template customization and rendering behaviour.
- Backup format, restore and recovery instructions.
- PWA platform matrix and offline behaviour.
- Update manifest and release procedure.
- Developer setup and CI instructions.
- QA plan, test evidence and known defects.
- V1 release checklist, release notes and support instructions.

Documentation must describe what is implemented and verified, not what is merely planned.

## 11. Development execution contract

Every implementation issue or pull request must include:

- **Objective:** The specific outcome being delivered.
- **User value:** The business/user problem it solves.
- **Scope:** Included behaviour and explicit exclusions.
- **Requirements:** Relevant product, architecture, database and compliance rules.
- **Acceptance criteria:** Observable conditions that prove completion.
- **Expected areas/files:** Likely packages and boundaries, subject to repository inspection.
- **Tests:** Required automated and manual verification.
- **Dependencies:** Prior issues, decisions or review gates.
- **Documentation:** Required updates.

### Definition of Ready

An issue is ready when its scope is understood, dependencies are available, product decisions are resolved or explicitly isolated, and acceptance criteria are testable.

### Definition of Done

An issue is done only when:

- The approved behaviour is implemented.
- Relevant automated tests are added or updated.
- Required validation commands pass, with evidence recorded.
- Architecture, ownership, atomicity and data-integrity constraints are preserved.
- User-facing errors and edge cases are handled.
- Documentation is updated.
- The change is reviewed and merged through the repository's agreed workflow.

A placeholder screen, an interface-only change or a domain-only foundation does not satisfy an end-to-end workflow acceptance criterion.

## 12. Risks and controls

| Risk | Control |
| --- | --- |
| Local browser storage is cleared or evicted | Implement validated backup/restore, request persistent storage where supported and communicate limitations. |
| Browser persistence is expanded before command boundaries are safe | Follow the async repository and transaction contracts; implement one vertical slice at a time. |
| Financial records become inconsistent during retries or failures | Preserve atomic transactions, idempotency and derived read models; test abort/retry paths. |
| GST coverage is overstated | Maintain source-backed rules, scenario tests, explicit limitations and qualified review. |
| Updates damage or strand local data | Validate release metadata, integrity and migrations; test failure recovery and preserve backups. |
| Platform behaviour differs | Define a support matrix and test actual supported browser/device combinations. |
| Scope expands during implementation | Classify changes as V1, future or rejected and obtain product-owner approval. |
| Security/cloud scope is mistaken for completed functionality | Track specification and implementation separately; gate public release on mandatory security work. |
| Build/test failures are hidden by local environment differences | Use reproducible frozen installs and CI; record exact commands and failure output. |

## 13. V1 release gate

Fledge Billing must not be described or published as production-ready until all mandatory items below are satisfied:

- [ ] Approved V1 scope is implemented end to end.
- [ ] Clean frozen dependency installation succeeds.
- [ ] Typecheck and required package builds pass.
- [ ] Unit, integration, persistence and browser tests pass.
- [ ] Critical GST scenarios are source-backed, tested and reviewed.
- [ ] Document numbering and finalized-document immutability are verified.
- [ ] Payments, allocations, refunds and reversals preserve financial invariants.
- [ ] Preview, PDF and print output are consistent with saved document snapshots.
- [ ] Supported offline workflows pass on the declared platform matrix.
- [ ] Backup and restore are validated, including corrupted/unsupported backup handling.
- [ ] Update lifecycle and migration recovery are tested.
- [ ] Mandatory authentication, authorization and service controls are implemented for the approved release scope.
- [ ] No unresolved critical or high-severity defects remain.
- [ ] Privacy, user guidance, developer documentation and support process are ready.
- [ ] Production smoke test and owner sign-off are complete.

Any exception must be explicit, documented, risk-assessed and approved by the product owner. A checklist must not be marked complete without evidence.

## 14. Completion definition

The product is complete for V1 when a real business can set up its profile, manage customers and products, create and finalize supported billing documents, calculate and present supported taxes, record and retrieve payments, operate within the documented offline limits, protect its records through backup and restore, and receive safe application updates.

The guiding rule is:

> Build and verify the complete business workflow, not merely the screens or underlying technical foundations.

---

**Document control:** This PRD is a living execution baseline. Changes to product scope, statutory behaviour, security commitments or release criteria require explicit review and corresponding updates to the authoritative project documents.
