# OMNIA V9 Execution Recovery Report

What was actually built and tested for the crash-safe external-effect execution protocol, with real numbers from real PostgreSQL 16. Machine-readable evidence: [`artifacts/omnia-v9/external-effect-recovery-report.json`](../../artifacts/omnia-v9/external-effect-recovery-report.json), [`artifacts/omnia-v9/external-effect-property-run-summary.json`](../../artifacts/omnia-v9/external-effect-property-run-summary.json).

## Checkpoint C: killed

Mission 5's crash-recovery drill found and documented an honest limitation: a crash between the null sink firing and the receipt being persisted was indistinguishable, using only reservation and receipt state, from the sink never having fired at all -- recovery re-fired it. Harmless for a null sink; a real double-send for anything else.

**[`tests/omnia-v9-external-effect-crash-recovery.test.mjs`](../../tests/omnia-v9-external-effect-crash-recovery.test.mjs)'s "CHECKPOINT C KILL-SHOT" test** reproduces the exact scenario against the new protocol: a crash injected at `IMMEDIATELY_AFTER_PROVIDER_ACCEPTS` (the provider truly accepted -- independently verified via `omnia_v9_null_provider_ledger`, a real Postgres table modeling the provider's own database, separate from anything our process tracks -- but the local process dies before recording that fact). Result:

- `freshAdapter.dispatchCallCount === 0` after recovery -- **`adapter.dispatch()` is never called again.**
- Recovery action: `FINALIZE_CONFIRMED`, final status `RECONCILED_ACCEPTED`.
- The provider-side ledger has exactly one row for this business key, proven by direct query, not merely inferred.

Checkpoint C is closed by two mechanisms working together: the durable `DISPATCHING` marker (so recovery knows a network call may have happened and must never treat this as a fresh start) plus provider reconciliation (so recovery can resolve the uncertainty without ever calling `dispatch()` again).

## The 10 crash scenarios (A-J)

All ten are documented in detail, with exact known/unknown/retry-legality/evidence analysis, in [`V9_CRASH_RECOVERY_STATE_MACHINE.md`](./V9_CRASH_RECOVERY_STATE_MACHINE.md). Summary: A-C (before or during durable registration) are provably safe to retry; D-I (after `DISPATCHING` became durable) never retry blindly and either finalize from local evidence, reconcile with the provider, or park for owner review; J (duplicate recovery workers) is proven race-safe under real Postgres concurrency.

## Property run: 1,000 scenarios, 63 unique semantic classes, zero violations

[`tests/omnia-v9-external-effect-property.test.mjs`](../../tests/omnia-v9-external-effect-property.test.mjs), seeded deterministically (`mulberry32(20260809)`), sweeps every combination of 7 crash points (including "no crash") x 9 provider-outcome simulation modes -- all 63 possible combinations were hit at least once across 1,000 runs (median ~16 occurrences each). Real measured run: **6.5 seconds** against real PostgreSQL.

The one property checked on every single scenario: `adapter.dispatchCallCount` never exceeds 1, and the provider-side ledger row count for that scenario's unique business key never exceeds 1. **Zero violations across all 1,000 scenarios.** Full per-class breakdown in [`artifacts/omnia-v9/external-effect-property-run-summary.json`](../../artifacts/omnia-v9/external-effect-property-run-summary.json).

## Real PostgreSQL concurrency races

[`tests/omnia-v9-external-effect-concurrency.test.mjs`](../../tests/omnia-v9-external-effect-concurrency.test.mjs), all against a genuine PostgreSQL 16 server (`OMNIA_V9_TEST_DATABASE_URL`):

- **Two concurrent recovery workers, one contested row**: exactly one worker claims it (`FOR UPDATE SKIP LOCKED`), zero duplicate dispatch calls, one durable resolution.
- **Two concurrent recovery workers, a 12-row backlog**: every row claimed by exactly one worker across both workers' loops combined, zero double-claims, all 12 resolved correctly.
- **Revocation after dispatch begins**: authority reserved and dispatch begun while an approval was valid; the approval is then revoked; the provider later (via reconciliation) confirms acceptance. Result: the execution still finalizes to `RECONCILED_ACCEPTED` -- **revocation never rewrites the already-attempted execution's recorded `approvalId`/`actionIntentDigest`.** Revocation prevents *future* actions; it does not retroactively unauthorize history.
- **Kill switch during dispatch**: with `OMNIA_V9_EXTERNAL_EFFECT_KILL_SWITCH=engaged`, a brand-new dispatch is refused *before* any durable object is created (verified: `store.getById()` for the blocked attempt returns `null`), while recovery of an execution that was already `RESULT_UNCERTAIN` before the kill switch engaged completes normally -- read-only reconciliation is not gated by the kill switch.

## Mutation testing: 4 real mutations, all caught

Applied directly to committed source, run against the real test suite, confirmed RED, then reverted with `git checkout` (confirmed byte-identical to the committed version afterward):

| # | Mutation | Result |
|---|---|---|
| A | Removed the durable `DISPATCHING` transition entirely | **12 of 15** crash-recovery tests failed, including the checkpoint-C kill-shot |
| B | Recovery blindly redispatches instead of reconciling, on `DISPATCHING` with no local evidence | **4 of 15** tests failed, including the checkpoint-C kill-shot |
| C | `classifyOutcome()` always returns `ACCEPTED`, ignoring actual provider evidence | **7 of 15** tests failed |
| D | Removed the business-key partial unique index (migration 011) | **exactly 1 of 15** tests failed -- precisely the test asserting that constraint |

Mutation D's precision (exactly the one test that should catch it, no more, no less) is itself informative: it shows the test suite's failure signals are targeted, not accidentally broad. Two mutations from the mission's suggested list were not separately exercised: "refund authority on uncertainty" is a property of the frozen P1 proof store (already mutation-tested in Mission 4, out of this execution layer's own surface) and "skip logical effect identity" / "permit duplicate execution receipt" collapse to the same mechanism already proven by mutation D (the business-key uniqueness constraint) and the append-only evidence triggers respectively.

## Founder burden

From the 1,000-scenario property run (`CANARY_MEASURED`, synthetic scenarios, not real operational traffic -- see [`V9_REAL_OPERATIONAL_SAMPLE_PLAN.md`](./V9_REAL_OPERATIONAL_SAMPLE_PLAN.md)):

| | Count |
|---|---:|
| Total scenarios | 1,000 |
| Scenarios requiring any recovery/reconciliation | 787 |
| Scenarios requiring owner review | 91 |
| **`owner_reviews_per_100_uncertain_effects`** | **11.56** |

This ratio is dominated by the two simulation modes that are *designed* to be irreducibly ambiguous (`AMBIGUOUS_RECONCILIATION`, `CONTRADICTORY_RECONCILIATION` -- 2 of 9 modes) diluted by the much larger set of cleanly-resolvable scenarios (proven non-submission, clean acceptance/rejection, delayed-but-eventually-resolvable reconciliation). The system automatically resolves confirmed success, confirmed failure, safe pre-dispatch abort, and provider-reconcilable uncertainty without any human involvement; only irreducibly ambiguous or contradictory provider evidence reaches a human.

## Performance

200 samples per measurement, real PostgreSQL 16 ([`scripts/measure-external-effect-performance.mjs`](../../scripts/measure-external-effect-performance.mjs)):

| Measurement | P50 | P95 | P99 |
|---|---:|---:|---:|
| Pre-dispatch persistence overhead (`prepare()` + durable `DISPATCHING`) | 2.31ms | 3.27ms | 3.92ms |
| Full safe dispatch (prepare -> DISPATCHING -> dispatch -> classify -> bind) | 5.07ms | 6.37ms | 7.36ms |
| Recovery lookup (one `recoverOneExecution()` pass) | 4.34ms | 5.48ms | 7.99ms |
| Reconciliation only (`adapter.reconcile()`) | 0.32ms | 0.43ms | 0.47ms |

Storage per consequence (one execution + its evidence + its transition ledger, measured via `pg_column_size`): **2,928 bytes** (execution row 352B, evidence rows 392B, transition ledger 2,184B -- the ledger dominates because every transition is a separate, hash-chained, tamper-evident row; this is the same tradeoff the frozen P9 authority-transition-ledger already makes). Full detail: [`artifacts/omnia-v9/external-effect-recovery-report.json`](../../artifacts/omnia-v9/external-effect-recovery-report.json).

## Regression

- V9 closure gate: unaffected -- frozen core untouched (verified by hash).
- Full deterministic regression: see the final mission report for the exact count, run with `--test-concurrency=1` (this mission's new real-Postgres-gated test files share the established convention from Mission 5: multiple files migrating/using one shared database concurrently race on shared DDL/state unless serialized).
- `lite/`: untouched.
- Browser tests: pre-existing `FAILED_ENVIRONMENT` (Playwright browser-revision mismatch), unrelated, consistent with every prior mission.

## What this report does not claim

It does not claim exactly-once delivery (see [`V9_EXTERNAL_EFFECT_PROTOCOL.md`](./V9_EXTERNAL_EFFECT_PROTOCOL.md)'s vocabulary section). It does not claim Gmail-specific readiness -- no Gmail adapter was built or tested; only the provider-neutral contract and a simulator. It does not claim `REAL_OPERATIONAL` data was used -- every scenario here is synthetic, honestly labeled `CANARY_MEASURED`.
