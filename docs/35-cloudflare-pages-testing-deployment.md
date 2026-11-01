# Fledge Billing — Cloudflare Pages Testing Deployment

**Status:** Proposed testing host; Cloudflare account connection and first deployment pending  
**Prepared:** 1 November 2026  
**Application:** `packages/web` (Vite + React, local-first PWA)  
**Repository:** `Rajangenzales/fledge-billing`

## 1. Decision

Use **Cloudflare Pages Free** for the temporary V1 acceptance deployment, connected directly to the existing GitHub repository.

Do not use GitHub Pages for this product. GitHub's current Pages policy says Pages must not be used as free hosting for an online business or commercial SaaS. It is also a poor fit for this PWA's current root-scoped manifest and service-worker URLs when served from a repository subpath.

GitHub remains the source of truth for code, pull requests and CI. Cloudflare Pages supplies the static HTTPS hosting and Git-connected deployments.

## 2. Free-plan suitability

The current Cloudflare Pages Free documentation lists:
- 500 builds per month.
- One concurrent build.
- Up to 20,000 files per site.
- Maximum 25 MiB per individual asset.
- Static asset requests are free and unlimited.
- Preview deployments are supported.

These limits are sufficient for a small acceptance-test deployment of the current static PWA. This does not include a backend, authentication, subscriptions, cloud backup or synchronization. Any future Pages Functions/Workers usage has separate limits and must be reviewed before adding it.

## 3. Cloudflare Pages project settings

Create a Pages project by connecting the GitHub repository `Rajangenzales/fledge-billing`.

Use the following settings:

| Setting | Value |
| --- | --- |
| Project name | `fledge-billing-test` |
| Production branch | `main` |
| Root directory | `/` (repository root) |
| Framework preset | None / Vite |
| Build command | `corepack pnpm install --frozen-lockfile && corepack pnpm --filter @fledge/web run build` |
| Build output directory | `packages/web/dist` |
| Node.js version environment variable | `NODE_VERSION=22.20.0` |

The root package pins pnpm 9.15.9 through `packageManager`. The web package build script builds its application dependencies and then runs Vite.

Cloudflare Pages should deploy the production branch and create preview deployments for other branches and pull requests. Use preview URLs for acceptance until the owner explicitly approves the testing URL as the shared pilot environment.

## 4. Why the current app fits the Pages root path

The current Vite app is a static browser build. Its PWA manifest, release manifest, service worker and shell URLs are root-scoped (for example `/manifest.webmanifest` and `/sw.js`). A Pages `.pages.dev` project is served from the domain root, so these paths match the current implementation without introducing a repository subpath.

Do not change the PWA scope, asset paths or Vite base merely to accommodate GitHub Pages.

## 5. First deployment checklist

The repository owner must complete the one-time account authorization and project creation in Cloudflare:

1. Sign in to Cloudflare or create a free account.
2. Open Workers & Pages and create a Pages project.
3. Connect the GitHub account and authorize access to `Rajangenzales/fledge-billing`.
4. Apply the project settings from section 3.
5. Start the first deployment from `main`.
6. Wait for the deployment to report success.
7. Open the generated `.pages.dev` URL in a clean browser profile.
8. Confirm the page loads without asset, manifest or service-worker 404 errors.
9. Confirm the deployed commit SHA matches the intended GitHub commit.
10. Share the generated URL and deployment commit SHA with the project team.

No Cloudflare API token or account secret should be committed to the repository. Git integration does not require adding a deployment token to source control.

## 6. Acceptance safety

- Treat this as a **testing environment**, not a public commercial release.
- Use synthetic business, customer, product and payment records only.
- Do not enter real customer financial data, passwords, GST credentials or card information.
- The current browser app stores its business workspace locally in each browser profile. A shared URL does not create shared accounts or shared records.
- Different devices and browser profiles have separate local data.
- Backup passphrases must be retained securely; lost passphrases cannot be recovered.
- Cloudflare Pages only hosts static application assets. It does not implement Fledge authentication, subscriptions, payment gateway, cloud backup or multi-device sync.
- Do not imply that a successful Pages deployment is proof of PWA installability, offline reliability, PDF/print consistency or release readiness. Those require the manual acceptance runbook.

## 7. Rollback and operations

Cloudflare Pages provides deployment history and rollback capability. Keep the last known-good deployment available while acceptance is underway. If a deployment fails, do not overwrite or delete the last known-good deployment; inspect the build log and retain the previous working URL.

Record the following after the first successful deployment:

**Pages project:** `fledge-billing-test`  
**Testing URL:** Pending Cloudflare project creation  
**Production branch:** `main`  
**Deployed commit SHA:** Pending  
**Deployment timestamp:** Pending  
**Owner:** Product owner

## 8. References

- Cloudflare Pages Free limits: https://developers.cloudflare.com/pages/platform/limits/
- Cloudflare Pages overview: https://developers.cloudflare.com/pages/
- Vite static deployment guide: https://vite.dev/guide/static-deploy
- GitHub Pages usage restrictions: https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits

---

**Release boundary:** This hosting choice unblocks browser acceptance testing only. It does not change the approved Fledge product scope or close any Bundle D release gate.
