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
8. [Roadmap & Cursor Development Contract](./docs/08-roadmap-and-cursor-contract.md)

These documents are the source of truth. Implementation must not silently expand V1 scope or introduce GST rules in UI code.

## Development status

**M0: Foundation** is in progress. The repository includes a TypeScript monorepo application shell, configuration, logging, error handling, and Vitest smoke tests. See [Technology Stack (M0)](./docs/09-technology-stack.md) for stack rationale.

## Quick start

Prerequisites: Node.js 22+ and [pnpm](https://pnpm.io/) 9 (via `corepack enable`).

```bash
cp .env.example .env   # optional; defaults work offline
pnpm install
pnpm test
pnpm build
pnpm start             # local HTTP shell — GET http://127.0.0.1:3847/health
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

See [the Cursor development contract](./docs/08-roadmap-and-cursor-contract.md) before implementing any issue.
