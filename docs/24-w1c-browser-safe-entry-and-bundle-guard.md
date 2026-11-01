# W1C — Browser-Safe Application Entry and Production Bundle Guard

**Status:** Implemented in PR #39; pending review and merge  
**Depends on:** W1 audit (docs/22), W1A async repository contract (docs/23), W1B business/customer async migration (PR #38)  
**Scope:** Establish a deliberately small browser import boundary and make the production web build enforce it.

## 1. W1B baseline

PR #38 is merged. Business-profile and customer application use cases now expose Promise-based repository contracts, and their SQLite adapters preserve the existing transaction boundaries while returning Promises. Other application repositories and workflows have not yet completed the asynchronous migration.

## 2. Curated application browser entry

The package now exposes:

```ts
import {
  getBusinessProfile,
  saveBusinessProfile,
  listCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
} from "@fledge/application/browser";
```

The subpath is compiled from `packages/application/src/browser.ts` and resolves to `dist/browser.js` plus its declaration file.

Only business-profile and customer use cases are exposed at this stage because they are the first workflows migrated to the approved asynchronous repository contract. The root `@fledge/application` entry remains the server/general entry and is not a browser import.

The browser entry intentionally excludes:
- Node configuration and environment loading.
- Server logging/configuration helpers.
- PDF generation and export modules.
- Node SQLite persistence and filesystem access.
- Any root-barrel re-export that could pull server-only dependencies into the browser graph.

Pure domain logic remains imported through `@fledge/domain`.

## 3. Web package dependency and build order

`@fledge/web` now declares `@fledge/application` as a workspace dependency. The pnpm lockfile records that link.

The root `web:build` command builds the web package and its workspace dependencies in dependency order. This ensures the application and domain declaration/runtime outputs exist before Vite resolves the browser package export.

## 4. Production dependency guard

The Vite production build includes a dedicated `src/browser-contract.js` entry. It retains the complete curated browser API in the Rollup output even though the current visual shell does not yet call those use cases.

The `fledge-browser-dependency-guard` Vite plugin inspects emitted production chunks and fails the build when:
- A chunk imports a Node built-in module, including `node:` specifiers and common bare built-in names.
- Node runtime globals such as `process.env`, `__dirname` or `__filename` remain in emitted browser code.
- The browser contract entry is missing from the output.
- Any of the six approved browser use-case exports is missing from that entry.

This is a production-output boundary check, not a complete security audit or proof that every browser API is supported on every platform. New browser use cases must be added deliberately to `browser.ts` and the retained contract entry, then reviewed for transitive browser compatibility.

## 5. Explicitly deferred

W1C does not:
- Select or add an IndexedDB wrapper.
- Define an IndexedDB schema or browser migrations.
- Convert remaining application repositories to asynchronous contracts.
- Add business/customer UI workflows or browser persistence.
- Add a service worker, manifest, authentication, cloud sync or offline billing.

Those remain later W1/W2/W3/W4 work. The existing SQLite schema and migrations are unchanged.

## 6. Verification

The required repository checks are:

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build
pnpm web:build
```

The production browser guard runs as part of `pnpm web:build`. The implementation environment did not provide pnpm, so these commands have not been executed here. Do not treat this PR as having passed tests or a production build until the commands are run in a pnpm-enabled environment.

## 7. Acceptance criteria

- The browser application imports use cases only through `@fledge/application/browser`.
- The package root entry remains unchanged for existing Node consumers.
- The browser entry contains only the currently approved async business-profile/customer workflows.
- The web package declares its application workspace dependency and lockfile importer.
- The web build includes the retained browser contract entry.
- Production bundle inspection rejects Node built-ins and server runtime globals.
- The guard verifies the expected browser exports are present.
- No IndexedDB schema/wrapper or SQLite migration is introduced.
- Documentation clearly states the limited scope and unexecuted verification commands.
