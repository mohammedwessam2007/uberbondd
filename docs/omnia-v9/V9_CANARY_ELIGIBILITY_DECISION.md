# OMNIA V9 Canary Eligibility Decision

## Result: `V9_CANARY_ELIGIBLE`

Not `PRODUCTION_PROVEN`. Not canary-active. No `enforce` mode exists in this codebase, and this decision does not create one. This is the strongest conclusion this mission's own rules permit: the reality-shadow mechanism is technically sound, safe, and ready for a human to decide when to expose it to real traffic — it is not, and does not claim to be, evidence that real traffic has already validated it.

## Gate criteria, checked individually

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Frozen core unchanged | **PASS** | Byte-for-byte SHA-256 verification of all 20 frozen files, re-run at every checkpoint this mission, most recently after all fixes in this mission |
| 2 | V9 closure remains green | **PASS** | `OMNIA_V9_CLOSURE_VERIFIED`, fresh real PostgreSQL 16 database, 174/174 tests (173 V9 suite + 1 end-to-end circuit), 0 fail, 0 skipped |
| 3 | Real Cedar path verified | **PASS** | `@cedar-policy/cedar-wasm@4.12.0` loaded and bound for real in `bindRealCedarAuthority()`; wired into 172/188 reality-shadow scenarios with zero decision changes vs. the stub; end-to-end `ALLOW` proven against real PostgreSQL |
| 4 | Shadow approvals work | **PASS** | Real, signed, Postgres-persisted `OWNER_APPROVAL` objects, issued/resolved/reused correctly — [`V9_SHADOW_APPROVAL_SPEC.md`](./V9_SHADOW_APPROVAL_SPEC.md) |
| 5 | Revocation works | **PASS** | `ALLOW` → `REVIEW` immediately on next evaluation after revocation, no cache — [`V9_REVOCATION_EXPIRY_DRILL.md`](./V9_REVOCATION_EXPIRY_DRILL.md) |
| 6 | Expiry works | **PASS** | Real timestamp comparison, clean transition at the boundary, no precision regression — same drill doc |
| 7 | Zero unresolved `LEGACY_DENY_V9_ALLOW` | **PASS** | 0 across all 188 scenarios and the full-stack demonstration — [`V9_REAL_DECISION_QUALITY_REPORT.md`](./V9_REAL_DECISION_QUALITY_REPORT.md) |
| 8 | False-deny rate understood and acceptable | **PASS** | All 69 `LEGACY_ALLOW_V9_DENY` cases individually classified; 0 are `V9_FALSE_DENY` or `DATA_QUALITY_FAILURE` |
| 9 | V9 error rate acceptable | **PASS** | 6/188 (3.2%), all traced to one simulated-DB-outage class, all confirmed fail-safe (`SHADOW_ERROR`/`REVIEW`, never a crash, never `ALLOW`) |
| 10 | Latency acceptable | **PASS, with a caveat** | P50 3.4ms / P99 19.6ms per decision including real DB + real Cedar — small relative to the send path it observes (an outbound email send already involves a Gmail API round trip an order of magnitude slower); not benchmarked under concurrent load — [`V9_REAL_PERFORMANCE_REPORT.md`](./V9_REAL_PERFORMANCE_REPORT.md) |
| 11 | Owner burden materially improved relative to no reusable approval | **PASS, mechanism-level only** | see below |
| 12 | No unexpected cross-tenant behavior | **PASS** | `resolveShadowAuthorityContext()` never returns another tenant's approvals — directly tested |
| 13 | Deterministic regression green | **PASS** | 357/357 tests pass, **0 skipped**, against a fresh real PostgreSQL 16 database (previously 10 tests skipped for lack of a real server) |
| 14 | No required tests skipped | **PASS** | same run — 0 skipped |
| 15 | No production mutation occurred | **PASS** | every database touched this mission was a disposable local fixture (PGlite) or an explicitly-created local test database (`omnia_v9_latency`, `omnia_v9_check`, `omnia_v9_closure`, `omnia_v9_final_closure`) — none is a deployed production database |

## Criterion 11, in full: owner burden and the reusable-approval mechanism

This is the one criterion that cannot be satisfied at production scale in this environment, because `REAL_OPERATIONAL` sample count is 0 (see [`V9_REALITY_SHADOW_REPORT.md`](./V9_REALITY_SHADOW_REPORT.md)). What can be, and was, tested: **does the mechanism itself reduce re-asking, given a real covering approval exists?** Yes — one owner decision (one signed, Postgres-persisted approval with `maxUses: 3`) covered 3 of 4 real-Cedar-evaluated candidates without a second look, atomically, with usage accounting verified correct under the frozen closure suite's concurrency races (now re-run against a genuine PostgreSQL server, 357/357 passing). That is a 75% reduction in owner re-asking in this specific demonstration.

This satisfies the criterion at the level this environment can honestly test: the mechanism works, is safe, and provides leverage exactly as designed. It does **not** satisfy, and this document does not claim it satisfies, a production-scale measurement of real founder-minutes saved — that requires real approvals covering real campaigns, which do not exist yet. [`V9_FOUNDER_LEVERAGE_REPORT.md`](./V9_FOUNDER_LEVERAGE_REPORT.md) is explicit about this distinction throughout.

## Why this is `V9_CANARY_ELIGIBLE`, not blocked

Every criterion that could be objectively tested against real infrastructure in this environment — safety (zero false allows), correctness (every disagreement traced to a real cause), resilience (every DB/Cedar failure mode fails closed, verified against a real database connection failure), reversibility (revocation and expiry both take effect immediately), and mechanism soundness (a reusable approval genuinely reduces re-asking) — passed with real, reproducible evidence, most of it against a genuine PostgreSQL 16 server, not a synthetic stand-in. The one criterion this environment cannot fully test (production-scale owner burden) is honestly reported as untestable here, not silently assumed or inflated with synthetic volume.

## What `V9_CANARY_ELIGIBLE` does NOT mean

- It does not mean canary mode exists — it doesn't; `OMNIA_V9_MODE`'s only values remain `off`/`shadow`/`compare`.
- It does not mean any real send has ever been authorized or suppressed by V9 — it hasn't; `src/pipeline.mjs` still ignores V9's decision entirely.
- It does not mean real founder-burden reduction has been measured — it hasn't; `REAL_OPERATIONAL` sample count is 0.
- It does not authorize deploying this branch to production, issuing a real (non-shadow) approval, or flipping `OMNIA_V9_MODE` anywhere — those are explicit human decisions this mission does not make on Mohamed's behalf.

## Final status line

**`NO ENFORCEMENT ACTIVATED`. `NO OUTBOUND SENT`. `NOT PRODUCTION PROVEN`.**

Branch `product/omnia-v9-reality-shadow`, forked from and unmerged into `product/omnia-v9-real-integration` (PR #19, itself unmerged). Frozen core unchanged. Closure gate green against a real PostgreSQL 16 server (174/174). Full deterministic regression green with zero skips against the same real server (357/357). `lite/` untouched. Browser tests: pre-existing `FAILED_ENVIRONMENT` (Playwright browser-revision mismatch), unrelated to this mission, consistent with every prior mission's finding.
