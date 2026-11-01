# Fledge Billing — V1 Implementation Milestones & GitHub Issue Backlog

**Document ID:** PLAN-IMPL-001  
**Version:** 1.0  
**Status:** Backlog created; GitHub milestone records pending creation  
**Date:** 1 November 2026  
**Repository:** `Rajangenzales/fledge-billing`  
**Parent specification:** [Product Completion PRD V1.1](./31-product-completion-prd-v1.1.md)

---

## 1. Purpose

This document converts the Product Completion PRD into a trackable implementation backlog. It records the proposed GitHub milestone structure, the GitHub issues created for each workstream, their intended sequence and the completion rules.

The issues are the actionable work items. The milestone groups below are the planning structure for sequencing and progress reporting. No target dates are assigned because capacity, delivery dates and product-owner decisions have not yet been confirmed.

**Important GitHub state:** The connected GitHub integration supports creating issues and assigning an existing milestone number to an issue, but does not expose a create-milestone operation. Therefore, all 16 issues listed below have been created as open issues, but are not yet assigned to GitHub milestones. The milestone groups in this document are ready to be created in the repository's GitHub Milestones page and then assigned to the listed issues. Do not treat these proposed groups as existing GitHub milestone records until that action is completed.

## 2. Proposed GitHub milestones

Create the following milestones in the listed order. Dates should be added only after the product owner agrees a delivery schedule.

| Order | Proposed milestone title | Goal | Issues |
| --- | --- | --- | --- |
| 1 | **V1-0: Decisions & Engineering Baseline** | Resolve blocking product decisions and establish reproducible local/CI validation. | [#59 DEC](https://github.com/Rajangenzales/fledge-billing/issues/59), [#46 A0](https://github.com/Rajangenzales/fledge-billing/issues/46), [#47 A1](https://github.com/Rajangenzales/fledge-billing/issues/47) |
| 2 | **V1-1: Browser Persistence & Core Workflows** | Harden IndexedDB and complete browser persistence for products, documents, templates and payments. | [#48 B0](https://github.com/Rajangenzales/fledge-billing/issues/48), [#49 B1](https://github.com/Rajangenzales/fledge-billing/issues/49), [#50 B2](https://github.com/Rajangenzales/fledge-billing/issues/50), [#51 B3](https://github.com/Rajangenzales/fledge-billing/issues/51), [#52 B4](https://github.com/Rajangenzales/fledge-billing/issues/52) |
| 3 | **V1-2: GST & Customer Document Experience** | Verify supported GST scenarios and complete browser preview, PDF, print and share. | [#53 C1](https://github.com/Rajangenzales/fledge-billing/issues/53), [#54 C2](https://github.com/Rajangenzales/fledge-billing/issues/54) |
| 4 | **V1-3: Data Protection, PWA & Updates** | Protect user data and deliver the installable offline/update lifecycle. | [#55 M9](https://github.com/Rajangenzales/fledge-billing/issues/55), [#56 M10-PWA](https://github.com/Rajangenzales/fledge-billing/issues/56), [#57 M10-UPDATES](https://github.com/Rajangenzales/fledge-billing/issues/57) |
| 5 | **V1-4: Security & Release QA** | Complete approved security scope and verify the product against the V1 QA matrix. | [#58 SEC](https://github.com/Rajangenzales/fledge-billing/issues/58), [#60 M11](https://github.com/Rajangenzales/fledge-billing/issues/60) |
| 6 | **V1-5: Production V1 Release** | Complete production readiness, sign-off, publication and support handover. | [#61 M12](https://github.com/Rajangenzales/fledge-billing/issues/61) |

Milestone grouping is a planning aid, not permission to skip dependencies. For example, QA planning can begin early, but final QA sign-off depends on the completion of the features included in the approved V1 scope.

## 3. GitHub implementation issues

### V1-0: Decisions & Engineering Baseline

| Issue | Work item | Primary outcome |
| --- | --- | --- |
| [#59 DEC](https://github.com/Rajangenzales/fledge-billing/issues/59) | Resolve V1 product-owner decisions | Record approved distribution, platform, backup, business-profile, GST, hosting, support and account/subscription decisions. |
| [#46 A0](https://github.com/Rajangenzales/fledge-billing/issues/46) | Reproducible repository baseline | Verify clean frozen install, tests, typecheck, builds and developer setup. |
| [#47 A1](https://github.com/Rajangenzales/fledge-billing/issues/47) | GitHub Actions validation | Automate frozen install, tests, typecheck and required builds on pull requests. |

### V1-1: Browser Persistence & Core Workflows

| Issue | Work item | Primary outcome |
| --- | --- | --- |
| [#48 B0](https://github.com/Rajangenzales/fledge-billing/issues/48) | IndexedDB foundation hardening | Verify upgrade, transaction, failure, ownership and reload behaviour. |
| [#49 B1](https://github.com/Rajangenzales/fledge-billing/issues/49) | Product and saved-rate persistence | Complete browser product/service and saved GST-rate workflows. |
| [#50 B2](https://github.com/Rajangenzales/fledge-billing/issues/50) | Billing document persistence | Complete browser draft, edit, numbering, finalization and retrieval workflows. |
| [#51 B3](https://github.com/Rajangenzales/fledge-billing/issues/51) | Template persistence/customization | Complete browser template selection, safe customization, revision and preview workflows. |
| [#52 B4](https://github.com/Rajangenzales/fledge-billing/issues/52) | Payment persistence | Complete browser receipts, advances, allocations, refunds, reversals and derived activity. |

### V1-2: GST & Customer Document Experience

| Issue | Work item | Primary outcome |
| --- | --- | --- |
| [#53 C1](https://github.com/Rajangenzales/fledge-billing/issues/53) | GST completion and review | Source-backed supported scenarios, automated tests, explicit limitations and qualified review. |
| [#54 C2](https://github.com/Rajangenzales/fledge-billing/issues/54) | Preview/PDF/print/share | One canonical render model with consistent browser output and historical snapshots. |

### V1-3: Data Protection, PWA & Updates

| Issue | Work item | Primary outcome |
| --- | --- | --- |
| [#55 M9](https://github.com/Rajangenzales/fledge-billing/issues/55) | Backup and recovery | Versioned validated backup, safe restore and user guidance. |
| [#56 M10-PWA](https://github.com/Rajangenzales/fledge-billing/issues/56) | PWA/offline lifecycle | Installability, service worker, app-shell caching and verified offline behaviour. |
| [#57 M10-UPDATES](https://github.com/Rajangenzales/fledge-billing/issues/57) | Update system | Release manifest, update checks, integrity validation and migration-safe recovery. |

### V1-4: Security & Release QA

| Issue | Work item | Primary outcome |
| --- | --- | --- |
| [#58 SEC](https://github.com/Rajangenzales/fledge-billing/issues/58) | Account/security scope | Confirm release scope and implement required authentication, authorization and service controls. |
| [#60 M11](https://github.com/Rajangenzales/fledge-billing/issues/60) | QA matrix and release verification | Verify financial, GST, persistence, document, offline, backup, update, security and platform behaviour. |

### V1-5: Production V1 Release

| Issue | Work item | Primary outcome |
| --- | --- | --- |
| [#61 M12](https://github.com/Rajangenzales/fledge-billing/issues/61) | V1 production release | Production smoke test, documentation, support ownership, release artifacts, sign-off and tagging. |

## 4. Dependency sequence

The intended high-level dependency flow is:

```text
DEC (#59) ───────────────┐
A0 (#46) → A1 (#47) ─────┼→ B0 (#48)
                         │      ├→ B1 (#49) → B2 (#50)
                         │      │                ├→ B3 (#51)
                         │      │                └→ B4 (#52)
                         │      └──────────────────────┘
                         │
                         ├→ C1 (#53) ───────────────┐
                         └→ C2 (#54) ← B2 + B3 ─────┘

B1 + B2 + B3 + B4 → M9 (#55)
B0 + completed browser workflows + platform decision → M10-PWA (#56)
M9 + M10-PWA + hosting/integrity decisions → M10-UPDATES (#57)

DEC (#59) → SEC (#58) ─┐
Feature work + C1/C2 + M9 + M10 → M11 (#60)
SEC (#58) + M11 (#60) + release decisions → M12 (#61)
```

This graph is directional guidance. The detailed dependency and acceptance criteria remain in each GitHub issue. QA test planning may proceed in parallel with implementation; only final release verification is gated on feature completion.

## 5. Issue execution rules

Every issue must be implemented through a focused pull request. Before work starts, the assignee should review the issue body and linked authoritative documents.

A pull request must:
- Link the issue using GitHub's closing keyword when appropriate.
- State the user-visible outcome and scope boundary.
- Identify architecture, persistence and financial invariants affected.
- Add or update automated tests for acceptance criteria.
- Record exact verification commands and outcomes.
- Update authoritative documentation where behaviour or status changes.
- Avoid claiming tests/builds passed unless they were actually run.

Do not combine unrelated milestone work into one large implementation pull request. Preserve the existing SQLite implementation and migration history while browser persistence is extended.

## 6. Backlog status at creation

- **16 GitHub issues created:** #46 through #61.
- **6 milestone groups proposed:** V1-0 through V1-5.
- **GitHub milestone records:** Not yet created through the current connected integration.
- **Issue milestone assignments:** Pending creation of the corresponding GitHub milestones.
- **Target dates:** Not set.
- **Assignees:** Not set.
- **Issue labels:** Not set, to avoid depending on labels that may not exist in the repository.

Repository milestone page: https://github.com/Rajangenzales/fledge-billing/milestones

## 7. Completion and change control

This backlog is subordinate to [Product Completion PRD V1.1](./31-product-completion-prd-v1.1.md). If an issue conflicts with the PRD, architecture, database design or GST compliance specification, stop and resolve the conflict through an explicit product/architecture decision before implementation.

Changes to V1 scope, statutory behaviour, security commitments or release gates require product-owner approval and updates to the relevant authoritative documents.

---

**Planning principle:** Keep the work small enough to verify, the dependencies visible, and the release gate honest.
