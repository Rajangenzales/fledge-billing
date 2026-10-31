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

These documents are the source of truth. Implementation must not silently expand V1 scope or introduce GST rules in UI code.

## Development status

**Current implementation snapshot (main, after PR #18):** M0–M5 are implemented; M6 template functionality and M7 PDF/print functionality are partially implemented. The GST engine calculates CGST, SGST, UTGST and IGST from an explicitly supplied rate and place of supply, but it does not yet provide HSN/SAC rate lookup or determine every statutory place-of-supply scenario. Template snapshots, safe label/visibility edits, custom-field snapshots, preview and historical rendering are present; section reordering and complete brand customization remain outstanding. Issued documents can be exported as local PDFs and printable text, but a full customer-facing print/share workflow is not complete. M8 payments have not started.

**Important product status:** The current app is still a CLI/local HTTP health shell backed by SQLite. It is not yet the customer-facing PWA, and authentication, IndexedDB, offline browser billing, cloud backup/sync, subscriptions and the Admin Control Centre are not implemented. See the [Roadmap](./docs/08-roadmap-and-cursor-contract.md), [M5–M8 contract](./docs/10-m5-to-m8-implementation-contract.md) and [PWA/platform contract](./docs/11-pwa-offline-sync-and-platform-operations.md).

## Quick start

Prerequisites: Node.js 22+ and [pnpm](https://pnpm.io/) 9 (via `corepack enable`).

```bash
cp .env.example .env   # optional; defaults work offline
pnpm install
pnpm test
pnpm build
pnpm start             # local HTTP shell — migrates SQLite, then GET http://127.0.0.1:3847/health
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

See [the development contract](./docs/08-roadmap-and-cursor-contract.md) before implementing any issue.
