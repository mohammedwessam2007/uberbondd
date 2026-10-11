# Independent public-repository CI candidate | 2026-10-11

**Purpose:** run the exact UberBond native gates through an independent CI provider while GitHub-hosted Actions is blocked **before steps start** on the repository owner's existing account. This configuration is a **proposal for a second CI platform**, not a new GitHub identity or circumvention of GitHub billing/account controls.

## Canonical source and provenance

- GitHub canonical repository stays `mohammedwessam2007/uberbondd` with **public** visibility (confirmed via authenticated repo API).
- The original five-PR integration is `#1388` on `integration/first-cash-all-layers-20261011` at base head `4b3097aedf6aa93fd2b331c877cf212a242b6973`. This CI branch adds only `.circleci/config.yml` and this explanation; it does not touch engine logic, governance, DNS, customer data or deployment.
- Exact GitHub hosted CI `38146282815` had three failed jobs (browser, PostgreSQL and deterministic) with **0 executed steps**. Billing support ticket `#4845900` remains an independently tracked legitimate account restoration task. The third-party CI does not mark GitHub's required checks green.
- This uses CircleCI's Free plan separately from the existing GitHub account, **not** a second personal GitHub Free account. GitHub Terms permit no more than one free Personal Account per individual/legal entity, and a locked-account work-around through a secondary personal GitHub account is therefore not the selected solution.

## Three source-equivalent jobs

1. `deterministic`: `cimg/node:22`, `npm ci`, `npm run check`, capturing full deterministic + relay safety gates.
2. `browser`: `cimg/node:22-browsers`, locked `npm ci`, real matching Chromium installed with Playwright, `npm run test:browser`.
3. `postgres`: disposable PostgreSQL 16 sidecar, an actual `SELECT 1` startup probe and `npm run test:postgres-real` with `OMNIA_V9_TEST_DATABASE_URL`. This explicitly does not substitute an embedded mock for a real database.

The default pipeline contains no deployment, secrets, outbound email, customer contacts, card validation, purchases, production credentials, remote mutations or account-protection bypasses. PostgreSQL credentials are for **one ephemeral CI-only container**, not UberBond production. **Runner result currently UNKNOWN:** creating this config is not a CircleCI pipeline execution. It must not be marked green until the provider returns actual job logs and checks.

## Account owner connection needed

On the CircleCI Free plan, owner creates/signs into a **CircleCI** account (not another GitHub personal account), chooses `Create Project` → GitHub Cloud → the existing `mohammedwessam2007/uberbondd` public repository, then grants the CircleCI GitHub App access to **only that repository** if offered. Point the pipeline at this branch's `.circleci/config.yml`. Avoid auto-purchase/auto-refill. This action requires the founder's own provider sign-in and consent to granting GitHub App repo access; it is not performed by this source-only PR.

**If external CI passes:** archive CircleCI pipeline ID, source SHA, Node/container versions, full TAP logs, PostgreSQL `SELECT 1` evidence and browser result under issue #1188. That is *independent engineering evidence* but does **not automatically satisfy any GitHub Actions-specific protected branch check*. GitHub's account block still requires legitimate resolution or approved administrative reconfiguration. Never weaken a branch protection rule or auto-merge merely because a different CI runner succeeded.

## Sources

- GitHub Actions: `/.github/workflows/ci.yml` on base PR head.
- CircleCI setup: https://circleci.com/docs/guides/getting-started/create-project/
- CircleCI Free plan: https://circleci.com/pricing/
- GitHub account terms: https://docs.github.com/en/site-policy/github-terms/github-terms-of-service
- GitHub locked account: https://docs.github.com/en/billing/how-tos/troubleshooting/locked-account

**No external side effects were performed during creation of this branch other than the GitHub source/doc commit. No first send or cleared revenue claimed.**
