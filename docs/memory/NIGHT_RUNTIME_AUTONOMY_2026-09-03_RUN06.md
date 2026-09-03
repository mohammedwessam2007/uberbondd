# Night Runtime Autonomy — Run 06

## Refreshed truth

- live main: `acc7d132b5752b131af2eb6d44052bfb8e92f0da`
- runtime lane before this run: `89c95de394343627088bbc3c342dd032ca3dab4b`
- PR #329 Open Model Universe / Frontier Operator head: `7ea2abd7246166a346203b79670748630c55b808`
- peer frontier PR #334 head at refresh: `8a8f0c70908cafa7e3796ca5f70c16e86fc01173`
- peer integration PR #331 head at refresh: `3c11b699757bf647b7ed6689b434d1b735eff3ae`

Peer ownership was inspected before writing. This run adds only a runtime-lane hostile PostgreSQL recovery test and this receipt.

## Correction to prior handoff

`src/store.mjs` has not yet been changed on this runtime branch. Store-level stale recovery is not recovery-policy-aware. Current reconcile crash safety comes from `DurableQueue.enqueue()` persisting `maxAttempts=1` for `recoveryPolicy: reconcile`; Store stale recovery therefore dead-letters after the first claim instead of automatically requeueing. This is useful, but it must be proven under real PostgreSQL row-lock/heartbeat races before deeper Store surgery is justified.

## Runtime delta

Added `tests/night-runtime-postgres-recovery-race.test.mjs`, discovered automatically by `npm run test:postgres-real` because it contains the `OMNIA_V9_TEST_DATABASE_URL` marker.

The suite attacks three invariants against two real Postgres connections:

1. **heartbeat vs stale-recovery lock race** — one transaction holds the job row lock, a second connection starts stale recovery on the stale row, the owner refreshes heartbeat before releasing the lock, and recovery must re-check the now-live row rather than reclaim it;
2. **reconcile crash fuse** — a stale `recoveryPolicy: reconcile` job with persisted `maxAttempts=1` must dead-letter and remain unclaimable by a replacement worker;
3. **replay-safe crash recovery** — a stale replay-safe job retains recovery, while two replacement workers racing through `FOR UPDATE SKIP LOCKED` must produce exactly one claimant.

## Tests actually run

- `node --check` on the exact authored hostile test file: PASS.
- Real PostgreSQL assertions: NOT RUN in this execution environment because no `OMNIA_V9_TEST_DATABASE_URL` was available locally.
- Exact source commit `bc30a23b25975e7b032d50fc5f477be154c28982` triggered GitHub CI run `33721220599`. `browser`, `postgres`, and `deterministic` all returned `steps=null` and `logs_url=null`; repository commands executed = 0. This is `INFRASTRUCTURE_NON_EVIDENCE`, not a source failure and not green proof.

## Reachability

No reachability wiring changed. Last canonical measurement remains 275 src modules, 136 production-reachable, 20 operator-only, leaving 119 historical no-entry-point modules. No module was wired merely to reduce that number.

## Model/provider readiness

No provider/model call was made. PR #329 remains the separate Open Model Universe / Frontier Operator convergence lane. No credentials were created, inspected, copied, logged, or exposed. Paid-model spend remains $0.

## Crash/recovery evidence

Existing source now has a precise executable falsification target for the remaining PostgreSQL race. Passing syntax proves only that the test parses. The actual heartbeat/recovery/replacement-worker claims remain unproven until a real PostgreSQL runner executes the suite.

## External / time gates

- GitHub-hosted runner startup is still returning zero-step jobs.
- Real PostgreSQL concurrency execution is still required for the new hostile race suite.
- Vercel build capacity, genuine provider credentials/account access, authorized cost-bounded canaries, and elapsed-time founder-absence soak remain external/time evidence gates.

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

## Next highest-value blocker

Execute the new PostgreSQL race suite on a functioning real-Postgres runner. If the heartbeat-vs-recovery case fails, fix Store stale recovery atomically before any further runtime expansion. If it passes, the next internal target is a stronger reconciliation receipt contract and crash/restart founder-absence ledger continuity, not decorative architecture.