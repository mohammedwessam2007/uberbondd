# PHOENIX UberCI | Independent CI capability cloned internally | 2026-10-11

**Truth class: implemented, locally unit-tested orchestrator; no full real CI run, no hosting, no release clearance.**

## Existing UberBond capabilities reused instead of rebuilt

- `scripts/run-tests.mjs` discovers source test files and performs deterministic dispatch.
- `npm run check` retains its existing syntax/deterministic/relay safety gates.
- `npm run test:browser` runs real Chromium integration if the browser binary is installed.
- `npm run test:postgres-real` runs `scripts/run-real-postgres-tests.mjs`, which uses `scripts/disposable-postgres.mjs` to provision real, isolated local PostgreSQL servers for each applicable suite. PGlite/mocks are **not** the same.
- `scripts/sovereign-local-worker-runner.mjs` is an existing isolated worker primitive; no new permissions are granted to it.

## New core module: `scripts/uberci-runner.mjs`

Implements a provider-independent runner above those existing tests:
- Pinned full 40-digit Git commit SHA, refusal on wrong/dirty source.
- Exact executable job list: deterministic, browser, real postgres.
- Locked dependency install `npm ci --ignore-scripts` with no implicit postinstall scripts; this is deliberately safer but **not byte-for-byte equivalent** to GitHub CI's `npm ci`.
- Filtered environment drops production API keys, sender tokens, database secrets.
- 45-minute max per command, bounded log output 100 MB, SHA-256 digests for logs, atomic structured receipts.
- Full success is awarded **only if all three jobs** exit cleanly **and have non-vacuous actual TAP evidence**. Missing source, failed dependency install, no tests, partial selections and red runs refuse.
- **Does not** publish GitHub statuses, run production deployments, send prospect mail or bypass branch protection.

## Local executed tests

Using actual Node 22.16.0, independently ran `node --test tests/uberci-runner.test.mjs` against the exact pre-push file bytes:
**10 passed / 0 failed / 0 skipped**.

Unit tests use deliberately controlled test-command return values to verify fail-closed behavior. They **do not** represent a genuine full UberBond test run. Exact Git blob SHAs of the tested and published files, independently verified from GitHub:
- `scripts/uberci-runner.mjs`: `bbcdc004ce06e823eab95a10f32f1d2e7facbcce`.
- `tests/uberci-runner.test.mjs`: `640eaecaf29d533511a9068f46c97be05a660cff`.

## Running on any legitimate isolated compute host

In a **clean exact-SHA checkout**, with Node 22 and the real PostgreSQL toolchain and browser installed:
- Inspect without execution: `node scripts/uberci-runner.mjs --sha=<exact-40-character-Git-SHA>`
- Execute with explicit action: `node scripts/uberci-runner.mjs --sha=<exact-40-character-Git-SHA> --execute`
- Receipt: `.cache/uberci/<sha>/receipt.json` and corresponding logs.

This orchestration is software, **not a free CPU source**. It still needs actual RAM, disk, Node/npm, an installed Chromium binary, PostgreSQL executables, and npm registry access (unless cached). It should **not** run the 10k-test/PostgreSQL workload inside UberBond's live free Render control plane, because that could degrade business uptime and may exceed plan limits. It can run on a separately authorized development machine or suitable free isolated compute.

## Release and authority

The GitHub account lock and Support #4845900 remain separate. A passing independent test does **not** substitute for a GitHub Actions-specific required check, and no branch protection bypass is authorized. Software integration draft PR #1388 and independent CircleCI draft #1389 remain open. No new paid infrastructure, DNS change, GitHub account creation, deployment, customer contact, $69 Winnr upgrade, or cleared revenue occurred.

UberCI changes are isolated on `ci/uberci-sovereign-local-verifier-20261011`, branched from verified main `298bd585d3ba0cf1fe5cdc2f81a525eb67819608`. All original 890 founder ideas, prior CI/worker capabilities, failure receipts and five PR lineages remain untouched.
