# OMNIA V9 Final Closure Report

**Result: OMNIA V9 FINAL CLOSURE VERIFIED**

- Tested SHA (code actually executed in the decisive run below): `4e256c91de5d21f2f69027534ef45cd9876fdf2b`
- This report/evidence is committed in the next commit on the same branch, `claude/omnia-v9-closure-verify-1iuar2`, which adds no executable code.
- Machine-readable evidence: [`artifacts/omnia-v9/closure-report.json`](../artifacts/omnia-v9/closure-report.json).

This is the second closure pass. The first pass (evidenced at commit `b9eaa88`, report committed at `a3f1d54`) found and fixed three genuine defects (a Date-object timestamp-truncation bug, two Cedar API-shape defects, and a broken CI test reference) but left one gap: the canonical one-command gate, `scripts/verify-v9-closure.mjs`, could print `OMNIA_V9_CLOSURE_VERIFIED` without itself running the end-to-end proof circuit — that circuit only ran as a separate CI step. That gap was closed upstream in commit `9b97593` before this pass began. This pass's job was to independently verify that fix, try to break everything again, find and fix whatever else was still wrong, and produce an honest final account.

## What this pass found and fixed

**The closure gate fix was real and correct.** Read `scripts/verify-v9-closure.mjs` line by line and confirmed it now spawns `node --test tests/omnia-v9-end-to-end-proof-circuit.test.mjs` directly, requires exit code 0, and only then prints `OMNIA_V9_CLOSURE_CIRCUIT_VERIFIED` followed by `OMNIA_V9_CLOSURE_VERIFIED`. Not trusted on the strength of variable names or console messages — traced the actual `spawnSync` calls and their exit-code checks in order.

**A second, previously-undetected migration defect was found and fixed.** Running `scripts/migrate.mjs` against a genuinely empty database and then querying `schema_migrations` directly showed only migrations 001–004 registered, despite all 30 tables — including all 7 `omnia_v9_*` tables — existing. Migrations 005–008 (all four V9 migrations) never registered themselves in the tracking ledger, unlike 001–004, which each end with an `INSERT INTO schema_migrations`. This meant `scripts/migrate.mjs` would silently re-run all four V9 migrations' full DDL on every invocation forever (harmless in practice, since they're written idempotently, but wasteful and it corrupts the ledger's claim about what's been applied). Fixed by adding the same self-registration pattern to each file — but not naively: a first attempt using a bare `INSERT` broke 20 of 23 tests in `tests/omnia-v9-proof-store.test.mjs`, because most V9 test fixtures apply these four migration files standalone (against PGlite or an ad hoc pool) without ever creating the `schema_migrations` table first. The corrected fix has each file create the table if absent before registering itself, verified safe both standalone and through the full tracked pipeline.

**`scripts/verify-v9-closure.mjs` itself was missing from `check:syntax`.** Every other V9 script was syntax-checked except the closure gate. Added it.

## Real PostgreSQL, fresh every time

Every decisive run in this pass used a database dropped and recreated from scratch — `DROP DATABASE`, `CREATE DATABASE`, `CREATE EXTENSION pgcrypto`, nothing else — then either the full tracked `scripts/migrate.mjs` pipeline or the individual V9 migration files, exactly as the real test suites do. No PGlite, no SQLite, no mocked database client was substituted for anything that needed genuine PostgreSQL concurrency, locking, or trigger behavior. PGlite (a real embedded Postgres-compatible engine, just single-connection) is still used by most sequential-logic V9 tests for speed — that's a legitimate choice for logic that doesn't depend on multi-connection behavior, and this report is explicit about which 11 tests are gated on an actual multi-connection `OMNIA_V9_TEST_DATABASE_URL` server versus which use PGlite.

## Concurrency, re-run from scratch

All five mandatory race categories were re-run against a fresh database, 3–5 repetitions each, zero flakes, zero double-spends:
- single-use authority reservation race — exactly one winner
- concurrent identical idempotent retries — converge to one winner, budget spent once
- identical-receipt race — one durable binding
- contradictory-receipt race — one winner, one rejected conflict
- conflicting-authorization-binding race — one durable winner, one rejected conflict

## Transition ledger, re-attacked

Re-ran all four tamper categories against the ledger: direct SQL `UPDATE` (rejected by trigger), direct SQL `DELETE` (rejected by trigger), sequence-number surgery via a forged direct `INSERT` bypassing the reservation-table trigger (caught by the application verifier's sequence-gap check), and digest surgery via a forged `INSERT` with a mismatched `event_digest` (caught by comparing PostgreSQL's own `digest()` recomputation against the stored value). All four still hold.

## Timestamp fix, mutated again

Reverted the Date-object precision fix in both `authority-transition-ledger.mjs` and `pre-effect-authority-reconciler.mjs` back to the original `Date.parse(String(value))` form and reran the affected test files: 5 tests failed immediately across both files, including both the illegitimate-ordering case (reservation appearing to predate an effect it actually followed) and — new this pass — a companion legitimate-ordering test proving the fix doesn't overcorrect: a reservation genuinely created ~400ms *before* an observation still reconciles successfully. Reverted the mutation; all 5 tests passed again.

## Mutation sanity pass, six more protections

Beyond the four protections mutated in the first pass (intent expiry, approval revocation, a tenant defense-in-depth recheck, and the append-only transition trigger — all still hold), this pass mutated six more, one at a time, confirmed the suite fails, then fully reverted:

| Protection | Mutation | Result |
|---|---|---|
| Evidence digest recomputation | disabled the digest-mismatch comparison in `verifyEvidence` | caught |
| Policy digest binding | disabled the SHA-256 format requirement before consequential ALLOW | caught |
| Constitution digest binding | disabled the SHA-256 format requirement before consequential ALLOW | caught |
| Receipt uniqueness conflict check | disabled the equality check guarding an existing P6 binding | caught (including by the real-Postgres race test) |
| Authorization-binding conflict check | disabled the equality check guarding an existing P7 binding | caught (including by the real-Postgres race test) |
| Constitution source-anchor binding | disabled the exact-substring check binding a policy rule into real constitutional text | caught |

Every mutation attempted across both passes was caught. None were left in the working tree — each was applied with a single `false &&` guard, confirmed to fail the narrow test, then reverted with `git checkout --` and reconfirmed passing before moving to the next.

**What wasn't attempted:** a live `DROP CONSTRAINT` on the receipt-bindings table's own primary key/unique constraints (as opposed to the application-level check that sits in front of them), because that table has a dependent foreign key from the authorization-bindings table and a cascading drop was judged too risky on a shared disposable database for the marginal evidence gained — the application-level guard was mutated and caught instead, and the underlying constraint's behavior is exercised structurally by every passing concurrency race.

## Cedar, reconfirmed from a clean install

Deleted `node_modules` entirely and ran `npm ci` from the committed lockfile. Confirmed `@cedar-policy/cedar-wasm` resolves to exactly `4.12.0` with its recorded integrity hash. Ran `scripts/verify-v9-p3.mjs` directly: real schema parse, real policy parse, real strict validation, and five real `isAuthorized` probes (one ALLOW, four DENY) all matched expectation, using the actual installed WASM engine — no mock.

## Numbers, recomputed, not assumed

- `npm run test:v9`: **173** tests, 173 pass, 0 fail, 0 skipped, 0 todo (up from 172 in the first pass — one test added: a companion legitimate-ordering timestamp test)
- End-to-end circuit (now run *by* the closure gate itself): 1 test, pass
- **Grand total: 174 V9 tests, 174 pass, 0 fail, 0 skipped, 0 todo**
- Real-PostgreSQL-gated tests: **11** (up from 10 — the new companion test)
- `npm run test:deterministic` (full repository): **267** tests, 267 pass, 0 fail, 0 skipped (up from 266 — same one new test)
- `lite/` diff against `origin/main`: empty. Confirmed via both `git diff --stat` and `git status --short`.
- Browser tests (`npm run test:browser`): still `FAILED_ENVIRONMENT` — same pre-existing Playwright browser-revision mismatch as the first pass (installed playwright expects revision 1228, sandbox has 1194). Unrelated to V9; the one failing test exercises an unrelated site-crawler feature. Not silently omitted from this report, not misreported as a pass.

## Self-contradiction audit

Cross-checked the closure script, `package.json`, CI workflow, both reports, and actual terminal output against each other. Full findings table is in the JSON report (`selfContradictionAudit`). Summary: **zero material contradictions found**. Three things were clarified rather than left ambiguous:
1. The report now distinguishes `testedGitSha` (the commit whose code produced this evidence) from `reportCommitSha` (the commit that adds this file), instead of one overloaded `gitSha` field.
2. The prior report's claim that the end-to-end circuit "runs separately via CI" was true when written but is superseded by the self-containment fix — stated plainly.
3. CI's `omnia-v9-closure` job now runs the end-to-end circuit twice (once inside the closure gate, once as its own explicit step) — noted as redundant-but-harmless, not fixed, since removing it wasn't required by this mission and doing so unprompted would be scope creep beyond what was asked.

## The decisive final run

```
rm -rf node_modules && npm ci
# fresh disposable PostgreSQL 16 database, pgcrypto only
export OMNIA_V9_TEST_DATABASE_URL=postgresql://omnia_v9_test:***@localhost:5432/omnia_v9_test
node scripts/verify-v9-closure.mjs
```

Exit code: **0**. Terminal markers, in order: `OMNIA_V9_REAL_POSTGRES_FULL_SUITE_VERIFIED`, `OMNIA_V9_CEDAR_POLICY_VERIFIED evaluator=@cedar-policy/cedar-wasm@4.12.0 cedarVersion=4.12.0 policyDigest=9ccecfff9cae4b82b7a896495a434100752201597c80cd85cb691c50401cb98b`, `OMNIA_V9_CLOSURE_CIRCUIT_VERIFIED`, `OMNIA_V9_CLOSURE_VERIFIED`.

## What is NOT claimed

This system is not claimed to be production-proven — it has never run against production infrastructure, and this mission forbids that. It is not claimed to be mathematically perfect or universally secure — mutation testing, while covering ten distinct critical protections across two passes with zero survivors after fixes, is explicitly time-boxed and not exhaustive. It is not claimed that every V8 defect category maps onto this codebase — two categories (self-declared reviewer independence, self-improvement reaching promotion) don't apply because V9 has no review/promotion pipeline, and that's stated rather than papered over with a false "covered."

## Production status

**NOT DEPLOYED.** Zero outbound calls to real providers, zero customer contact, zero payment movement, zero production database mutation, zero DNS changes, zero production credentials used, zero merges to `main` (`main` remains at `ba2b100`, unchanged throughout this entire mission), `lite/` untouched.

## Gate checklist (34 mandatory items)

All 34 items in the mission's absolute completion standard were checked. The only two worth calling out individually:

- **Item 27** ("verify-v9-closure.mjs itself executes that circuit"): confirmed true by direct code inspection, not inference — see `gateOrderingProof` in the JSON report.
- **Item 24** ("critical mutations are caught at the documented level"): 10 of 10 attempted mutations across both passes were caught; the two documented gaps found (intent expiry, tenant defense-in-depth) were in the *first* pass and were closed with regression tests before this pass began.

Every other item — real PostgreSQL, clean migrations, zero skips, real Cedar with genuine ALLOW/DENY probes, safe concurrency, rejected contradictions, tamper-resistant append-only ledger, corrected timestamp precision, fail-closed epistemic handling, a passing tampered-and-untampered end-to-end circuit, full deterministic regression, an honestly-reported browser-test environment failure, an untouched `lite/`, zero production effects, and matching machine/human/terminal evidence — holds.

**Final verdict: OMNIA_V9_FINAL_CLOSURE_VERIFIED**
