# Fledge Billing

India-ready, local-first billing for small and growing businesses.

Fledge Billing is being developed with GST and non-GST billing, Indian State/UT awareness, configurable invoice templates, offline operation, and versioned tax rules as core principles.

## Product baseline

The approved product and engineering baseline is maintained in [`docs/`](./docs/):

1. [Product Vision](./docs/01-product-vision.md)
2. [PRD V1](./docs/02-prd-v1.md)
3. [Architecture](./docs/03-architecture.md)
4. [Database Design](./docs/04-database-design.md)
5. [GST Compliance Specification](./docs/05-gst-compliance-spec.md)
6. [Invoice & Template System](./docs/06-invoice-template-system.md)
7. [Update & Distribution](./docs/07-update-and-distribution.md)
8. [Roadmap & Coding-Agent Development Contract](./docs/08-roadmap-and-cursor-contract.md)
9. [Technology Stack](./docs/09-technology-stack.md)
10. [M5–M8 Implementation Contract](./docs/10-m5-to-m8-implementation-contract.md)
11. [PWA, Offline Sync & Platform Operations](./docs/11-pwa-offline-sync-and-platform-operations.md)
12. [M8 Payments, Advances & Adjustments Design](./docs/12-m8-payments-advances-and-adjustments-design.md)
13. [M8-01 GST Compliance & Product Decisions](./docs/13-m8-01-gst-compliance-and-product-decisions.md)
14. [M8-02 Payment & Customer Advance Domain Model](./docs/14-m8-02-payment-advance-domain-model.md)
15. [M8-02C Refund & Reversal Implementation](./docs/15-m8-02c-refunds-and-reversals.md)
16. [M8-03 Credit/Debit Note Domain Model](./docs/16-m8-03-credit-debit-note-domain-model.md)
17. [M8-04 Payment Receipt Generation Contract](./docs/17-m8-04-payment-receipt-generation.md)
18. [M8-04A Receipt-Time Identity Snapshots](./docs/18-m8-04a-receipt-identity-snapshots.md)
19. [M8-04B Payment Receipt Print and PDF](./docs/19-m8-04b-payment-receipt-print-pdf.md)
20. [M8 Customer Payment Activity Statement](./docs/20-m8-customer-payment-activity-statement.md)
21. [PWA Frontend Foundation Plan](./docs/21-pwa-frontend-foundation-plan.md)
22. [W1 Browser Compatibility & Repository Contract Audit](./docs/22-w1-browser-compatibility-and-repository-audit.md)
23. [W1A Async Repository & Transaction Contract](./docs/23-w1a-async-repository-and-transaction-contract.md)

These documents are the source of truth. Implementation must not silently expand V1 scope or introduce GST rules in UI code.

## Development status

**Current implementation snapshot (main, after PR #35):** M0–M5 are implemented; M6 template functionality and M7 PDF/print functionality are partially implemented. The GST engine calculates CGST, SGST, UTGST and IGST from an explicitly supplied rate and place of supply, but it does not yet provide HSN/SAC rate lookup or determine every statutory place-of-supply scenario. Template snapshots, safe label/visibility edits, custom-field snapshots, preview and historical rendering are present; section reordering and complete brand customization remain outstanding. Issued documents can be exported as local PDFs and printable text, but a full customer-facing print/share workflow is not complete. M8-02A customer receipt persistence, M8-02B allocation history/derived invoice settlement, and M8-02C refund plus receipt/refund reversal foundations are merged (PRs #24–26). M8-03 credit/debit note domain design is documented; statutory treatment and customer-balance effects remain gated on owner decisions and qualified GST-practitioner review. M8-04 ordinary payment receipt generation is specified in docs/17. M8-04A receipt-time identity snapshots and migration 12 are merged (PR #29). M8-04B ordinary payment receipt print/PDF is merged (PR #30). The read-only customer payment activity statement is merged (PR #32); it summarizes existing receipt, allocation, refund and reversal events without acting as a full accounting ledger.

**Important product status:** A separate React/Vite browser shell is merged in `packages/web` (W0, PR #35). W1 browser compatibility and repository contract audit is documented in [docs/22](./docs/22-w1-browser-compatibility-and-repository-audit.md). The audit found that current application repository contracts are synchronous and must be migrated to explicit asynchronous contracts before IndexedDB can be integrated. It is a responsive presentation shell with placeholder navigation only. It does not yet create or save business data and is not a completed PWA. IndexedDB, service worker, offline browser billing, authentication, cloud backup/sync, subscriptions and the Admin Control Centre are not implemented. See the [Roadmap](./docs/08-roadmap-and-cursor-contract.md), [M5–M8 contract](./docs/10-m5-to-m8-implementation-contract.md), [PWA/platform contract](./docs/11-pwa-offline-sync-and-platform-operations.md) and [PWA frontend foundation plan](./docs/21-pwa-frontend-foundation-plan.md).

## Quick start

Prerequisites: Node.js 22+ and [pnpm](https://pnpm.io/) 9 (via `corepack enable`).

```bash
cp .env.example .env   # optional; defaults work offline
pnpm install
pnpm test
pnpm build
pnpm start             # local HTTP shell — migrates SQLite, then GET http://127.0.0.1:3847/health
pnpm web:dev           # React/Vite browser shell at http://localhost:5173
pnpm web:build         # production browser asset build
```

One-shot shell status (no HTTP server):

```bash
node packages/app/dist/cli.js
```

## Development principles

- Keep core billing logic independent of the UI framework and persistence implementation.
- Keep GST calculations in a testable domain engine and version compliance rules.
- Use safe, explicit database migrations for every schema change.
- Never use floating-point arithmetic for financial values.
- Preserve finalized document history.
- Keep `main` buildable and make focused, meaningful commits.
- Do not commit secrets, signing keys, local databases, or generated build artifacts.

## Source of truth

See [the development contract](./docs/08-roadmap-and-cursor-contract.md) and [PWA frontend foundation plan](./docs/21-pwa-frontend-foundation-plan.md) before implementing any issue.
