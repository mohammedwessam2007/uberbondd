# PHOENIX CI external execution / ancestry defect / 2026-10-11

**Evidence status: independently executed deterministic job RED on platform-specific Git ancestry; not a three-gate pass.** This checkpoint preserves the failure, source identity and minimum source fix without issuing GitHub required-check clearance.

## Exact external execution

- New independent Render **static-site build**, isolated from production, service `srv-db5t1np42hec73a48nsg`, deployment `dep-db5t1o942hec73a48pp0`, began 2026-10-11T18:09:37Z; **build_failed** 2026-10-11T18:17:11Z.
- Renderer cloned source `4b3097aedf6aa93fd2b331c877cf212a242b6973`, branch `integration/first-cash-all-layers-20261011`. Build printed source-pinning values and verified identical checkout HEAD.
- Runtime **Node 26.11.1** selected by `package.json` broad `>=20`, NOT equivalent to required GitHub Actions Node22. `npm ci` succeeded. Deterministic `npm run check` started, and full `node --test` summary reported **9,993 tests total; 9,936 pass; 2 fail; 55 skipped**. Fail-closed build stopped before Chromium and real-PostgreSQL stages; do not claim those ran.
- Two actual failures both `tests/canon-freshness.test.mjs`:
  1. `the commit the canon names is actually in this branch history`
  2. `the present-tense canon describes the source the tree actually has`.
  The test checkout could not resolve `c09537543ee438941cdee0e525519042e292b39f`, referenced by `docs/CURRENT_SYSTEM_STATE.md` and `artifacts/system-readiness.json`, because Render clones shallow history.
- External connected GitHub compare API **proves** `c09537543ee438941cdee0e525519042e292b39f` is the tested commit's ancestor, `ahead_by=8, behind_by=0`, with **zero changed source files** in the canon-relevant `src/`, `scripts/`, `config/`, `migrations/` groups since the canon ref (except excluded generator input). This demonstrates Git ancestry absence in checkout, not a genuinely orphaned canon claim.

## Minimum reviewed source remedy in this branch

- `.github/workflows/ci.yml`: `actions/checkout@v4` **fetch-depth: 0** for deterministic, Chromium and PostgreSQL jobs. This remedies precisely shallow history when GitHub Actions becomes available; it does **not** change production, permissions, or test behavior.
- `tests/ci-full-git-history.test.mjs`: pure workflow regression. Locally **4/4 pass, 0 failed/skipped on Node 22.16.0**. Exact test blob SHA `c0f9304f3e29128a403810203d2622b17ee6f42e`, workflow blob SHA `0e053adfb020a076c85a74b1833ed487adf2e98a`, both read back after GitHub upload.
- This CI-only modification leaves canonical application source under `src/`, `scripts/`, `config/`, `migrations/` untouched, so it doesn't manufacture new canon drift.
- Source branch: `ci/full-history-source-truth-recovery-20261011`, draft PR #1392 targeting integration #1388, no merge.

## External blockers, no prohibited workaround

- GitHub Actions billing/account hold: every native job failed **before any steps**; Support #4845900 outstanding. No GitHub branch-protection bypass authorized.
- Vercel Sandbox (existing authenticated UberBond project) live create attempt returned **HTTP 402 quota exhausted until 2026-11-01**; do not upgrade or evade quota.
- Render's current test-only static-site build configuration is unchanged and checks out shallow history; to rerun it with full Git history and Node22 the isolated service build command must first do a verified ancestry fetch and its test-only Node version must be pinned to 22. Render connector currently exposes no service-build-command PATCH, and another static-site create attempt was blocked by platform safety checks. Do not claim rerun or green.
- Render Hobby pipeline terms: 500 included build-minutes/month; exceeding may purchase more if payment details exist, so do not silently spend or launch redundant runs. Its build host is separate from live Render control plane.
- The private 890-idea corpus and all prior tested failures remain preserved without losing/rewriting historical receipts. No new spend, sender changes, outreach sends, domain, customer effect, production deployment or production merge.

## Next verification

1. On an authorized independent test-only executor, use a **clean Node22 checkout** with full verified Git ancestry (validate historical SHA exists and is ancestor of exact target SHA, do not treat a shallow checkout as source drift).
2. Run `npm ci`, `npm run check`, Chromium install and `npm run test:browser`, and `npm run test:postgres-real` with its fresh real servers. Record actual exit codes, TAP totals, skips, exact SHA and elapsed time per gate.
3. Keep hosted GitHub Actions-required checks separately blocked until account support restores legitimate access. Do not turn any external runner success into a spoofed Actions status.
