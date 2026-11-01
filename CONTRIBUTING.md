# Contributing

## Requirements

- Node.js 22 or newer.
- pnpm 9.15.9, pinned in the root `package.json`; use Corepack to activate it.

## Setup

From the repository root:

```bash
corepack enable
pnpm install --frozen-lockfile
```

The frozen install ensures dependencies match the committed `pnpm-lock.yaml`. Do not use a different package manager or update the lockfile as part of an unrelated change.

## Validate changes

Run the checks relevant to your change before opening a pull request:

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm web:build
```

`pnpm build` builds the Node workspace packages and the web package. `pnpm web:build` also runs the browser production build and its dependency guard. Do not report a check as passing unless it has been run.

For local development, use `pnpm web:dev` for the browser app or `pnpm start` for the local HTTP shell. See the [README](./README.md) and [development contract](./docs/08-roadmap-and-cursor-contract.md) for product and architecture guidance.
