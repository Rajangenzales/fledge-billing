# Fledge Billing — Technology Stack (M0)

**Status:** Adopted for foundation milestone  
**Version:** 0.2

## Decision

M0 uses a **TypeScript pnpm monorepo** with strict layer boundaries:

| Package | Role |
| --- | --- |
| `@fledge/domain` | Pure domain types and engines. Money is exact; billing/GST engines come in later milestones. |
| `@fledge/application` | Configuration, logging, errors, future use cases |
| `@fledge/app` | Application shell entry (CLI and local HTTP health endpoint) |

## Rationale

- **Architecture alignment:** Domain and application code stay independent of UI and SQLite (see `docs/03-architecture.md`).
- **Testability:** Vitest runs domain and application unit tests without a UI or database.
- **Local-first:** The shell runs fully offline; no network is required for install, test, build, or default startup.
- **Future platforms:** TypeScript domain modules can be reused by a future desktop or mobile shell (Tauri, Electron, React Native, etc.) without rewriting billing logic.

## Money (M0-A)

Financial amounts live in `@fledge/domain` as exact rationals: a `bigint` numerator and denominator in rupees, reduced on every operation. The domain package does not take a decimal library, and money is never constructed from a JavaScript `number`.

`INR_MINOR_SCALE` is 2, so persisted and displayed currency amounts are paise. `Money.parse` and `Ratio.parse` accept decimal strings. `Money.fromMinor` accepts minor units at a declared scale.

`roundHalfUp(amount, decimalPlaces)` is the only rounding operation. It rounds half away from zero. `add`, `subtract`, and `times` leave the exact value unchanged, including non-terminating results such as an inclusive-price split. The GST engine will call `roundHalfUp` at the calculation stage defined for that rule, usually `INR_MINOR_SCALE`. Formatting a non-terminating amount throws until it has been rounded.

Input strings allow at most 15 digits before the decimal point and 8 after it. That bound applies to typed input, not to exact intermediate rationals produced by multiplication.

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
