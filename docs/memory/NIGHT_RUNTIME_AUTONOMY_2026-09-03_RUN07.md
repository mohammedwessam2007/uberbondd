# Night Runtime Autonomy — 2026-09-03 Run 07

## Scope
Dedicated runtime-autonomy lane only. Refreshed `main`, PR #329, integration successor PR #331, peer frontier PR #334, and runtime PR #335 before mutation. No peer-owned Frontier/Open Model files were changed.

## Source truth before mutation
- `main`: `acc7d132b5752b131af2eb6d44052bfb8e92f0da`
- PR #329 head: `7ea2abd7246166a346203b79670748630c55b808`
- PR #331 head: `40e25ff90db6b2e0bcf1d780dfefae9e9fe02ff1`
- PR #334 head: `bbb918918772b38aaa4bd5a49bc97e4efd67818f`
- runtime PR #335 pre-run head: `153203e43bbadbd73f00c084ca4e2ec493300d29`

## Defect falsified
`DurableQueue.quarantineUncertainStaleJobs()` previously performed `list -> get -> patch`. A reconcile job could be observed stale, then refresh its heartbeat before the patch, yet still be dead-lettered by the stale snapshot. That is an unattended liveness defect and a lease-state TOCTOU race.

## Runtime delta
Quarantine now only discovers stale reconcile candidates. The actual stale transition is delegated to the Store's recovery transaction. Reconcile jobs already persist `maxAttempts=1`, therefore a truly stale first claim is atomically dead-lettered by Store recovery. The queue then annotates only jobs that are already `dead-letter` and still carry `recoveryPolicy=reconcile`. A heartbeat refreshed before Store recovery therefore keeps the job active and cannot be overwritten by the queue annotation path.

Added `tests/night-runtime-quarantine-heartbeat-race.test.mjs`, which injects a heartbeat refresh after candidate discovery but before Store recovery and asserts that the healthy worker remains owner and no replacement claim succeeds.

## Verification truth
Exact source head after source/test mutations: `7bec5fe08e332b272f13c853236d9e2ef2b220f4`.

Hosted CI run `33726211275` created `deterministic`, `browser`, and `postgres` jobs. All three completed with `steps=null` and `logs_url=null`. Repository commands executed by that run: 0. Classification: `INFRASTRUCTURE_NON_EVIDENCE`, not a software failure and not green proof.

No full local repository checkout or PostgreSQL service was available in this runtime, so no unearned test pass is claimed for the new exact head.

## Reachability
No reachability mutation this run. Historical canonical counts remain stale pending settled integration truth; no module was deleted or wired merely to improve the number.

## Model/provider state
No model/provider invocation. No paid model call. No credential read/write. Open Model Universe and Frontier Operator remain peer-owned in PR #329/#331 and were inspected read-only.

## Zero-effect ledger
- customers contacted: 0
- outbound messages: 0
- live provider/model calls: 0
- model spend: $0
- purchases: 0
- payment mutations: 0
- money movement: $0
- production deployments initiated: 0
- production business mutations: 0
- credentials exposed: 0

## Exact blockers / next attack
1. Execute the heartbeat-race regression and existing real-PostgreSQL stale-recovery suite on a runner that actually executes steps.
2. If PostgreSQL proves the same stale/heartbeat boundary, move recovery-policy semantics into Store recovery itself so direct callers also emit reconciliation metadata atomically rather than relying on the persisted `maxAttempts=1` fuse plus queue annotation.
3. After crash/liveness proof is trustworthy, attack founder-absence ledger crash/restart continuity before expanding model-runtime bindings.

Commercial truth remains external and unchanged.