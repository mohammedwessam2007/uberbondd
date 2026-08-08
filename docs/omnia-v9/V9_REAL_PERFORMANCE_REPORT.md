# OMNIA V9 Real Performance Report

Machine-readable evidence: [`artifacts/omnia-v9/reality-shadow-latency.json`](../../artifacts/omnia-v9/reality-shadow-latency.json), produced by [`scripts/omnia-v9-reality-shadow-latency.mjs`](../../scripts/omnia-v9-reality-shadow-latency.mjs).

## What changed since PR #19

PR #19's replay latency (P50 ≈ 0.36ms, P95 ≈ 0.82ms) measured pure in-memory kernel decision computation only — no database, no Cedar call, per decision. This report measures the actual shadow stack: real database authority resolution, real Cedar evaluation, and the frozen crash-safety observation wrapper, end to end.

## Environment

- **Database**: real PostgreSQL 16, started via `pg_ctlcluster`, reached over TCP at `127.0.0.1:5432` — not an in-process fixture, not mocked.
- **Cedar**: `@cedar-policy/cedar-wasm@4.12.0`, real WASM runtime, version `4.12.0`.
- **Candidate count**: 60, one shadow approval reused across all of them (the realistic reuse pattern this mission asks about — see [`V9_FOUNDER_LEVERAGE_REPORT.md`](./V9_FOUNDER_LEVERAGE_REPORT.md)).
- **Sample labeling**: this is a `SYNTHETIC` performance micro-benchmark, not a production load test — there is no real traffic in this environment to benchmark against (see [`V9_REALITY_SHADOW_REPORT.md`](./V9_REALITY_SHADOW_REPORT.md), "Data availability").

## Cold start

Binding the real Cedar authority (loading the WASM module, binding the constitution, building and validating the policy bundle) took **90.93ms**, once, before any candidate was evaluated. This is a one-time process-lifetime cost — `bindRealCedarAuthority()` caches its result and is not re-run per decision (verified in [`tests/omnia-v9-reality-shadow-cedar.test.mjs`](../../tests/omnia-v9-reality-shadow-cedar.test.mjs)).

## Per-decision latency (total, including DB + Cedar)

| Percentile | Latency |
|---|---:|
| P50 | 3.41ms |
| P95 | 8.00ms |
| P99 | 19.63ms |
| Max observed | 19.63ms |

## Cold vs. warm split

The first ~10% of candidates (6 of 60) run measurably slower than the rest — Postgres connection/query-plan warm-up, not a V9 defect:

| | Cold (first 6) | Warm (remaining 54) |
|---|---:|---:|
| P50 | 8.00ms | 3.32ms |
| P95 | 19.63ms | 5.06ms |
| P99 | 19.63ms | 6.98ms |

## Cedar-only latency

Isolated by wrapping the real `policyAuthorizer` call site:

| Percentile | Latency |
|---|---:|
| P50 | 1.11ms |
| P95 | 5.59ms |
| P99 | 12.09ms |

Cedar accounts for roughly a third of P50 total latency and a somewhat larger share at the tail — consistent with WASM call overhead rather than database I/O dominating.

## Database queries per action

**Exactly 3 queries per decision**, constant across all 60 candidates (P50 = P95 = P99 = max = 3): one join query resolving the shadow-approval registry against `omnia_v9_objects`, one `getApprovalUsage` lookup, one `isRevoked` check. This is a direct, explainable count, not an estimate.

## Bytes written per action

**Zero.** Reality-shadow evaluation is read-only against the database — `resolveShadowAuthorityContext()` issues only `SELECT` statements. Writes (approval issuance, revocation, usage-count increment on a real `ALLOW`) happen at issuance/revocation time and on committed sends, not during evaluation itself. This is a genuine finding, not an omission: measuring a decision's I/O footprint separately from an approval's I/O footprint is the honest way to report it, since one approval is reused across many decisions.

## Failure-path latency

Not separately percentiled in this run (small failure-drill sample sizes in [`tests/omnia-v9-reality-shadow-failure-drills.test.mjs`](../../tests/omnia-v9-reality-shadow-failure-drills.test.mjs) make percentiles meaningless), but qualitatively: every simulated database failure (connection loss, read timeout) fails fast — the thrown exception surfaces well before any query would complete, since it's raised synchronously by the failure stub, not by a real network timeout. A real network timeout in production would take as long as the configured `pg` client timeout, which this mission did not configure or measure, and this report does not claim otherwise.

## Limitations

- 60 candidates against one real Postgres instance on one machine is not a load test; it establishes plausible per-decision overhead, not a capacity ceiling.
- No concurrent-load measurement was taken (the closure suite's concurrency tests prove correctness under concurrency, not throughput under concurrency).
- `bytesWrittenPerAction` measures statement byte-size passed to `pg`, not actual on-disk WAL/page writes.
- This is a single-tenant, single-approval-reuse scenario; multi-tenant contention was not measured.
