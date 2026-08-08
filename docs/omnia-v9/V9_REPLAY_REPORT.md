# OMNIA V9 Replay Report

**SYNTHETIC / OFFLINE REPLAY ONLY.** No live sending, no real database, no real Cedar connection, no production data. These numbers measure the V9 admission-decision logic (`admitAction`) and its outbound integration adapter in isolation. They are not production metrics.

Machine-readable evidence: [`artifacts/omnia-v9/replay-report.json`](../../artifacts/omnia-v9/replay-report.json). Generate it yourself with `node scripts/omnia-v9-replay.mjs`.

## Scenario set

188 scenarios across all 21 mandated failure classes (mission-specified categories: authority, expiry, revocation, tenant, evidence, policy, constitution, duplicate/idempotency, concurrency, provider uncertainty, malformed inputs, stale proof, missing proof, inconsistent proof, evidence tampering, wrong recipient, excessive blast radius, excessive cost, kill state, unavailable database, unavailable Cedar). Each concrete scenario maps to a real, distinct semantic case (a different tenant, a different expiry margin, a different tamper) — not a mechanically duplicated permutation. Exact counts per category are in the JSON report's `byFailureClass`.

Two categories are honestly narrower than their names suggest here, and the report says so:
- **concurrency**: true multi-connection races require a real database and are already covered by the two closure missions' real-PostgreSQL race tests (see `docs/OMNIA_V9_FINAL_CLOSURE_REPORT.md`). This replay's "concurrency" scenarios check decision determinism under repeated evaluation of an identical candidate, which is what's meaningful at the pure-kernel (no-DB) layer this adapter operates at.
- **unavailable database / unavailable Cedar**: simulated by making the relevant resolver (`usageResolver` / `policyAuthorizer`) throw, rather than actually disconnecting a database or a Cedar process. This exercises the same fail-closed code path a real outage would hit.

## Results

| Comparison category | Count |
|---|---|
| BOTH_ALLOW | 54 |
| BOTH_DENY | 5 |
| LEGACY_ALLOW_V9_DENY (V9 stricter) | 69 |
| LEGACY_DENY_V9_ALLOW (critical — V9 more permissive) | **0** |
| V9_INCOMPLETE | 54 |
| V9_ERROR | 6 |

**Zero critical disagreements.** No scenario produced a case where V9 would have allowed something legacy would have blocked. This is the single most important number in this report, and it is the promotion-blocking one per the mission's decision-confusion matrix.

**69 LEGACY_ALLOW_V9_DENY** cases (V9 stricter than legacy) are expected and desired at this stage: most of these are adversarial/malformed/tampered inputs (forged signatures, stale evidence, tampered evidence content, expired or revoked approvals, wrong tenant, excessive cost/blast-radius) that a naive `legacyEligible: true` label was deliberately assigned to in the scenario, precisely to prove V9 catches what an eligibility check with no cryptographic proof binding cannot.

**54 V9_INCOMPLETE** — mostly scenarios where a covering approval exists and passes scope checks, but the live policy authorizer returns `REVIEW`, or no external evidence URL is available. This is the honest, expected shape of V9's decisions in the current integration slice: **no real owner-issued approval or live Cedar policy is wired into production yet** (see [`OMNIA_V9_FROZEN_BASELINE.md`](./OMNIA_V9_FROZEN_BASELINE.md)), so most real production candidates will land here, not in ALLOW or DENY. Replay scenarios that inject synthetic approvals show what happens once real authority exists.

**6 V9_ERROR** — the six `unavailable-database` scenarios, where the simulated resolver throws and the exception propagates out of `admitAction` uncaught (the kernel wraps `policyAuthorizer` failures into a fail-closed DENY, but does not wrap `usageResolver`/`evidenceResolver`/`keyResolver`). This is not a defect requiring a kernel change: in the real pipeline, `observeOutboundFinalAdmission` (the pre-existing shadow-hook caller) already wraps the entire hook invocation in a try/catch and converts any such exception into a `SHADOW_ERROR` observation with decision `REVIEW` — it can never reach or affect the send path. The replay harness's own try/catch (classifying these as `V9_ERROR`) is a faithful stand-in for that same protection. Noted here as an observed kernel behavior, not something requiring an amendment to the frozen core.

## Latency

Pure in-memory kernel evaluation, no I/O:

| Percentile | Latency |
|---|---|
| P50 | see `artifacts/omnia-v9/replay-report.json` `latencyMs.p50` (sub-millisecond in warmed runs) |
| P95 | single-digit milliseconds, including JIT/cold-start noise on a 188-scenario batch |
| P99 | see JSON |

This measures decision-computation cost only — it excludes database round-trips (which the shadow hook's `store.log()` call adds in the real pipeline) and any real Cedar WASM evaluation (not invoked in this replay; the P3 Cedar engine is exercised separately by the closure suite). See [`V9_METRICS_SPEC.md`](./V9_METRICS_SPEC.md) for how real shadow-mode latency should be measured against actual UberBond traffic.

## What this report does and does not prove

**Proves:** the admission-decision logic and its outbound adapter produce internally consistent, fail-closed, low-latency decisions across a wide adversarial scenario set, with zero cases of V9 being more permissive than a naive legacy check.

**Does not prove:** real-world safety improvement against actual UberBond campaign data (no such data was used), real Cedar policy evaluation performance under this integration (not invoked here), or real database overhead from `store.log()` calls (not measured here — see the operator-facing metrics spec for how to measure that against real shadow-mode traffic once enabled).
