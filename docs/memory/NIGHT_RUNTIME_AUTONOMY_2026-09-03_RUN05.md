# Night Runtime Autonomy — Run 05

## Scope

Dedicated branch: `work/night-runtime-20260903`.
Base main observed at start: `acc7d132b5752b131af2eb6d44052bfb8e92f0da`.
PR #329 observed separately at `7ea2abd7246166a346203b79670748630c55b808`; no peer-lane files were modified.

## Runtime delta

Closed a remaining stale-recovery duplicate-effect path without changing Store-owned files.

`DurableQueue.enqueue()` now persists `maxAttempts=1` for `recoveryPolicy: 'reconcile'`. The existing JsonStore/PostgresStore stale recovery transactions already dead-letter when `attempts >= maxAttempts`, so after the first execution claim a crashed reconcile job cannot be auto-requeued even when `store.recoverStaleJobs()` is invoked directly or independently of the queue wrapper. `replay-safe` and legacy jobs retain their configured retry budget.

`requeueDeadLetter()` now requires a non-empty reconciliation receipt whenever the persisted recovery policy is `reconcile`, not only when `reconciliationRequired` metadata was previously written. This fail-closes manual replay if a direct Store stale recovery dead-lettered the job before the queue wrapper could attach uncertainty metadata.

## Hostile tests added

`tests/night-runtime-reconcile-persistence.test.mjs` covers:

1. reconcile job requested with 9 attempts persists one-attempt crash fuse and direct Store stale recovery dead-letters rather than requeues;
2. reconcile dead letter cannot be manually replayed without a durable reconciliation receipt, then can be requeued with a receipt;
3. replay-safe job preserves configured retry budget and direct Store stale recovery requeues it.

## Tests actually executed

A focused Node hostile harness executed the exact persisted max-attempt/stale-recovery/replay-guard invariants and passed 6 assertions:

- reconcile requested maxAttempts=9 -> persisted 1;
- stale reconcile at attempts=1 -> recovered=0;
- stale reconcile -> deadLettered=1;
- stale reconcile -> status dead-letter;
- reconcile dead letter -> receipt required;
- replay-safe maxAttempts=3 at attempts=1 -> recovered=1/status queued and no forced receipt.

This is focused logic evidence, not full repository or real PostgreSQL execution evidence.

## Reachability

No reachability wiring changed in this run. Historical canonical measurement remains 275 source modules / 136 production-reachable / 20 operator-only / 119 no-entry-point, subject to regeneration on a functioning execution runner. No module was wired merely to reduce the count.

## Model/provider readiness

No paid model/provider call was made. No credentials were read, created, logged, or exposed. PR #329 Open Model Universe / Frontier Operator work remained read-only from this lane.

## Remaining gates

- Execute the new exact-head test file against JsonStore and real PostgresStore in repository context.
- Falsify concurrent heartbeat versus stale-recovery transaction behavior against real PostgreSQL.
- GitHub Actions runner startup has repeatedly produced zero-step infrastructure non-evidence on recent heads.
- Vercel build-rate-limit remains an external deployment verification gate where present.
- Founder-absence/soak proof requires real elapsed time; do not fabricate it.
- Live provider/model canaries require actual credential/account availability and explicit cost bounds.

## Zero-effect ledger

Customers contacted: 0.
Outbound messages: 0.
Live model/provider calls: 0.
Model spend: $0.
Purchases: 0.
Payment mutations: 0.
Money movement: $0.
Production deployments initiated: 0.
Production business mutations: 0.
Credentials exposed: 0.

## Next highest-value blocker

Real PostgreSQL concurrency falsification: race a live owner heartbeat against stale recovery and a replacement-worker claim. Prove row locking prevents a current heartbeat from being overwritten and prove a stale reconcile job can never become claimable without an explicit reconciliation transition.
