# Fledge Billing — Roadmap, Milestones & Cursor Development Contract

**Phase:** 8 of 8  
**Status:** Approved implementation contract  
**Version:** 1.4

## 1. Development Rule

Cursor or any other coding agent must not invent architecture or product scope. The approved product, architecture, database, compliance, template, distribution, platform and milestone documents are the source of truth. Every implementation task must reference the relevant document.

## 2. Milestones

### M0 — Foundation
Repository structure, application shell, environment configuration, logging, error handling, testing foundation.

### M1 — Business Setup
Business profile, State/UT master, GST registration settings, application settings.

### M2 — Customers
Customer CRUD, addresses, State/UT, GSTIN and registration data.

### M3 — Products & Services
Product/service CRUD, HSN/SAC, units, saved GST configuration, tax-inclusive setting.

### M4 — Billing Engine
Documents, line items, discounts, charges, totals, lifecycle, numbering.

### M5 — GST Engine
GST rules, state/UT context, place of supply, CGST/SGST/UTGST/IGST, rates, inclusive/exclusive pricing, rounding and tests.

### M6 — Invoice Templates and Vendor Customization
Template model, built-in templates, vendor-editable safe labels/fields/sections, custom fields, versioning and rendering model.

### M7 — PDF / Print / Share
Deterministic invoice rendering, PDF, print and share.

### M8 — Payments, Advances & Financial Adjustments
Payment events, customer advances, unallocated balances, payment allocations/reallocations, partial and multiple payments, refunds/reversals, derived balances/statuses, linked receipts, and linked credit/debit notes with independent numbering and tax snapshots.

### M9 — Backup & Recovery
Local backup, restore, validation, recovery workflows and optional encrypted cloud backup. Cloud backup must not be confused with synchronization.

### M10 — Update System
Version metadata, PWA/service-worker update lifecycle, Check for Updates, release notes, update state and migration handling.

### M11 — QA
Calculation tests, lifecycle tests, migration tests, rendering tests, offline tests, update tests, security tests and cross-platform browser/device validation.

### M12 — V1 Release
PWA deployment, production hosting, documentation, release checklist, account/payment service configuration, support/monitoring and production validation.

## 2.1 Verified implementation snapshot — main after PR #18

This snapshot records merged repository work as of 31 October 2026. A merged milestone label does not mean every legal scenario, user workflow or release criterion in that milestone is complete.

| Area | Repository status | Verified scope and remaining boundary |
| --- | --- | --- |
| M0 — M4 | Implemented baseline | TypeScript monorepo, SQLite migrations through version 8, business/customer/product records, billing documents, exact money arithmetic and document numbering. |
| M5 — GST Engine | Core implementation merged (PR #12) | CGST/SGST/UTGST/IGST component calculations, explicit GST rate input, inclusive/exclusive pricing, tax snapshots and tests. No HSN/SAC rate lookup; place-of-supply determination for IGST Act sections 10–13 remains unresolved; compensation cess is not calculated; reverse-charge support is restricted. Do not describe this as complete coverage of all GST scenarios. |
| M6 — Templates | Partially implemented (PRs #13–17) | Built-in template snapshots, safe label/visibility edits, custom-field snapshots, sample preview and historical rendering. Section/field reordering and full brand customization remain outstanding. |
| M7 — PDF / Print / Share | Partially implemented (PR #18) | Local PDF export and printable text from the issued-document render. Full customer-facing print preview and platform share workflow remain outstanding. |
| M8 — Payments and Adjustments | Not started | No payment ledger, advances, allocations, refunds, credit/debit notes or receipt-from-payment implementation is verified yet. Expanded design is in docs/12-m8-payments-advances-and-adjustments-design.md. |
| PWA and platform foundations | Specification only | The app package remains a CLI/local HTTP health shell. No customer-facing PWA, service worker, IndexedDB adapter or browser-based offline billing is implemented. |
| Security and accounts | Specification only | Registration, authentication, email verification, password reset, sessions and authorization are not implemented. |
| Cloud services | Specification only | Optional cloud backup, multi-device sync, subscription gateway, Admin Control Centre and product analytics are not implemented. |

The current main-branch SQLite registry has eight migrations. The M8-02A branch adds migration 9 for customer receipts. Preserve the existing SQLite implementation and migration history while introducing future adapters.

**M8 design progress (31 October 2026):** M8-01 product direction has owner approval, with statutory automation still gated on qualified GST-practitioner review. M8-02 payment and customer-advance domain design is documented in [docs/14](./14-m8-02-payment-advance-domain-model.md). M8-02A adds customer receipt persistence, idempotent receipt recording and a derived unallocated customer advance. Allocations, refunds, credit/debit notes, statutory receipt vouchers and GST advance automation remain out of scope.

**Next implementation focus:** complete M8-02A receipt persistence and validation, then implement allocation history and derived invoice outstanding balances using docs/12 and docs/14. Statutory GST treatment remains gated on practitioner review. Do not reconcile payments against mutable or incomplete financial snapshots. Cross-cutting security and PWA foundations remain mandatory before public release. Do not claim production readiness or cross-platform offline PWA support yet.


## 3. Cross-cutting platform and service prerequisites

The product direction and detailed contracts are defined in docs/11-pwa-offline-sync-and-platform-operations.md. These are cross-cutting capabilities, not a reason to implement every subsystem in one PR.

Before public V1 release, plan and implement focused issues for:

- Cross-platform PWA shell and supported browser matrix.
- IndexedDB persistence adapter while preserving domain/application boundaries and existing SQLite compatibility where needed.
- Offline billing and local data durability.
- Account security, email verification, password reset and sessions as defined in docs/10.
- Account/business/device identity and authorization.
- Usage-based trial allowance, monthly/annual subscription and payment gateway integration.
- Private Admin Control Centre with MFA, RBAC and audited account/device/entitlement controls.
- Detailed but privacy-conscious telemetry with notice, opt-out for optional analytics and retention limits.
- Optional encrypted cloud backup, restore and deletion.
- Optional multi-device synchronization designed into the architecture and released only after conflict, numbering, payment and security validation.

### Platform direction

- Product name: Fledge Billing.
- Delivery direction: cross-platform Progressive Web Application (PWA).
- Initial target platforms: Windows, Android, iPhone/iPad and macOS.
- PWA browser persistence: IndexedDB adapter.
- Existing SQLite implementation must not be casually deleted or replaced. Inspect actual code and preserve data/migration compatibility.
- Routine billing must work offline after initial app assets and account activation are available.
- Default business data mode is local-only.
- Cloud backup and cloud sync are separate, optional, explicitly enabled features.
- Background sync is platform-dependent. Always provide a safe foreground retry path; do not promise immediate background upload on every platform.

## 4. Security prerequisite

The M0–M4 repository does not yet implement authentication, login, password protection, email verification, password reset, sessions or authorization. Before customer-facing account UI or public release, implement and test the account-security prerequisite defined in docs/10. Email verification is online; already activated local billing must remain usable offline.

Admin authentication is separate from customer authentication and must include MFA, role-based permissions and immutable audit events. Account suspension must not delete local business data. A permanently offline device cannot receive remote revocation until it reconnects.

## 5. Data and synchronization rules

- Local-first is mandatory. In local-only mode, customer business records must not be uploaded to GenZales.
- PWA structured business data is stored in IndexedDB through repository interfaces. Do not use localStorage for business records.
- Request persistent browser storage where supported, but never claim it is guaranteed. Provide export and backup guidance.
- Optional cloud backup uploads a recoverable snapshot. Optional cloud sync propagates changes between device-local databases. They are not interchangeable.
- Multi-device sync is an approved target capability: an invoice created on one device should appear on another after successful sync.
- Each device retains a local database. Do not describe this as one database directly shared by all devices.
- Sync must be idempotent, resumable, business-scoped and conflict-aware.
- Finalized financial documents are immutable. Never use last-write-wins to rewrite finalized invoices.
- Invoice numbering must remain unique across devices and offline scenarios. Design a safe allocation/reservation policy before enabling multi-device finalization.
- Payments must not duplicate during retry or conflict resolution.
- Do not enable backup or sync without explicit user consent.

## 6. Subscription and trial rules

- Subscription plans: free trial, monthly and annual.
- Trial is usage-based, not day-based.
- Admin-configurable allowance: 2–5 eligible finalized bills; recommended default is 5.
- Eligible trial bills: GST tax invoices, non-GST invoices and bills of supply.
- Drafts, quotations and payment receipts do not consume the allowance.
- Trial usage follows the account/business across devices and cannot reset through reinstall or clearing local data.
- Existing data remains accessible and exportable when trial allowance is exhausted or an account is suspended.
- Integrate a payment gateway before public launch. Use a provider-independent subscription interface and server-verified, idempotent payment webhooks.
- Fledge subscription payments are separate from customer payments recorded in the local billing database.
- Admin may issue complimentary access and make audited entitlement adjustments.
- Offline entitlement/grace policy must be documented and tested before release.

## 7. Analytics and privacy rules

Detailed operational and product analytics are approved, but must be transparent and data-minimized.

- Track defined events such as app launch, module use, finalized document counts, trial consumption, backup/sync results, app version, update results and redacted crash diagnostics.
- Do not collect invoice contents, PDFs, customer identities/contact details/GSTINs, product prices, tax values, business revenue, credentials or encryption keys.
- Separate essential security/service telemetry from optional product analytics.
- Provide a clear notice, optional analytics opt-out, event retention policy and deletion process.
- Admin dashboards should prefer aggregate metrics. Access to identifiable event-level data must be restricted and audited.
- Do not call telemetry anonymous if account/device identifiers can link events.

## 8. GitHub Issue Rule

Each milestone is decomposed into small issues. A Cursor task should normally implement one issue at a time.

Issue structure:
- Objective
- User value
- Requirements
- Acceptance criteria
- Files/modules expected
- Tests required
- Relevant architecture/PRD references
- Migration impact and rollback/safety notes where applicable

## 9. Implementation Order

Foundation → Data Model → Domain → Application Use Cases → Repositories → UI → Rendering → Distribution.

For the PWA, add the IndexedDB persistence adapter and service-worker/application shell without moving GST or money logic into the UI. Platform-specific capabilities must be isolated behind adapters.

## 10. GST Development Rule

Every GST calculation rule requires source/reference, effective date/version, deterministic test cases and expected result. No GST logic may be introduced as an unexplained conditional in UI code. If a legal scenario is ambiguous, stop and report it rather than guessing.

## 11. Invoice Development Rule

Invoice calculations are centralized. Display components consume calculation results. A change to a PDF/template must never alter invoice totals. Finalized documents retain tax, template, field and relevant identity snapshots.

## 12. Database Rule

All schema changes use migrations. Never manually mutate production schema through ad-hoc startup logic. Preserve existing M0–M4 records and test migrations from both a fresh database and the current schema. Changes to IndexedDB also require versioned, tested migrations and safe upgrade handling.

## 13. Git Rule

Use meaningful commits. Avoid mixing unrelated features. Keep the main branch buildable. Use focused branches and pull requests. Do not commit secrets, credentials, signing keys, local databases, backup payloads or real customer data.

## 14. Definition of Done

An issue is complete only when implementation exists, tests exist where applicable, acceptance criteria pass, architecture rules are respected, and documentation is updated when behaviour changes. Report commands actually run and their results. Cross-platform claims require tests on the stated platforms; do not infer iOS or Android support from desktop browser tests.

## 15. First Coding-Agent Prompt Contract

Before coding any milestone, Cursor must read:
- README.md
- docs/01-product-vision.md
- docs/02-prd-v1.md
- docs/03-architecture.md
- docs/04-database-design.md
- docs/05-gst-compliance-spec.md
- docs/06-invoice-template-system.md
- docs/07-update-and-distribution.md
- docs/08-roadmap-and-cursor-contract.md
- docs/09-technology-stack.md
- docs/10-m5-to-m8-implementation-contract.md
- docs/11-pwa-offline-sync-and-platform-operations.md
- docs/12-m8-payments-advances-and-adjustments-design.md when working on M8 or related billing-date/payment adjustments.
- docs/13-m8-01-gst-compliance-and-product-decisions.md before implementing M8 statutory date, advance, receipt-voucher or credit/debit-note behaviour.

Then the coding agent summarizes the relevant architecture and implementation plan, identifies affected packages/migrations/tests, and proceeds with one approved/specified issue. It must not redesign the system unless explicitly instructed.

## 16. Current implementation baseline and next work

Use the verified snapshot in section 2.1 as the current repository baseline. M0–M4 must not be recreated. M5 has a merged core GST component engine, but the documented statutory and product gaps remain open. M6 and M7 are partially implemented; M8 has not started.

The current app is still a CLI/local HTTP health shell. Before customer-facing release, implement the customer PWA, IndexedDB persistence, offline browser workflows, authentication/security, subscription/entitlement services, Admin Control Centre, privacy controls and platform validation in focused issues. M9–M12 remain required release milestones.

## 17. Release Gate

V1 cannot be called production-ready until critical GST calculations, financial arithmetic, invoice numbering, local data persistence, offline operation, authentication/security, vendor customization guardrails, rendering, payments, backup/restore, update behaviour, subscription/entitlement handling, privacy controls and supported-platform acceptance tests pass.

Multi-device synchronization must not be advertised as available until sync, conflict resolution, duplicate-number prevention, payment idempotency, device security and recovery tests pass.


## 18. Billing dates, GST mode and expanded M8 scope

- GST is not mandatory for every Fledge business. Registration and statutory obligations still govern the applicable business and transaction.
- Core GST/non-GST domain/application support exists, but customer-facing setup and invoice-entry workflows are not implemented.
- The saved document date is already used for numbering and rendering. The future UI must expose date selection and preserve that exact date in PDF/print.
- Do not print today's date or a generated-on date by default. Keep document date, created timestamp, finalized timestamp and optional due date separate. Financial-year numbering follows document date.
- Past/future date support is subject to legally verified validation. Technical acceptance is not legal permission.
- Payment state is separate from document lifecycle. Reconcile legacy `partial`/`paid` schema values safely if persisted.
- Payments, advances, allocations, refunds, credit notes and debit notes remain unimplemented until M8 is delivered.
- M8 depends on stable finalized totals, immutable GST snapshots, historical party identity snapshots and a canonical render model.
- Read docs/12 for detailed M8 scope. Unresolved statutory questions remain blocking decisions, not assumptions.

### Required M8 sequence

1. Verify statutory date, GST advance, receipt-voucher and credit/debit-note questions using current official sources.
2. Stabilize invoice-date policy, numbering and historical party/tax snapshots.
3. Define payment, advance, allocation, refund and adjustment domain contracts.
4. Add migration and persistence with transaction/idempotency tests.
5. Add application use cases and derived balance/payment status.
6. Add receipt, credit-note and debit-note rendering.
7. Complete offline/retry/concurrency and historical immutability tests.

Do not implement M8 as only a basic payment row tied to one invoice. It requires customer-level advances and separately traceable allocation and adjustment events.


## 19. M8-01 compliance decision gate

The official-source research baseline and proposed product decisions are recorded in docs/13-m8-01-gst-compliance-and-product-decisions.md. Key controls:

- A finalized GST invoice date represents its actual issue date. Future-dated tax invoices are not finalized; future dates may be used on drafts/pro-forma documents.
- Historical invoices genuinely issued outside Fledge may be imported with their original issue date and a separate system-entry timestamp. Do not backdate a newly issued invoice to misrepresent its issue date.
- Goods advances and services advances must not share one automatic tax treatment. Notification 66/2017-Central Tax provides advance tax-payment relief for goods within its scope; service advances require section 13 analysis.
- Statutory receipt vouchers and refund vouchers are distinct from generic payment receipts and money-transfer events.
- Credit notes and debit notes are linked independent documents. Section 34 credit-note tax-adjustment deadline and conditions must be enforced separately from commercial customer-credit accounting.
- M8 implementation remains blocked pending product-owner approval, GST-practitioner review of open statutory questions, and confirmation that M5/M6/M7 snapshot/render dependencies are adequate.

The decision record is a research baseline, not legal advice or authorization to automate unresolved tax treatment. Do not implement open decisions by inference.
