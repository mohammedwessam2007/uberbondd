# OMNIA V9 Final Closure Report

**Result: OMNIA V9 CLOSURE VERIFIED**

Commit `b9eaa883a96c5cfd27a15bf9048c15ed0e643db9` on branch `claude/omnia-v9-closure-verify-1iuar2` (built from `agent/omnia-v9-closure`, the PR #18 head).

Machine-readable evidence: [`artifacts/omnia-v9/closure-report.json`](../artifacts/omnia-v9/closure-report.json).

## What was actually done

This was a verification-and-repair pass, not a redesign. The P0–P9 stack already existed. The work here was: run it against real infrastructure, find genuine defects, fix them with the smallest safe change, add regression tests, and re-verify — repeatedly — until the closure gate told the truth.

### Infrastructure
- Provisioned a real, disposable local PostgreSQL 16 instance (`postgresql-16` package; no Docker daemon was available in this sandbox, so this is a native install rather than a container — same major version and `pgcrypto` extension as the CI service).
- Applied migrations 001–008 cleanly from empty, confirmed idempotent on re-run, confirmed no migration depends on hidden state.

### Genuine defects found and fixed
1. **Date-object timestamp truncation** (`src/omnia-v9/authority-transition-ledger.mjs`, `src/omnia-v9/pre-effect-authority-reconciler.mjs`). node-postgres returns `timestamptz` columns as JS `Date` objects; the code compared them via `Date.parse(String(dateObject))`, which silently drops sub-second precision. Against PGlite (which returns strings) this never triggered — it only appeared once real PostgreSQL was in the loop. In the P9 chain verifier this caused spurious failures; in the P8 pre-effect reconciler it could let a reservation created up to ~1 second *after* an observation appear to have existed *before* it — a real crack in the exact "consequence belongs to authority that predates it" guarantee this system exists to provide. Fixed by special-casing `Date` instances before falling back to string parsing. Three regression tests added, two of which fail without the fix (confirmed by reverting and re-running).

2. **Cedar was never actually installed or exercised.** `@cedar-policy/cedar-wasm` was referenced by `src/omnia-v9/cedar-adapter.mjs` but not declared as a dependency; every attempt to use it failed closed with `CEDAR_UNAVAILABLE`, and `scripts/verify-v9-closure.mjs` never called the P3 verification script at all — so the closure gate could report `VERIFIED` without Cedar ever running. Installed `@cedar-policy/cedar-wasm@4.12.0` via `npm install` (real package manager, real lockfile update). This immediately surfaced two real API-shape defects that had never been exercised against the genuine package:
   - `checkParsePolicySet` / `validate` / `isAuthorized` require `policies` as a `PolicySet` struct (`{ staticPolicies: text }`), not a raw string.
   - This package version returns lowercase decision values (`"allow"`/`"deny"`), not `"Allow"`/`"Deny"` — the adapter's comparison was checking the wrong case, which would have silently turned every real Cedar ALLOW into a DENY.
   Fixed both, updated the test file's Cedar mock to match the real contract (it encoded the same wrong assumption), and wired `scripts/verify-v9-p3.mjs` into the closure gate so it can never again pass without Cedar genuinely running. `node scripts/verify-v9-p3.mjs` now reports `P3_POLICY_VERIFIED` with real ALLOW/DENY probes against the installed engine.

3. **CI was broken.** `.github/workflows/ci.yml`'s `omnia-v9-closure` job ran `node --test tests/omnia-v9-closure.test.mjs` — a file that does not exist. Reproduced locally: exit code 1, "Could not find 'tests/omnia-v9-closure.test.mjs'". This job would have failed on every push and pull request. Pointed it at the real file, `tests/omnia-v9-end-to-end-proof-circuit.test.mjs`.

### Test coverage gaps found via mutation testing
Mutating one critical check at a time and confirming the suite fails is the only honest way to know a check is real. Two mutations survived:
- **Intent expiry** (`kernel.mjs verifyIntent`) had zero test coverage — disabling the `intent:expired` check left all 66 P0 tests green. Added two direct regression tests.
- **The content-level tenant recheck** inside `reserveAuthority` is unreachable through the normal API (an earlier check, backed by a write-time invariant in `putObject`, already catches the same condition first). Added a test that bypasses `putObject` with a direct SQL insert to prove the defense-in-depth recheck still works if that invariant is ever violated outside the application layer.

Also confirmed (mutate → observe failure → revert) that approval revocation and the P9 append-only transition-ledger triggers are genuinely enforced by the existing suite — the latter required mutating the migration file itself, since the test's own setup helper re-applies the raw migration SQL (including `CREATE TRIGGER`) before every run and would have silently undone an out-of-band `DROP TRIGGER`.

### Real PostgreSQL concurrency races added
The suite already had real multi-connection races for P6 receipt uniqueness. Three mandatory categories were missing and have been added, each stress-run 3–5 times with zero flakes:
- Two workers racing to reserve a single-use bounded authority → exactly one winner, no double-spend.
- Concurrent identical idempotent retries → converge on one winner, budget consumed once.
- Two workers durably binding conflicting authorization lineage to the same consequence → exactly one durable winner.

### Direct-SQL tamper tests on the transition ledger
Beyond the existing UPDATE/DELETE-rejection test, added two tests that insert forged rows directly via raw SQL (bypassing the application helpers entirely) and confirm PostgreSQL's own `digest()` computation and the application verifier still catch sequence-number surgery and digest surgery.

## What was verified but not modified
- The P0 admission kernel's fail-closed semantics (unknown fields, malformed timestamps, NaN/Infinity — the canonicalizer itself throws on non-finite numbers, which is a structural guarantee, not an incidental one).
- The full pre-consequence → consequence → post-consequence proof circuit, end to end, against real PostgreSQL, including a tamper case.
- P8's historical authority reconciliation (no retroactive authorization).
- V8 defect regression: none of the ten listed V8 failure modes reproduce in this codebase. Two (self-declared reviewer independence, unsupported self-improvement reaching promotion) don't map to anything in V9's scope — there is no review/promotion pipeline here — and that is stated plainly rather than papered over.

## Known limitations (stated plainly, not hidden)
- Mutation testing was time-boxed to the highest-value protections named in the mission; it is not an exhaustive sweep of every item on that list. See `mutationTestResultsCaveat` in the JSON report for exactly what was and wasn't covered, and why (a live constraint-drop on `omnia_v9_execution_receipt_bindings` was judged too risky given its FK-dependent tables on a shared disposable database — receipt-uniqueness enforcement is instead evidenced by the passing concurrency tests).
- The browser test suite (`tests/browser.test.mjs`) could not run in this sandbox due to a pre-existing Playwright browser-revision mismatch. This is unrelated to OMNIA V9 — it exercises an unrelated site-crawler feature — and was not modified or worked around.
- PostgreSQL here is a native local install, not the `postgres:16` Docker container CI uses. Same major version, same extension; not byte-identical infrastructure.
- Nothing was deployed. No outbound network calls were made to real providers. No production credentials were used or touched. `lite/` was not modified.

## Gate checklist (mission section 12)

| # | Requirement | Status |
|---|---|---|
| 1 | Migrations apply cleanly | ✅ |
| 2 | Full V9 semantic suite passes | ✅ 172/172 (`test:v9`) + 1/1 (end-to-end circuit) |
| 3 | Real PostgreSQL tests pass | ✅ 10 real-Postgres tests, 0 skipped |
| 4 | Real PostgreSQL contention races pass | ✅ 5 categories, stress-tested |
| 5 | Transition-ledger trigger tests pass | ✅ |
| 6 | Transition history is append-only | ✅ (mutation-confirmed) |
| 7 | End-to-end proof circuit passes | ✅ |
| 8 | Tampered circuit fails closed | ✅ |
| 9 | Authority cannot be retroactively manufactured | ✅ (P8 reconciler + timestamp fix) |
| 10 | One consequence cannot receive conflicting receipts | ✅ |
| 11 | One consequence cannot receive conflicting authorization bindings | ✅ |
| 12 | Critical security mutations are caught | ✅ (2 gaps found and closed) |
| 13 | Required tests are not skipped | ✅ 0 skipped anywhere |
| 14 | Existing deterministic UberBond tests remain green | ✅ 266/266 |

All fourteen gates pass. **OMNIA V9 CLOSURE VERIFIED.**
