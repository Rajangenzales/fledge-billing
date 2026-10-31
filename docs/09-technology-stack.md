# Fledge Billing — Technology Stack (M0)

**Status:** Adopted for foundation milestone  
**Version:** 0.6

## Decision

M0 uses a **TypeScript pnpm monorepo** with strict layer boundaries:

| Package | Role |
| --- | --- |
| `@fledge/domain` | Pure domain types and engines. Money is exact; billing/GST engines come in later milestones. |
| `@fledge/application` | Configuration, logging, errors, future use cases. No SQLite dependency. |
| `@fledge/persistence` | Local SQLite connection, schema migrations, and later repository implementations. |
| `@fledge/app` | Application shell entry (CLI and local HTTP health endpoint). Opens the database on serve. |

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

## Local database (M0-B)

SQLite is the local database. The driver is Node.js 22 `node:sqlite` (`DatabaseSync`), used only inside `@fledge/persistence`. Node 22 still marks that module experimental. Keeping it behind this package means a later driver change does not touch domain or application code. No native addon is required.

`FLEDGE_DATABASE` defaults to `data/fledge.sqlite`. `:memory:` is reserved for tests.

Schema changes go through `migrate`. Versions are contiguous integers starting at 1. The `schema_migration` table stores version, name, and applied time. Startup applies only migrations newer than the installed version, and only when each installed row matches this build's version and name. A database newer than the application is refused. Each migration runs in one transaction with its version row, so a failure rolls that migration back and leaves earlier versions applied.

`pnpm start` opens the database, migrates, then serves `/health` with `schemaVersion`. The one-shot CLI status command does not create a database file.

## State and UT master (M1-A)

Migration `state-ut-master` creates `state_ut` and seeds it from `STATE_UTS` in `@fledge/domain`. Ids are stable `IN-` plus the ISO 3166-2 subdivision code, for example `IN-KL`. `gst_state_code` is the two-digit GST code stored as text.

The seed has 28 active states and 8 active Union Territories. GST code 25, former Daman and Diu, is inactive. GST code 26 is Dadra and Nagar Haveli and Daman and Diu. Codes 97 and 99 are not seeded. `listStateUts` reads the table back in GST-code order.

## Business profile (M1-B)

Migration `business-profile` creates `business` and `business_setting`. `saveBusinessProfile` stores one local business. Legal name, address, and an active State or Union Territory are required. GST registration status and GSTIN stay separate: a registered business needs a GSTIN, and an unregistered business has none.

The GSTIN is 15 characters. The first two digits must match the selected State or Union Territory, position 14 is `Z`, and position 15 is the GSTN modulus-36 check digit. `27AAACR5055K1Z7` is the worked example.

`payment_details` and `invoice_preferences` are the business settings saved with the profile. District stays out of this migration until a district master exists, so the address is not a free-text state or district name. `state_id` references `state_ut`.

## Customers (M2)

Migration `customer` creates `customer`, linked to the local business and to `state_ut`. A customer can be saved only after the business profile exists. Name, billing address, and an active State or Union Territory are required. Shipping address, phone, email, PIN, and notes are optional.

`registration_type` is `registered` or `unregistered`, separate from the GSTIN. A registered customer needs a GSTIN whose state code matches the customer State or Union Territory. The check digit is the same modulus-36 rule as the business profile. Deactivating a customer sets `active` to false and keeps the row. `listCustomers` returns active customers unless inactive rows are requested.

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
