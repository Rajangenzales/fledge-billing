# Fledge Billing — Technology Stack (M0)

**Status:** Adopted for foundation milestone  
**Version:** 0.1

## Decision

M0 uses a **TypeScript pnpm monorepo** with strict layer boundaries:

| Package | Role |
| --- | --- |
| `@fledge/domain` | Pure domain types and engines (billing/GST in later milestones) |
| `@fledge/application` | Configuration, logging, errors, future use cases |
| `@fledge/app` | Application shell entry (CLI and local HTTP health endpoint) |

## Rationale

- **Architecture alignment:** Domain and application code stay independent of UI and SQLite (see `docs/03-architecture.md`).
- **Testability:** Vitest runs domain and application unit tests without a UI or database.
- **Local-first:** The shell runs fully offline; no network is required for install, test, build, or default startup.
- **Future platforms:** TypeScript domain modules can be reused by a future desktop or mobile shell (Tauri, Electron, React Native, etc.) without rewriting billing logic.

## Tooling

- Node.js 22 LTS (via Cloud Agent default image or local install)
- pnpm workspaces with lockfile
- TypeScript project references
- Vitest for unit and smoke tests

## Configuration

Copy `.env.example` to `.env` for local overrides. Required settings have safe defaults; invalid values produce human-readable errors without printing secrets.

## Commands

```bash
pnpm install
pnpm test
pnpm build
pnpm start          # HTTP shell on FLEDGE_PORT (default 3847)
node packages/app/dist/cli.js   # one-shot shell status (no server)
```
