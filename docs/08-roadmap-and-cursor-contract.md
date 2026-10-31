# Fledge Billing — Roadmap, Milestones & Cursor Development Contract

**Phase:** 8 of 8  
**Status:** Pre-development implementation contract  
**Version:** 1.1

## 1. Development Rule
Cursor does not invent architecture or product scope. The approved product, architecture, database, compliance, template, distribution and milestone documents are the source of truth. Every implementation task must reference the relevant document.

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

### M8 — Payments
Payment records, derived payment status, outstanding balances, QR/payment information and receipts.

### M9 — Backup & Recovery
Local backup, restore, validation and recovery workflows.

### M10 — Update System
Version metadata, Check for Updates, release notes, update state, migration handling.

### M11 — QA
Calculation tests, lifecycle tests, migration tests, rendering tests, offline tests, update tests and security tests.

### M12 — V1 Release
Packaging, deployment, documentation, release checklist and production validation.

### Cross-cutting security prerequisite
The M0–M4 repository does not yet implement authentication, login, password protection, email verification, password reset, sessions or authorization. Before customer-facing account UI or public release, implement and test the account-security prerequisite defined in docs/10-m5-to-m8-implementation-contract.md. Email verification is online; already activated local billing must remain usable offline. Do not misrepresent this capability as already implemented.

## 3. GitHub Issue Rule
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

## 4. Implementation Order
Foundation → Data Model → Domain → Application Use Cases → Repositories → UI → Rendering → Distribution.

## 5. GST Development Rule
Every GST calculation rule requires source/reference, effective date/version, deterministic test cases and expected result. No GST logic may be introduced as an unexplained conditional in UI code. If a legal scenario is ambiguous, stop and report it rather than guessing.

## 6. Invoice Development Rule
Invoice calculations are centralized. Display components consume calculation results. A change to a PDF/template must never alter invoice totals. Finalized documents retain tax, template, field and relevant identity snapshots.

## 7. Database Rule
All schema changes use migrations. Never manually mutate production schema through ad-hoc startup logic. Preserve existing M0–M4 records and test migrations from both a fresh database and the current schema.

## 8. Git Rule
Use meaningful commits. Avoid mixing unrelated features. Keep the main branch buildable. Use focused branches and pull requests. Do not commit secrets, credentials, signing keys, local databases or real customer data.

## 9. Definition of Done
An issue is complete only when implementation exists, tests exist where applicable, acceptance criteria pass, architecture rules are respected, and documentation is updated when behaviour changes. Report commands actually run and their results.

## 10. First Cursor Prompt Contract
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

Then Cursor summarizes the relevant architecture and implementation plan, identifies affected packages/migrations/tests, and proceeds with one approved/specified issue. It must not redesign the system unless explicitly instructed.

## 11. First Implementation Issue
Start with M0 Foundation. Do not begin with invoice UI. For the current repository, M0–M4 are already implemented; do not recreate them. The next product milestone is M5, with the security prerequisite planned as a separate cross-cutting issue before account-enabled customer release.

## 12. Release Gate
V1 cannot be called production-ready until critical GST calculations, financial arithmetic, invoice numbering, data persistence, migrations, offline operation, authentication/security, vendor customization guardrails, rendering, payments, backup/recovery and update behaviour have automated/manual acceptance tests.
