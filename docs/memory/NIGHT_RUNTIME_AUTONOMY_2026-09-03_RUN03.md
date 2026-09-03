# Night Runtime Autonomy — 2026-09-03 Run 03

## Refreshed truth
- main: `acc7d132b5752b131af2eb6d44052bfb8e92f0da`
- runtime lane before this run: `6f8ee013bab7d505452bbefe9d941c0f05eb0740`
- PR #329 remains draft at `7ea2abd7246166a346203b79670748630c55b808` and was inspected read-only.
- Peer night lanes were inspected read-only. This run changed only runtime-owned queue/test/receipt files.
- Canonical reachability remains 275 source modules / 136 production-reachable / 20 operator-only / 119 no entry point, all classified by the existing artifact. No reachability count was changed in this run.

## Runtime delta
1. A job heartbeat that proves the current worker no longer owns the active lease now aborts the cooperative handler immediately with `JOB_LEASE_LOST` and records `queue_job_lease_lost_during_execution`.
2. Lease loss is marked uncertain execution but does not let the stale worker mutate the replacement owner's job. Existing lease-fenced terminal writes remain authoritative.
3. Runtime-timeout dead letters now persist `uncertainExecution`, `uncertainReasonCode`, and `reconciliationRequired` metadata.
4. `requeueDeadLetter()` refuses uncertain-execution replay unless an explicit non-empty reconciliation receipt is supplied. Successful reconciliation is persisted and audited before requeue.

## Hostile tests added
`tests/night-runtime-lease-reconciliation.test.mjs` adds:
- heartbeat ownership loss aborts a still-running cooperative handler before stale completion;
- uncertain timeout dead letter cannot be manually replayed without an explicit reconciliation receipt, and a supplied receipt is durably recorded.

## Execution evidence
Exact-head hosted CI run `33710070156` created deterministic/postgres/browser jobs, but all three completed with `steps=null` and `logs_url=null`. Therefore zero repository tests executed in GitHub Actions and the run is infrastructure non-evidence. The new tests are committed but are NOT claimed passing in this receipt.

Previous run evidence remains separate: a focused local Node 22 harness on the prior runtime head executed two queue scenarios and passed 2/2 after first falsifying the initial watchdog-unref patch. This run does not upgrade that prior evidence to cover the new changes.

## Reachability delta
Zero. The historical canonical artifact still reports 119 no-entry-point modules and marks the set fully classified. This run found no verified economically relevant runtime orphan requiring wiring, so it did not create decorative reachability.

## Model/provider readiness
No provider or model was invoked. PR #329 owns the current Open Model Universe / Frontier Operator convergence work and remains unmodified by this lane. No credentials were invented or exposed. Model spend: $0.

## Crash/recovery evidence
The runtime now has a stronger stale-worker law: loss of lease is not only fenced at completion/failure writes; cooperative work is signaled to stop as soon as ownership loss is observed. Uncertain timeout replay is also reconciliation-gated rather than manually replayable by default.

This still cannot provide mathematical exactly-once guarantees for external systems that ignore abort signals and lack idempotency/reconciliation support. Those calls must remain adapter-governed and uncertainty-safe.

## External / time gates
- GitHub Actions runner startup remains zero-step infrastructure non-evidence.
- Vercel deployment checks remain externally quota/rate limited until an actual deployment slot exists.
- Real PostgreSQL execution of the new tests is still required.
- Real elapsed-time founder-absence/soak proof is still required and must not be invented.
- Live model/provider canaries require separately authorized, cost-bounded provider access.
- Human escalation transport requires an actual configured channel; no channel was invented.

## Zero-effect ledger
- customers contacted: 0
- outbound messages: 0
- live provider/model calls: 0
- model/provider spend: $0
- purchases/subscription changes: 0
- payment mutations: 0
- money movement: $0
- production deployments: 0
- production business mutations: 0
- credentials exposed: 0

## Next highest-value runtime blocker
Exercise heartbeat-loss + stale recovery + replacement-worker claim against the real PostgreSQL Store, then classify stale active jobs by replay safety so a crashed non-idempotent job cannot be silently converted back to queued work without reconciliation. The safety target is: replay-safe/idempotent jobs may recover automatically; uncertain external-effect jobs must dead-letter/reconcile rather than duplicate.
