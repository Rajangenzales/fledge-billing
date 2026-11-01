# Fledge Billing V1 — Acceptance Runbook

**Status:** Bundle D execution record  
**Version:** 1.0  
**Prepared:** 1 November 2026  
**Baseline commit:** `47f8d044f6cc843eeff9061489c268ddc02fab46`  
**Purpose:** Coordinate final deployment, manual acceptance, defect triage and V1 release decisions. This runbook records test evidence; it does not itself certify release readiness.

## 1. Release rule

Fledge Billing must not be described as production-ready or released as V1 until the mandatory gates in this document have evidence and product-owner approval.

Automated CI success is necessary but does not replace real-browser/device acceptance. A successful hosting status is not proof that the current application build is publicly reachable or correctly configured.

Use synthetic business, customer, product and payment data during acceptance. Do not enter real customer financial records into a test deployment.

## 2. Baseline at Bundle D start

- Bundle A, B and C implementation changes are merged into `main`.
- Bundle C merge commit: `47f8d044f6cc843eeff9061489c268ddc02fab46`.
- PR #90's implementation CI passed on its head commit, according to the recorded PR validation.
- The merge commit has a successful Vercel status for `fledge-billing-v1`; the separate `web` project deployment failed because the Vercel account exceeded its daily deployment quota. The successful status currently points to a Vercel deployment record, not a verified application URL.
- No real browser/device acceptance has yet been recorded.
- The production release manifest remains `0.0.0-dev`; the development descriptor is not a production release manifest.
- Backup format v1 supports IndexedDB schema version 5 only.
- The release manifest is unsigned. Same-origin HTTPS checksums do not protect against a compromised hosting origin.
- PDF generation uses the portable built-in Helvetica face; custom embeddable PDF fonts are not bundled.
- Authentication, subscription services, payment-gateway integration and the Admin Control Centre are not implemented.
- GST-practitioner review has been reported by the product owner, but reviewer identity, sources/amendments, scope, findings and explicit approval are not yet recorded as evidence.

## 3. Deployment and release configuration gate

Before inviting acceptance testers:

- [ ] Confirm the canonical V1 deployment project and its owner.
- [ ] Confirm the actual public HTTPS application URL by opening it in a clean browser profile.
- [ ] Confirm the deployed commit SHA matches the intended release candidate.
- [ ] Confirm the production build publishes the HTML shell, hashed assets, service worker and release manifest atomically.
- [ ] Replace the development version with an approved semantic release version and real release date.
- [ ] Set minimum supported application version, browser-major floors, supported platform list, schema compatibility, GST rules version and release notes.
- [ ] Confirm hosting, domain, TLS, deployment permissions, rollback/recovery and operational ownership.
- [ ] Decide whether signing/integrity-key ownership is required for this release. Do not describe unsigned same-origin checksums as signed artifact verification.
- [ ] Keep secrets and private keys outside source control.
- [ ] Confirm privacy notice, support intake, incident owner and escalation route before public/commercial release.

### Deployment observation

At Bundle D start, the GitHub commit status for the merge commit reports:
- `Vercel – fledge-billing-v1`: success.
- `Vercel`: failure, with Vercel reporting the `web` project exceeded the free-plan daily deployment limit.

Do not infer the application URL from the Vercel dashboard link. Record the actual verified URL and commit SHA here after opening the deployed app.

**Verified deployment URL:** Pending  
**Verified deployment commit:** Pending  
**Verification date/time and tester:** Pending

## 4. Product and release decisions

The product decision register (issue #59) must be resolved or explicitly deferred with owner approval. In particular:

- [ ] Confirm PWA and packaged desktop distribution scope for this release. The product completion PRD records both as the approved direction, while implementation currently documents a PWA path; packaged desktop distribution is not evidenced as complete.
- [ ] Confirm exact browser and operating-system support floors. The current browser policy covers the latest three major releases, but minimum OS versions are not encoded.
- [ ] Confirm one versus multiple business profiles per local installation.
- [ ] Confirm production hosting, artifact distribution and integrity/signing ownership.
- [ ] Confirm support channel, response expectations and incident owner.
- [ ] Confirm whether accounts, subscriptions and payment-gateway capability are mandatory for the intended public/commercial V1. These capabilities are not implemented.
- [ ] Record the GST practitioner review with reviewer identity, date, authoritative sources and amendments, scenario scope, findings, limitations and explicit approval.
- [ ] Keep statutory credit/debit note workflows and unsupported GST determinations outside the accepted scope unless separately reviewed and approved.

No implementation or release claim may silently resolve an owner decision.

## 5. Synthetic acceptance workspace

Use clearly fictional records, for example:

**Business**
- Name: Fledge Demo Traders
- State: Kerala
- GST status: Registered
- GSTIN: Use a clearly invalid test placeholder, never a real GSTIN
- Financial year and invoice numbering: use a fresh test series

**Customer**
- Name: Harbour Demo Stores
- State: Kerala for an intra-state test
- Use a second fictional customer in Tamil Nadu for an inter-state workflow test
- Use fictional phone/email/address values

**Products**
- One taxable product with a user-selected saved GST rate for arithmetic verification
- One non-taxable/non-GST product or service for a non-GST document test
- One product with a long description for rendering and pagination checks

Do not use the GST test records as proof that Fledge determines statutory HSN/SAC rates, reverse charge, or complex place-of-supply rules. Verify only the supported, explicitly selected scenarios.

## 6. Manual end-to-end acceptance

Record each test as **Pass**, **Fail**, **Blocked** or **Not tested**. Attach screenshots or exported test artifacts only when they contain synthetic data.

### A. Setup and persistence

- [ ] Complete first-run business setup and select a sector preset.
- [ ] Verify the matching GST/non-GST document template default.
- [ ] Edit and save business details.
- [ ] Create, edit, deactivate and retrieve a customer.
- [ ] Create, edit, deactivate and retrieve a product and saved GST rate.
- [ ] Reload the app and confirm records persist.
- [ ] Verify records remain scoped to the selected business profile.
- [ ] Verify empty, invalid and duplicate-entry states provide understandable feedback.

### B. Billing and financial correctness

- [ ] Create and save a draft GST invoice.
- [ ] Edit the draft and verify saved values.
- [ ] Verify line arithmetic, quantity, unit price, discount, charges, tax components and grand total.
- [ ] Verify intra-state CGST/SGST and the explicitly supported inter-state IGST case.
- [ ] Verify inclusive and exclusive pricing only where supported by the selected configuration.
- [ ] Create a non-GST Bill of Supply or supported non-GST document.
- [ ] Verify quotation creation and conversion/related workflow where available.
- [ ] Verify credit duration and due-date defaults, including custom editing.
- [ ] Verify promotional offers are visible as descriptive offer information and do not silently change invoice totals.
- [ ] Finalize a valid invoice and confirm numbering uses the saved document date and financial year.
- [ ] Reload and confirm finalized values and snapshots remain unchanged.
- [ ] Retry a finalization/payment action where safe and confirm no duplicate financial event or document number is created.
- [ ] Verify cancellation/correction behaviour is explicit and does not silently mutate finalized financial history.

### C. Payments and customer activity

- [ ] Record a receipt against an invoice.
- [ ] Record an advance without allocating it immediately.
- [ ] Allocate and release/reallocate an advance where supported.
- [ ] Verify invoice settlement and customer outstanding balances.
- [ ] Verify customer payment activity and receipt-time identity snapshots.
- [ ] Exercise a supported refund/reversal with synthetic values.
- [ ] Reload and verify the resulting financial invariants.
- [ ] Confirm ordinary receipts are not presented as statutory GST vouchers.

### D. Document output

- [ ] Compare the on-screen issued-document preview with the saved finalized document.
- [ ] Download the PDF and compare business/customer identity, document number/date, line descriptions, quantities, rates, discounts, charges, tax breakdown and totals.
- [ ] Print the same document to PDF or paper and compare the same values.
- [ ] Verify logo output using a PNG or JPEG test logo.
- [ ] Verify selected brand colour and density in preview, PDF and print.
- [ ] Verify the selected browser typeface preference in browser preview/print. Note that PDF uses built-in Helvetica.
- [ ] Test long descriptions, many line items, long addresses, notes and terms across page boundaries.
- [ ] Verify historical finalized documents still render from their stored snapshots.
- [ ] Verify download/share fallback behaviour in the target browser.

### E. Backup and restore

- [ ] Create an encrypted backup using a strong test passphrase.
- [ ] Record the backup format and schema version.
- [ ] Restore into a clean browser profile or clean test workspace.
- [ ] Compare per-store record counts and key business records.
- [ ] Verify invoice outstanding and customer advance invariants after restore.
- [ ] Attempt a corrupted backup and confirm it is rejected without damaging current data.
- [ ] Attempt an unsupported schema/version and confirm it is rejected safely.
- [ ] Confirm the passphrase-loss warning is understood. Lost backup passphrases cannot be recovered.
- [ ] Confirm users understand that browser storage may be cleared or evicted and that independent backups are necessary.

### F. Offline and PWA lifecycle

- [ ] Load the application successfully while online.
- [ ] Install it using the browser's supported PWA installation path.
- [ ] Close and reopen the installed app.
- [ ] Disconnect the network and confirm the previously loaded shell opens.
- [ ] Create and retrieve local business records while offline.
- [ ] Create and save a supported billing document while offline.
- [ ] Confirm network-dependent features fail visibly and can be retried after reconnecting.
- [ ] Reconnect and confirm the app resumes normally.
- [ ] Test an available update and user-controlled activation.
- [ ] Test an incompatible or failed update and confirm the active app and IndexedDB records remain intact.
- [ ] Confirm the previous complete shell cache remains available as documented.
- [ ] Confirm first-load offline and never-fetched lazy assets are not represented as supported.

## 7. Platform test matrix

The approved browser/OS policy is documented in `docs/33-m10-pwa-lifecycle.md`. It is a target matrix, not evidence of completed testing.

| OS target | Browser targets | Install path | Evidence |
|---|---|---|---|
| Windows | Chrome, Edge, Firefox | Chrome/Edge | Pending |
| Android | Chrome, Edge, Firefox | Browser install/add-to-home | Pending |
| iOS | Safari | Add to Home Screen | Pending |
| iPadOS | Safari | Add to Home Screen | Pending |
| macOS | Chrome, Edge, Firefox, Safari | Chrome/Edge/Safari Add to Dock where supported | Pending |

Firefox on Windows/macOS is a browser target, not a promised native standalone installation path. Other iOS/iPadOS browsers are outside the current matrix. Record actual OS versions during testing; do not invent minimum OS versions.

**Initial owner pilot:** Run the full core journey on the product owner's everyday desktop browser first. This is a pilot only and does not replace the complete declared platform matrix.

## 8. Automated validation evidence

For the release candidate, record the exact commit SHA and results for:

- [ ] Frozen dependency installation: `pnpm install --frozen-lockfile`
- [ ] Tests: `pnpm test`
- [ ] Typecheck: `pnpm typecheck`
- [ ] Workspace build: `pnpm build`
- [ ] Browser production build: `pnpm web:build`
- [ ] GitHub Actions required checks
- [ ] Browser dependency guard
- [ ] Backup/restore and update lifecycle regression tests

A PR check from an earlier head commit is not a substitute for checks on the release candidate commit.

**Release candidate SHA:** Pending  
**Automated validation run URL:** Pending  
**Result:** Pending

## 9. Defect severity and stop conditions

- **Critical:** Data loss/corruption, incorrect financial totals, duplicate finalized numbering/financial events, cross-business data exposure, broken restore that damages live data, or an update that destroys access to business records. Stop acceptance and release.
- **High:** A primary business workflow is blocked, documents materially disagree, offline billing fails within the documented scope, or a supported platform cannot install/open/update. Stop public release until fixed or explicitly excluded with owner approval.
- **Medium:** A workaround exists but causes material friction or confusing output. Record and obtain owner disposition before release.
- **Low:** Cosmetic or minor usability issue with no financial, privacy, data-integrity or core workflow impact. Record for triage.

Never close an acceptance issue merely because automated tests pass. Attach the actual manual evidence.

## 10. Final sign-off record

- [ ] Deployment URL and commit SHA verified.
- [ ] Product-owner decisions resolved or explicitly deferred.
- [ ] Automated checks pass on the release candidate.
- [ ] Critical user journeys pass on the declared platform matrix.
- [ ] Document preview/PDF/print comparison passes.
- [ ] Backup/restore and offline/update recovery pass.
- [ ] GST review evidence is recorded and scope limitations are visible.
- [ ] No unresolved critical/high-severity defects remain.
- [ ] Privacy, support, incident and recovery ownership are ready.
- [ ] Product owner has personally used Fledge and approved the tested experience.
- [ ] V1 release notes, release metadata and rollback procedure are ready.

**Product-owner decision:** Pending  
**Acceptance evidence location:** Pending  
**Release approval date:** Pending

Presentation and launch materials are intentionally excluded from this runbook. Prepare them only after the product owner has completed hands-on use and final V1 acceptance.
