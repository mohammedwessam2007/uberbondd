# Night Runtime Autonomy — 2026-09-03 Run 08

## Refreshed truth

- live main: `acc7d132b5752b131af2eb6d44052bfb8e92f0da`
- convergence PR #329: `7ea2abd7246166a346203b79670748630c55b808`
- integration successor PR #331: `b0df90e9fa125400361a3959ce7d77be3d45afed`
- verification PR #333: `b86737280a83e0235550c6207972c6876363df31`
- frontier PR #334: `5ac77f3840a34d28f63d6fc3b05c75b3a2ec79f3`
- runtime PR #335 source before this run: `ad65999ea127d8ed5141513d0bf130e35c214aea`

Peer ownership was inspected before writes. `src/store.mjs` is not currently changed by #331 or #334, but this run stayed inside the already-owned runtime queue surface rather than expanding ownership.

## Runtime delta

Added a defense-in-depth execution fence for `recoveryPolicy: reconcile` jobs. If any stale-recovery path or future Store caller ever makes a reconcile job claimable a second time, `DurableQueue.runJob()` now refuses to enter the handler when `attempts > 1`. The job is fail-closed to dead-letter, marked uncertain, and requires reconciliation.

This closes the last handler-entry duplicate-effect seam even if Store recovery semantics are accidentally loosened or bypassed. Replay-safe jobs remain executable on later attempts.

Added `tests/night-runtime-reconcile-replay-fence.test.mjs` to prove the handler is never called on a second reconcile attempt and that durable uncertainty metadata is written.

## Evidence actually executed

A focused Node hostile harness reproducing the exact new guard branch executed locally and passed 7 assertions:

- reconcile attempt 2: handler calls = 0
- state becomes dead-letter
- reconciliationRequired = true
- uncertainReasonCode = JOB_RECONCILE_REPLAY_BLOCKED
- audit event is emitted
- replay-safe attempt 2 remains executable

This is focused branch evidence, not a whole-repository or PostgreSQL claim.

Hosted GitHub Actions on the prior exact head continued to fail before repository steps. CI/Night Verification/Postal runs all concluded failure without trustworthy step execution. Treat as infrastructure non-evidence.

## Reachability

No reachability wiring changed. Historical canonical measurement remains 275 modules / 136 production-reachable / 20 operator-only / 119 no-entry-point until the integration lane regenerates readiness from settled source truth.

## Model/provider readiness

No provider or model was invoked. No paid model spend. Open Model Universe / Frontier Operator remain peer-owned in #329/#331/#334. Current software integration is substantially present there, but genuine credentials, account access, price evidence and authorized cost-bounded canaries remain external gates.

## Exact unresolved gates

1. Real PostgreSQL execution of `tests/night-runtime-postgres-recovery-race.test.mjs` and heartbeat-race regression.
2. GitHub hosted runner startup that executes repository steps.
3. Store-native recovery-policy semantics remain desirable defense in depth, but handler-entry duplication is now fenced even if Store requeues a reconcile job.
4. Genuine elapsed-time founder-absence soak cannot be invented.
5. External provider credentials/account readiness and cost-bounded canaries remain real external gates.
6. Human escalation transport still needs an actual external channel; software must not invent one.

## Zero-effect ledger

- customer contacts: 0
- outbound messages: 0
- live model/provider calls: 0
- model spend: $0
- purchases: 0
- payment mutations: 0
- money movement: $0
- production deployments initiated: 0
- production business mutations: 0
- credentials exposed: 0

## Next highest-value runtime blocker

Earn real PostgreSQL concurrency evidence. Run heartbeat refresh vs stale recovery vs replacement claim under independent connections. If that passes, attack crash/restart continuity of the durable founder-absence mission ledger and checkpoint/resume semantics before expanding architecture.
