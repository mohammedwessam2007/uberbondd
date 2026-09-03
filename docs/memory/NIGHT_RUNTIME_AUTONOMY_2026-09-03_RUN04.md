# Night Runtime Autonomy — Run 04

Date: 2026-09-03
Lane: `work/night-runtime-20260903`
Base main observed: `acc7d132b5752b131af2eb6d44052bfb8e92f0da`
Source head before this receipt: `2109036fb59463f28031159e3e625d8506323670`
PR: #335 (draft)

## Refreshed integration truth

- `main` remains `acc7d132b5752b131af2eb6d44052bfb8e92f0da`.
- PR #329 remains a separate Sol-owned convergence/Open Model Universe/Frontier Operator lane at `7ea2abd7246166a346203b79670748630c55b808` when inspected.
- Peer night integration/frontier/verification/payment lanes remain separate; no peer-owned source was modified.
- Canonical `artifacts/system-readiness.json` is stale relative to live main: it was generated from historical head `3e57b057754d7e2f9fcb36b2bd0eb8a115ef3d84`. Its last measured reachability remains 275 source modules / 136 production-reachable / 20 operator-only / 119 no-entry-point / all classified. Do not treat that artifact as exact-head regeneration evidence.

## Runtime delta

Closed another crash-recovery duplicate-effect seam in `src/queue.mjs` without deleting capability or widening authority.

1. Enqueued jobs now persist an explicit `recoveryPolicy`:
   - `legacy`: compatibility behavior for existing callers.
   - `replay-safe`: caller asserts automatic stale replay is safe.
   - `reconcile`: stale execution outcome may be non-idempotent and must not be replayed automatically.
   Convenience booleans map `nonIdempotent: true` to `reconcile` and `idempotent: true` to `replay-safe`; invalid policies fail closed.
2. Before normal stale recovery/claim, `DurableQueue.quarantineUncertainStaleJobs()` detects stale active `reconcile` jobs, re-checks current ownership/staleness, moves them to dead-letter, clears the lease, and persists:
   - `uncertainExecution: true`
   - `uncertainReasonCode: JOB_STALE_NON_IDEMPOTENT_UNCERTAIN`
   - `reconciliationRequired: true`
   - empty reconciliation receipt fields
3. Manual replay remains blocked by the existing reconciliation gate until an explicit non-empty receipt is provided.
4. Explicit `replay-safe` stale jobs continue through the existing automatic recovery path, preserving unattended recovery breadth where replay is actually safe.
5. Added hostile tests covering both branches of the recovery law.

## Verification actually executed

Focused local Node 22 reconstruction of the committed recovery-policy logic:

- `node --check`: PASS
- hostile tests: 3 total / 3 pass / 0 fail / 0 cancelled
  - stale `reconcile` job -> quarantine + reconciliation required + replay blocked
  - stale `replay-safe` job -> not quarantined
  - invalid recovery policy -> enqueue fails closed

This was a focused reconstruction using the exact newly added policy/quarantine logic with a minimal store stub. It is not whole-repository or real-PostgreSQL proof.

Hosted exact-source-head evidence for `2109036fb59463f28031159e3e625d8506323670`:

- CI run `33713809644`
  - deterministic job `100518668434`: failure, `steps=null`, `logs_url=null`
  - postgres job `100518668569`: failure, `steps=null`, `logs_url=null`
  - browser job `100518668621`: failure, `steps=null`, `logs_url=null`
- Therefore repository commands actually executed by hosted CI: **0**.
- Classification: `INFRASTRUCTURE_NON_EVIDENCE`, neither source failure nor green proof.

## Reachability delta

0 intentional wiring changes this run. The historical 119 no-entry-point modules remain an all-classified historical measurement; no economically justified orphan was found in this queue-focused pass, and no module was wired merely to reduce the count.

## Crash/recovery evidence

New invariant: a stale job explicitly marked `reconcile` does not enter the ordinary stale replay path and cannot be replacement-claimed until reconciliation has occurred. Replay-safe jobs retain automatic recovery.

Residual software risk: the quarantine scan is implemented through generic Store list/get/patch operations before the Store's transactional stale-recovery primitive. This closes the ordinary DurableQueue path but is not yet a single atomic Store-level claim/recovery law. A competing caller that invokes Store recovery directly could theoretically race the queue-level quarantine. The next runtime change should move recovery-policy enforcement into both JsonStore and PostgresStore `recoverStaleJobs()` atomically and then hostile-test concurrent recovery workers against real PostgreSQL.

## Model/provider readiness

No model/provider invocation occurred. No paid model was called. No credentials were read, created, printed or changed. Spend attribution delta: $0. PR #329's Open Model Universe/Frontier work remains read-only from this lane. Canonical readiness still describes provider integration as externally gated by provider credentials/pricing/canary budget; this run did not weaken or bypass that gate.

## External/time gates

- GitHub Actions runner startup currently produces zero-step jobs.
- Vercel free deployment rate limit remains observed on active PRs; it is not a source-code failure.
- Real PostgreSQL exact-head execution of the new recovery law remains unobserved.
- Founder-absence duration proof requires real elapsed terminal cycles; no elapsed-time evidence was invented.
- Live model canaries remain authorization/credential/cost gated.
- Human escalation transport remains an abstraction until a real channel is configured.

## Zero-effect ledger

- customers contacted: 0
- outbound messages: 0
- live provider/model calls: 0
- model/provider spend: $0
- purchases: 0
- payment mutations: 0
- money movement: $0
- production deployments initiated by this lane: 0
- production business mutations: 0
- credentials exposed: 0

## Next highest-value runtime blocker

Move `recoveryPolicy` enforcement into the Store's stale-recovery transaction so JSON and PostgreSQL atomically classify stale work before any replacement claim. Then run hostile concurrent recovery/claim tests against real PostgreSQL proving that a non-idempotent stale execution can never slip from `active` through `queued` to a replacement worker without reconciliation, while `replay-safe` work still recovers automatically.
