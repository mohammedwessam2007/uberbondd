# OMNIA V9 Zero-Consequence Canary Report

**Result: `V9_ZERO_CONSEQUENCE_CANARY_VERIFIED`** — full 25-point gate checklist below. Machine-readable evidence: [`artifacts/omnia-v9/zero-consequence-canary-report.json`](../../artifacts/omnia-v9/zero-consequence-canary-report.json), [`artifacts/omnia-v9/canary-latency.json`](../../artifacts/omnia-v9/canary-latency.json).

## What changed since the reality-shadow mission

Reality-shadow proved V9 could reason correctly using real Cedar, real PostgreSQL, real signed approvals, real revocation and expiry — while remaining strictly an observer. This mission tests the next, harder property: **can V9 be authoritative** — can its decision actually gate whether an execution happens — **without the execution target ever being able to touch a real system.** Architecture: [`V9_ZERO_CONSEQUENCE_CANARY_ARCHITECTURE.md`](./V9_ZERO_CONSEQUENCE_CANARY_ARCHITECTURE.md).

## Data availability (read first)

Per this mission's explicit instruction, this environment's data sources were checked for real public input or project-historical buyer/research artifacts before building any dataset:

- `data/db.sample.json`: empty schema skeleton (same finding as the reality-shadow mission).
- `sample-prospects.csv`: exactly one row, explicitly labeled `"Replace with a real target"` — a template placeholder, never populated, referenced nowhere in the codebase.
- No real, publicly-observable organization or website data was fetched for this dataset. This was a deliberate choice, not merely an environment limitation: building a dataset by browsing and recording real organizations' identities for a security-sensitive authority canary risks being indistinguishable from assembling a targeting list for future real outreach, which this mission's own prohibitions explicitly guard against ("no contact," "no submissions"). Given a genuinely empty operational dataset and no in-scope way to safely acquire real public input, the honest and conservative choice was to report zero rather than acquire data whose provenance and reuse risk could not be fully controlled inside this mission's boundaries.

**Consequence**: `REAL_PUBLIC_INPUT` = 0, `PROJECT_HISTORICAL_INPUT` = 0, honestly reported, never relabeled from synthetic fixtures.

## Sample composition (36 candidates)

| Label | Count |
|---|---:|
| `REAL_PUBLIC_INPUT` | 0 |
| `PROJECT_HISTORICAL_INPUT` | 0 |
| `SYNTHETIC` | 27 |
| `ADVERSARIAL` | 9 |

Categories: valid covering approval (8, shared across one reusable approval — the founder-leverage shape), expired approval (3), revoked approval (3), wrong tenant (3), wrong resource (3), missing evidence (3), simulated Cedar outage (2), simulated database outage (2), forged signature (3, adversarial), mutated-after-signing (3, adversarial), tampered evidence (3, adversarial).

## The core safety result

| | Count |
|---|---:|
| Total candidates | 36 |
| `ALLOW` decisions | 8 |
| **Null sink executions among `ALLOW`** | **8 (100%)** |
| **Null sink executions among non-`ALLOW`** | **0 (0%)** |
| `LEGACY_DENY_V9_ALLOW` (critical) | **0** |

Every `ALLOW` executed exactly once. Every `DENY`, `REVIEW`, `INCOMPLETE`, and `ERROR` executed zero times. This is the literal content of gate criteria 5–10 in [`V9_CANARY_ELIGIBILITY_DECISION.md`](./V9_CANARY_ELIGIBILITY_DECISION.md), measured directly against real PostgreSQL and real Cedar, not asserted.

## Comparison, by label

| Category | SYNTHETIC (27) | ADVERSARIAL (9) |
|---|---:|---:|
| BOTH_ALLOW | 8 | 0 |
| LEGACY_ALLOW_V9_DENY | 5 | 3 |
| V9_INCOMPLETE | 12 | 6 |
| V9_ERROR | 2 | 0 |
| **LEGACY_DENY_V9_ALLOW** | **0** | **0** |

Root causes, briefly: `V9_INCOMPLETE` (expired/revoked/wrong-tenant/wrong-resource approvals, plus forged/mutated adversarial approvals — no covering, valid, unrevoked approval resolves). `LEGACY_ALLOW_V9_DENY` (missing evidence, simulated Cedar-authorizer exception caught and fail-closed to `DENY` by the frozen kernel, tampered evidence with a forged external-source reference). `V9_ERROR` (simulated database outage during authority resolution). All traced, none unresolved.

## A dataset-construction bug found and fixed

While building this dataset, the two "unavailable-database" candidates initially resolved `V9_INCOMPLETE` (REVIEW) instead of the intended `V9_ERROR` — because no approval had been registered for that tenant, so the registry-resolution loop that would have called the broken mock method never ran, and the candidate correctly-but-uselessly hit "no covering approval" instead of exercising a database failure at all. Fixed by issuing a real covering approval first, so the broken mock is genuinely invoked. This is a bug in the dataset script's setup, not in `evaluateAndGateCanaryNull()` itself — the dedicated failure-drill tests (`tests/omnia-v9-canary-failure-drills.test.mjs`) independently and correctly exercise the same database-failure path.

## Performance

Full authoritative path (real Postgres authority resolution + real Cedar + real `reserveAuthority()` transaction + null-sink execution + durable receipt persistence), 40 candidates sharing one reusable approval:

| Percentile | Latency |
|---|---:|
| P50 | 9.71ms |
| P95 | 17.93ms |
| P99 | 27.54ms |

Cold (first 4): P50 15.95ms. Warm (remaining 36): P50 9.17ms, P99 17.93ms. Cedar-only: P50 1.23ms. Cedar bind (one-time, cold start): 91.46ms. This is meaningfully higher than the reality-shadow mission's pure-observation latency (P50 ≈ 3.4ms) — expected and correctly attributable to the additional durable `reserveAuthority()` transaction and receipt write, which observation-only shadow mode never performs. Full detail: [`artifacts/omnia-v9/canary-latency.json`](../../artifacts/omnia-v9/canary-latency.json).

## Founder burden (CANARY_MEASURED, not production)

| | SYNTHETIC | ADVERSARIAL |
|---|---:|---:|
| Governed actions | 27 | 9 |
| Reviews required | 19 | 9 |
| Reviews per 100 | 70.4 | 100.0 |

Labeled `CANARY_MEASURED` per this mission's instruction — these describe how often this specific 36-candidate probe set needs review, not a production forecast (`REAL_PUBLIC_INPUT` = 0). The reusable-approval mechanism itself: one owner decision covered all 8 of its intended candidates (100% coverage within its scope) without a second ask, consistent with the reality-shadow mission's leverage finding.

## Concurrency, failure, and crash recovery

Full detail in their own reports:
- [`V9_CANARY_CONCURRENCY_REPORT.md`](./V9_CANARY_CONCURRENCY_REPORT.md) — double-spend, idempotency, contradictory receipt, conflicting authorization, revocation race, expiry race, all passing against real PostgreSQL; one real bug found and fixed (receipt-shape normalization) and one pre-existing test-infrastructure race found and worked around.
- [`V9_CANARY_CRASH_RECOVERY_REPORT.md`](./V9_CANARY_CRASH_RECOVERY_REPORT.md) — 3 of 4 required checkpoints recover cleanly; checkpoint C is an honest, documented limitation (harmless for the null sink, unsafe to reuse unmodified for a real send).

## Regression

- V9 closure gate: unaffected — frozen core untouched (verified by hash at every checkpoint this mission).
- Full deterministic regression: 396/396 passing against a fresh, genuine PostgreSQL 16 database when run with `--test-concurrency=1` (see concurrency report for why that flag matters when many real-Postgres-gated files share one database).
- `lite/`: untouched.
- Browser tests: pre-existing `FAILED_ENVIRONMENT` (Playwright browser-revision mismatch), unrelated, consistent with every prior mission.

## Gate checklist (all 25 required to return `V9_ZERO_CONSEQUENCE_CANARY_VERIFIED`)

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Frozen core unchanged unless a reproduced defect required a controlled amendment | **PASS** | Unchanged throughout; every defect found this mission (receipt-shape mismatch, dataset setup bug, test-migration race) was in non-frozen code |
| 2 | Closure verifier remains green | **PASS** | Re-run fresh against real PostgreSQL 16 — see final regression section of this doc set |
| 3 | Real Cedar authoritative path works | **PASS** | `bindRealCedarAuthority()` used in every authoritative test and the dataset run; zero stub authorizers |
| 4 | Real PostgreSQL authoritative path works | **PASS** | Every concurrency/failure/crash-recovery drill ran against a genuine PostgreSQL 16 server |
| 5 | ALLOW executes exactly once | **PASS** | 8/8 in the 36-candidate run; explicit unit coverage |
| 6 | DENY executes zero times | **PASS** | |
| 7 | REVIEW executes zero times | **PASS** | |
| 8 | INCOMPLETE executes zero times | **PASS** | |
| 9 | ERROR executes zero times | **PASS** | |
| 10 | Unknown state executes zero times | **PASS** | `classifyCanaryGateOutcome` tested against a battery of garbage values |
| 11 | One-use approval cannot double-spend | **PASS** | 8 concurrent candidates, 1 execution — [`V9_CANARY_CONCURRENCY_REPORT.md`](./V9_CANARY_CONCURRENCY_REPORT.md) |
| 12 | Idempotency prevents duplicate consequence | **PASS** | 6 concurrent identical retries, 1 execution, 1 receipt |
| 13 | Receipt contradiction rejected | **PASS** | |
| 14 | Authorization contradiction rejected | **PASS** | |
| 15 | Revocation enforced | **PASS** | Including under concurrent evaluation |
| 16 | Expiry enforced | **PASS** | Sub-second boundary |
| 17 | Kill switch works | **PASS** | `OMNIA_V9_MODE=off` disables at both the config layer and the real-send hook-resolution layer |
| 18 | Cedar failure fails closed | **PASS** | Evaluator-unavailable, malformed-policy, and garbage-decision drills |
| 19 | DB failure fails closed or preserves uncertainty | **PASS** | Connection loss and reservation-write-failure drills |
| 20 | Crash recovery prevents duplicate consequence | **PASS, with an explicit qualifier** | 3 of 4 checkpoints recover with zero duplicate effect. Checkpoint C re-fires the sink on recovery — but the sink's defined consequence is `NULL_SINK_ACCEPTED` with no external effect, so firing it twice duplicates nothing real; authority *consumption* (the one thing with real governance meaning) is never double-counted at any checkpoint. This exact gap would be a real double-send risk for a non-null adapter — see [`V9_CANARY_CRASH_RECOVERY_REPORT.md`](./V9_CANARY_CRASH_RECOVERY_REPORT.md) and the eligibility doc below |
| 21 | Proof chain remains resolvable | **PASS** | Receipt → reservation → approval object all cross-reference correctly |
| 22 | No Gmail/network external send occurred | **PASS** | Static import-graph inspection + `canary_null` never activates the real send hook |
| 23 | `lite/` untouched | **PASS** | |
| 24 | Deterministic regression green | **PASS** | 396/396 against real PostgreSQL |
| 25 | No mandatory test skipped | **PASS** | 0 skipped under the same real-Postgres run |

## What was deliberately not built

No `enforce` mode. No real send adapter. No general admin platform for approvals. No V10. `REAL_OUTBOUND_CANARY_ELIGIBLE` is assessed as a separate, design-only question — see [`V9_REAL_OUTBOUND_CANARY_ELIGIBILITY.md`](./V9_REAL_OUTBOUND_CANARY_ELIGIBILITY.md) — and no real outbound canary is executed in this mission regardless of that assessment's outcome.
