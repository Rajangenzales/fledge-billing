# Fledge Billing — Cross-Platform PWA, Offline Data, Cloud Sync & Platform Operations

**Status:** Approved product and architecture direction for implementation planning  
**Version:** 1.0  
**Prepared:** 2026-10-31  
**Applies to:** Product platform, local persistence, optional backup, multi-device sync, account/subscription services, admin control centre, analytics and release planning  
**Authority:** Extends docs/01–10. It does not authorize implementation of all features in one change. Where an existing document conflicts with this direction, stop and report the conflict before changing code.

---

## 1. Product identity

The product name is **Fledge Billing**.

Use this name consistently in application metadata, account emails, user-facing screens, documentation, release notes and administrative tools. GenZales Technologies is the product operator and service provider; it is not the customer's business identity.

## 2. Approved product direction

Fledge Billing will be a cross-platform, offline-first Progressive Web Application (PWA), designed for:

- Windows laptops and desktops.
- Android phones and tablets.
- Apple iPhone and iPad.
- macOS laptops and desktops.

The product should provide one responsive application experience rather than five independently developed products. Platform-specific capabilities must be isolated behind adapters and tested on the supported browsers/operating systems.

A PWA is the selected V1 delivery direction, subject to platform validation. Do not claim identical background behaviour on every platform. In particular, background execution and automatic uploads may be restricted by browser/OS lifecycle policies. Always provide a reliable foreground retry path when the app is opened or resumed.

### 2.1 PWA requirements

- Installable where the platform/browser supports PWA installation.
- Responsive layouts for phone, tablet and desktop.
- App manifest, icons, secure HTTPS hosting and service worker.
- Offline application shell and locally available core workflows.
- Versioned service-worker assets and safe update activation.
- Clear update notification and refresh/reload behaviour.
- No reliance on a network request for routine local billing.
- Feature detection for storage persistence, file handling, sharing and background capabilities.
- Graceful fallbacks when a platform does not support a browser capability.
- Browser and OS support matrix documented and tested before V1 release.

A PWA is not an APK or a native desktop installer. If a future app-store/native wrapper is introduced, it must reuse the domain/application logic and local-data contracts rather than fork billing rules.

## 3. Local-first data architecture

### 3.1 Local database

For the PWA, use **IndexedDB** as the primary local persistence technology. Do not attempt to use SQLite directly in ordinary browser storage unless a separately reviewed WebAssembly/SQLite implementation is selected and justified.

The local database on each device stores the business's working data, including:

- Business profile and invoice settings.
- Customers and suppliers.
- Products/services and stock-related data within approved V1 scope.
- Draft and finalized documents.
- Document line items, charges and tax snapshots.
- Payment records and outstanding calculations.
- Invoice template configuration and custom fields.
- Local audit/history records.
- Sync metadata, pending operations and last successful sync state.

All normal create, edit, save, finalize, payment recording, search, history and local PDF workflows must persist locally first and remain usable offline after initial app assets and account activation are available.

### 3.2 Storage durability and limitations

Browser-managed storage can be subject to quota limits, user clearing site data, private browsing restrictions and platform-specific eviction behaviour. Therefore:

- Request persistent storage where supported; do not assume the request is granted.
- Monitor quota/available storage where APIs allow.
- Display a clear storage warning when space is low or persistence is not granted.
- Provide local export/backup and recovery instructions.
- Never tell users that browser storage is indestructible or equivalent to a guaranteed server backup.
- Do not store the only copy of critical business data in an unbacked-up browser profile.
- Test behaviour after browser restart, device restart, app update, low storage and site-data clearing scenarios.
- Do not place business data in localStorage; use IndexedDB for structured records.
- Use a versioned schema and transactional migrations for IndexedDB just as for the existing SQLite implementation.

### 3.3 Architecture compatibility

The existing repository uses SQLite and migrations in its current persistence implementation. Do not casually replace or remove it. Inspect the actual code and determine whether the existing SQLite adapter remains useful for tests, CLI/local shell, future native packaging or migration tooling.

Keep domain and application packages storage-agnostic behind repository interfaces. Add an IndexedDB adapter for the PWA. Shared business logic, exact money arithmetic, GST rules, invoice lifecycle and numbering must not be duplicated between storage adapters.

Use a deliberate migration/import/export path between supported storage adapters if needed. Never silently discard or rewrite existing local SQLite data.

## 4. Data ownership and storage modes

Fledge supports three distinct modes. They must be explained clearly in onboarding and settings.

### Mode A — Local-only (default)

- Business data remains on the device.
- No business database or invoice/customer records are uploaded to GenZales.
- Billing works offline.
- The user is responsible for local backup/export.
- Account, licence, update and permitted minimal service metadata may still be processed by GenZales as described in the privacy notice.

### Mode B — Optional encrypted cloud backup

- Disabled by default; user explicitly opts in.
- User may request a manual backup.
- If automatic backup is enabled, the app queues a backup and uploads it when a connection and platform execution opportunity are available.
- A backup is not considered complete until the server confirms receipt and integrity validation.
- Show states: Local only, Waiting to upload, Uploading, Backup complete, Failed/retry needed.
- Provide backup history, timestamp, size, integrity status, retention policy and delete controls.
- Encrypt backup data before upload where feasible; define key derivation, key storage, recovery and loss scenarios before implementation.
- Server-side encryption at rest and HTTPS are mandatory. Do not claim end-to-end encryption unless the implementation genuinely prevents the service operator from decrypting the content.
- Restore must validate integrity, app/schema compatibility and business ownership before replacing or importing local data.
- Never silently overwrite a newer local database with an older backup.
- Backups contain sensitive financial and personal data and require restricted access, retention limits and deletion procedures.

### Mode C — Optional multi-device synchronization

This is an approved product capability and must be designed into the architecture. It may be released after the first reliable backup implementation, but the data model and repository contracts must not make it prohibitively difficult.

- A user may explicitly enable cloud sync for a business.
- The same business can be accessed on multiple verified devices.
- Each device maintains its own local database and continues to work offline.
- A sync service transfers authorized changes between devices when online.
- An invoice created on an Android phone should appear on the user's Windows or Mac device after successful synchronization, and vice versa.
- This is not one live SQLite/IndexedDB database shared directly by all devices. Each device has a local replica coordinated through a server sync service.
- Sync must be scoped by account, business and device membership. A device must never access another user's or business's records.
- A user must be able to see last sync time, pending changes, failed changes and device list.
- Sync must be resumable, idempotent, versioned and safe after app restart or intermittent connectivity.
- The system must detect and report conflicts rather than silently lose data.
- Finalized financial documents are immutable. A conflicting attempt to modify a finalized document must use a controlled correction/revision workflow, never last-write-wins.
- Drafts and mutable settings need explicit conflict policies. Where automatic merge is unsafe, preserve both versions or ask the user to resolve the conflict.
- Invoice numbering must remain unique across all devices for the same business and financial year. Do not rely on independent offline counters that can generate duplicate statutory invoice numbers. Design a safe allocation/reservation strategy and clearly explain offline limits before implementation.
- Payments are append-only financial events; conflict resolution must not duplicate payment events.
- Deletion must use tombstones/retention rules so a deleted record does not reappear from another device.
- Device revocation must stop future sync after the device next reconnects. It cannot remotely erase data from a permanently offline device.
- Sync must never be silently enabled by creating an account. Obtain explicit user consent and show what data will be uploaded.

### 4.1 Backup versus synchronization

These are separate features and must not be conflated:

- Backup creates a recoverable snapshot.
- Synchronization propagates ongoing changes between devices.

A cloud backup alone does not make newly created invoices appear on another device. Cross-device visibility requires the synchronization service.

## 5. Sync and backup privacy/security requirements

- HTTPS for all remote communication.
- Authenticated, authorized, business-scoped API operations.
- Device identity and revocable device credentials.
- Encryption at rest on server storage.
- Encryption for backup payloads before upload; key management/recovery design required.
- Never put passwords, access tokens, refresh tokens, encryption keys or recovery secrets in analytics or logs.
- Use short-lived access credentials and rotated refresh credentials.
- Store browser credentials only in appropriately protected mechanisms; never store passwords or long-lived secrets in localStorage.
- Validate payload schema, size, ownership, version and integrity.
- Rate-limit endpoints and protect against replay, duplicate operations and unauthorized enumeration.
- Audit backup restore, device add/revoke, sync enable/disable, account suspension and administrative access.
- Define data retention, account closure, backup deletion and legal retention requirements before public launch.
- Do not give ordinary admin users unrestricted ability to read customer invoices or backup contents.

## 6. Account, licence and subscription platform

Account identity, business identity, local data and subscription entitlement are separate concepts.

### 6.1 Account lifecycle

- Registration with email and password.
- Email verification required before account activation.
- Secure password hashing, password reset, session lifecycle, rate limits and account recovery as specified in docs/10.
- One account may have one or more registered devices according to plan policy.
- Account sign-out locks the app and clears active credentials; it must not delete business data.
- Email verification and remote account checks require connectivity; already activated local billing must continue offline under the documented offline policy.

### 6.2 Usage-based free trial

The free trial is based on finalized bill count, not calendar days.

- Admin can configure the trial allowance within the approved range of **2 to 5 eligible bills**.
- Recommended default allowance: 5 bills, configurable downward to 2.
- Trial starts when the account is activated for trial use, not on an arbitrary calendar countdown.
- Count eligible finalized billing documents only: GST tax invoices, non-GST invoices and bills of supply.
- Drafts and quotations do not consume the allowance.
- Receipts generated from payments do not consume a separate bill allowance.
- Cancelled/voided documents must not create a way to reset or abuse the allowance; define a controlled policy and retain the trial event history.
- Trial usage is account/business entitlement data and must be consistent across registered devices.
- Reinstalling the app, clearing browser data or adding another device must not reset the trial.
- When the allowance is exhausted, block creation/finalization of additional eligible bills until an active paid/complimentary entitlement exists. Preserve access to existing records, local export, backup and recovery.
- Offline trial finalization needs a safe entitlement design. If the device is offline, it may use a signed, bounded local trial entitlement and queue usage events; prevent obvious replay/reset abuse without locking out legitimate offline use. Define the exact policy and test it before launch.

### 6.3 Subscription plans and payment gateway

- Support free trial, monthly subscription and annual subscription.
- Prices, billing intervals, currency, taxes, plan features and device limits are configuration, not hard-coded UI values.
- Integrate a payment gateway before public launch, as approved by the product owner.
- Keep gateway integration behind a provider-independent payment/subscription interface so providers can be changed without rewriting entitlements.
- Verify payment status using authenticated server-side gateway webhooks and server-side reconciliation. Never trust a client redirect or client-provided “payment successful” flag.
- Handle pending, successful, failed, cancelled, refunded, disputed and duplicate webhook events idempotently.
- Maintain subscription invoices/receipts and payment references according to applicable business and tax requirements.
- Admin can issue complimentary access, record approved manual adjustments, extend validity and correct entitlements with a mandatory audit trail.
- Fledge subscription payments are separate from the customer's own invoice payment records stored in the local business database.
- Do not store card numbers, CVV, UPI PINs, banking passwords or payment credentials.

### 6.4 Entitlement and offline policy

- Server is authoritative for account, subscription and device entitlement while online.
- The app receives a signed entitlement with plan, allowed features/device count, issue time, expiry/next validation metadata and policy version.
- Define a reasonable offline grace policy before implementation. A temporary internet outage must not unexpectedly prevent a business from billing.
- When the entitlement expires or an account is suspended, preserve access to local business data and provide export/restore paths.
- A permanently offline device cannot receive remote suspension or revocation. State this limitation honestly.
- Do not remotely delete local business data or disable data export as a subscription enforcement mechanism.
- Account suspension, subscription expiry, device revocation and security lock are separate states and must not be collapsed into one ambiguous boolean.

## 7. Fledge Admin Control Centre

Build a separate, private web-based administrative application/API for authorized GenZales staff. It is not part of the customer billing UI.

### 7.1 Dashboard

Show aggregate, privacy-conscious operational metrics:

- Registered accounts.
- Verified and unverified accounts.
- Trial accounts and trial bills consumed.
- Active, expired, suspended and complimentary entitlements.
- Monthly and annual subscribers.
- Payment success/failure/pending counts and subscription revenue summaries.
- Active devices and recently active accounts.
- Daily/weekly/monthly active users.
- Application version distribution.
- Backup/sync enabled counts and success/failure summaries.
- Update adoption and failed update counts.
- Crash/error counts and service health.

All displayed analytics must be based on explicitly defined event names and metric definitions. Do not invent metrics from missing data.

### 7.2 User and account management

Authorized admins may:

- Search accounts by account ID/email and view verification status.
- View account creation date, last service connection and registered devices.
- Activate eligible accounts, suspend/reactivate accounts and record reasons.
- View plan, trial usage, subscription status and expiry.
- Extend subscriptions, issue complimentary access and apply audited corrections.
- Revoke device credentials.
- Review account/security events and support diagnostics.
- Initiate account deletion/data-retention workflow according to policy.

Suspension must not delete local data. Remote enforcement applies only when a device reconnects and receives the new entitlement/security state.

### 7.3 Admin security

- Admin authentication must be separate from customer authentication.
- Enforce MFA for administrators.
- Use role-based admin permissions and least privilege.
- Separate support, billing operations, release management and super-admin capabilities where practical.
- Require reason codes for suspension, reactivation, entitlement changes, device revocation, restore support and account deletion.
- Record immutable admin audit events with actor, timestamp, target, action and reason.
- Do not expose passwords, tokens, backup keys or customer invoice contents in the admin panel.
- Protect admin endpoints independently of hidden UI controls.
- Apply rate limits, session expiry, secure cookies, CSRF protection where relevant and security monitoring.

## 8. Product analytics and telemetry

Detailed usage analytics are approved for product improvement and operational monitoring, subject to transparent notice, data minimization and user controls.

### 8.1 Permitted event categories

- App launch and session lifecycle.
- Module/feature opened and used.
- Counts of created/finalized invoices, quotations and receipts.
- Trial allowance consumed.
- Backup and sync attempt/success/failure.
- Update check/download/install result.
- App version, platform, OS/browser family and device registration identifier.
- Crash/error diagnostics with sensitive data redacted.
- Authentication and security events.

### 8.2 Prohibited telemetry content

Do not collect or transmit by default:

- Invoice line descriptions or invoice PDFs.
- Customer/supplier names, phone numbers, emails or GSTINs.
- Product names, prices, tax values or business revenue.
- Full business database contents.
- Passwords, verification/reset tokens, session secrets or encryption keys.
- Payment credentials or bank secrets.

### 8.3 Consent and retention

- Explain analytics during onboarding and in privacy settings.
- Separate essential security/service telemetry from optional product analytics.
- Provide an opt-out for optional product analytics.
- Queue permitted offline events locally and upload only when online and permitted by user settings.
- Use pseudonymous account/device identifiers where possible.
- Define event retention, deletion and access policy before launch.
- Provide aggregate metrics to admins; restrict access to identifiable event-level records.
- Do not describe analytics as anonymous if identifiers can link events to an account or device.

## 9. Admin-controlled release and update operations

For a PWA, updates primarily use the web hosting/CDN and service-worker lifecycle, rather than assuming a universal APK/desktop installer.

- Maintain versioned web assets and release metadata.
- Use service-worker update checks and safe activation.
- Show release notes and update status.
- Avoid breaking a user session or unsaved local transaction during update activation.
- Maintain backward-compatible API/schema windows where possible.
- Keep local database migrations versioned, transactional and recoverable.
- Provide staged rollout/rollback controls where infrastructure supports them.
- Verify deployed assets and API compatibility before broad rollout.
- Do not force a destructive update or delete local data to enforce a minimum version.

## 10. Cross-platform validation matrix

Before V1 release, define and test supported browser/OS combinations rather than claiming universal support.

At minimum evaluate:

- Windows: current supported Chrome and Edge.
- Android: current supported Chrome and installable PWA behaviour.
- iOS/iPadOS: current supported Safari and Home Screen PWA behaviour.
- macOS: current supported Safari and Chromium-based browser behaviour.

Test:
- Offline first launch after assets have been cached.
- Offline create/edit/finalize and local PDF workflows.
- Browser restart and device restart.
- Storage quota and persistence denial.
- User clearing site data and recovery from backup.
- File export/share behaviour.
- Service-worker update while there are unsaved changes.
- Background/foreground upload differences.
- Intermittent network and duplicate retry.
- Device registration, revocation and account suspension.
- Two-device sync, duplicate invoice numbering, conflict handling and payment idempotency.

Do not promise immediate background sync on platforms that do not guarantee background execution. The app must retry safely when opened/resumed and show pending status.

## 11. Implementation sequencing

This document defines the target architecture. It does not mean all features should be implemented before M9 in one large change.

Recommended sequence:

### Cross-cutting platform foundation (design now; implement in focused issues)

1. Confirm PWA technology and supported browser matrix.
2. Add/confirm IndexedDB persistence adapter without duplicating domain logic.
3. Define account, business, device and entitlement identifiers.
4. Implement authentication/email verification and secure session handling.
5. Define subscription/trial/entitlement service and payment gateway adapter.
6. Implement private Admin Control Centre with MFA, RBAC and audit.
7. Define analytics event taxonomy, consent and retention.
8. Define backup/sync data contracts, encryption/key management and conflict policies.

### M9 — Backup & Recovery

- Local export and validated restore.
- Optional encrypted cloud backup.
- Backup history, retention and deletion.
- Integrity and restore tests.
- Do not claim cloud sync is delivered merely because backup is complete.

### M10 — Update System

- PWA service-worker updates and release metadata.
- Safe cache/schema migrations.
- Staged rollout and rollback strategy.
- Preserve unsaved/local data.

### M11 — QA

- Cross-platform PWA matrix.
- Offline and storage durability tests.
- Backup/restore tests.
- Security, privacy, subscription and entitlement tests.
- Two-device sync tests before enabling sync for customers.
- GST, money, numbering, payment and historical integrity regression tests.

### M12 — V1 Release

- Production hosting, TLS, monitoring and backups for service infrastructure.
- Account/email/payment gateway configuration.
- Admin operations and support procedures.
- Privacy policy, terms, backup/sync consent and data retention.
- Platform compatibility statement and onboarding.
- Production smoke tests, incident response and rollback plan.

### Post-V1 / staged capability

- Enable multi-device sync only after conflict, numbering, payment idempotency, device security and restore tests pass.
- The product architecture must support it from the beginning, but do not advertise it as available until implemented and validated.

## 12. Cursor execution contract

Before changing code, Cursor must:

1. Read docs/01–10 and this document.
2. Inspect the actual repository, package structure, current persistence adapters and migrations.
3. Report the current runtime/UI stack and explain the least disruptive PWA path. Do not assume the current CLI/HTTP shell is already a PWA.
4. Identify what can be reused and what must be added for IndexedDB, service workers, account services and sync.
5. Propose focused issues and dependency order. Do not implement all platform services in one PR.
6. Preserve existing M0–M4 domain behaviour and exact money arithmetic.
7. Never silently replace SQLite data or change a schema without migrations and tests.
8. Keep account data, subscription entitlements, customer business data and telemetry logically separated.
9. Keep cloud backup and cloud sync as separately consented features.
10. Never upload customer business data in local-only mode.
11. Never claim cross-device sync, encrypted backup, analytics consent or payment gateway integration is implemented until code, tests and deployment configuration prove it.
12. Report actual tests and platform validation performed. Stop and report unresolved security, privacy, numbering or data-loss risks.

## 13. Product decisions recorded

- Product name: Fledge Billing.
- Delivery direction: cross-platform PWA.
- Initial platforms: Windows, Android, iPhone/iPad and macOS.
- Local persistence: IndexedDB for the browser/PWA adapter.
- Offline billing: required.
- Default data mode: local-only.
- Optional cloud backup: user opt-in; automatic upload when online and platform execution permits.
- Multi-device synchronization: approved target capability, opt-in, designed into architecture; staged after backup and validation.
- Subscription: free trial, monthly and annual plans.
- Free trial: configurable allowance of 2–5 finalized eligible bills, recommended default 5; not day-based.
- Payment gateway: integrate before public launch through a provider-independent subscription interface.
- Analytics: detailed operational/product telemetry with clear notice, minimization, retention controls and opt-out for optional product analytics.
- Admin: private Admin Control Centre with account, device, entitlement, release, aggregate analytics and audited controls.
- Data boundary: local business data remains local unless the user explicitly enables cloud backup or sync.
