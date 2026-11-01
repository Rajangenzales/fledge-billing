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
24. [W1C Browser-Safe Application Entry & Bundle Guard](./docs/24-w1c-browser-safe-entry-and-bundle-guard.md)
25. [W1D Async Product & Saved GST Rate Repositories](./docs/25-w1d-async-product-and-gst-rate-repositories.md)
26. [W1E Async Invoice & Document Repository](./docs/26-w1e-async-invoice-and-document-repository.md)
27. [W1F Async Template Repository](./docs/27-w1f-async-template-repository.md)
28. [W1G Async Payment Repositories](./docs/28-w1g-async-payment-repositories.md)
29. [W1H Final Async Boundary Audit](./docs/29-w1h-final-async-boundary-audit.md)
30. [W2 IndexedDB Foundation & Local Setup](./docs/30-w2-indexeddb-foundation-and-local-setup.md)

These documents are the source of truth. Implementation must not silently expand V1 scope or introduce GST rules in UI code.

## Development status

**Current implementation baseline (main after PR #44):** M0–M5 are implemented; M6 template functionality and M7 PDF/print functionality are partial. GST still lacks HSN/SAC rate lookup and complete statutory place-of-supply coverage. M8 includes receipt, allocation, refund/reversal, ordinary receipt print/PDF and read-only payment activity foundations; statutory vouchers and credit/debit-note behavior remain gated on owner decisions and qualified GST-practitioner review.

**Browser status:** W0–W1G are merged. W1H is complete, including the browser-safe payment activity snapshot contract and receipt render/print-lines API. The first W2/W3 slice now stores business profiles and customers in IndexedDB and provides setup/customer screens in `packages/web`. It does not yet support invoices, products, payments, service-worker caching, offline first-load, backup/sync, authentication, subscriptions or the Admin Control Centre. Browser storage may be cleared or evicted; the current slice has no backup/export. See the [Roadmap](./docs/08-roadmap-and-cursor-contract.md), [PWA/platform contract](./docs/11-pwa-offline-sync-and-platform-operations.md), [frontend plan](./docs/21-pwa-frontend-foundation-plan.md), [W1H audit](./docs/29-w1h-final-async-boundary-audit.md) and [IndexedDB slice](./docs/30-w2-indexeddb-foundation-and-local-setup.md).

## Quick start

Prerequisites: Node.js 22+ and pnpm 9.15.9, pinned by `package.json` and managed with [Corepack](https://nodejs.org/api/corepack.html).

```bash
cp .env.example .env   # optional; defaults work offline
corepack enable
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build
pnpm start             # local HTTP shell — migrates SQLite, then GET http://127.0.0.1:3847/health
pnpm web:dev           # React/Vite browser shell at http://localhost:5173
pnpm web:build         # production browser asset build
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the developer setup and validation guide.

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
