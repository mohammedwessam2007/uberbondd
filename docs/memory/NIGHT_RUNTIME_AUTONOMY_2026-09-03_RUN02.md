# Night Runtime Autonomy Receipt — 2026-09-03 Run 02

## Scope

Dedicated lane: `work/night-runtime-20260903`.

Base refreshed from `main` at `acc7d132b5752b131af2eb6d44052bfb8e92f0da` before source changes. Peer night/Claude/Sol branches were read-only. PR #329 remained a separate draft integration lane and was inspected only as donor/readiness evidence.

## Runtime delta

`src/queue.mjs` now closes three unattended-operation races:

1. **Lease-fenced terminal writes.** Queue completion and failure use `completeJobIfOwned` / `failJobIfOwned` so a stale worker cannot overwrite the state of a job whose lease was reclaimed by another worker.
2. **Fail-closed uncertain timeouts.** Runtime timeout is classified `JOB_RUNTIME_TIMEOUT_UNCERTAIN`, marked non-retryable, and dead-lettered rather than automatically replaying a possibly completed non-idempotent action.
3. **Referenced runtime watchdog.** The active-job timeout timer is intentionally kept referenced. A handler stalled on a handle-less unresolved Promise can no longer let the Node process exit merely because the watchdog was `unref()`'d.

Handlers receive a backward-compatible third runtime context containing an `AbortSignal`, `workerId`, and a lease-ownership probe. Existing two-argument handlers continue to work.

## Hostile evidence actually executed

A local Node 22 hostile harness exercised the exact patched `DurableQueue` logic against an in-memory store implementing the same ownership contract. No provider, credential, network request, payment, outbound message, or model call was used.

Initial hostile run result:

- 2 tests cancelled because the event loop became empty before the runtime timeout fired.
- This falsified the first patch and exposed the referenced-watchdog defect.

After removing `runtimeTimer.unref()`:

- `node --check` on the patched queue harness: PASS.
- `node --test` hostile harness: **2 tests, 2 pass, 0 fail, 0 cancelled**.
- Uncertain timeout case: abort observed, job dead-lettered on attempt 1, no retry scheduled.
- Lease takeover case: replacement worker ownership remained intact and stale result was not committed; lease-loss audit event recorded.

Repository test coverage was extended in `tests/queue.test.mjs` with equivalent timeout and lease-fencing cases. Full repository execution is not claimed in this receipt because this execution container lacks the repository's `pg` dependency and has no working DNS for package installation or repository cloning.

## Crash/recovery implication

Existing stale-job recovery already requeues or dead-letters abandoned active jobs according to attempt ceilings. The new ownership fencing prevents the original process from later committing after recovery has transferred ownership. This converts recovery from a best-effort timestamp convention into an enforced terminal-write fence at the queue layer.

Timeout outcomes remain deliberately conservative: once the queue cannot prove whether an external/non-idempotent action completed, it stops automatic replay and surfaces durable dead-letter/audit evidence for reconciliation.

## Reachability classification delta

**0 modules reclassified in this run.** The canonical current-system baseline remains 275 `src` modules: 136 production-reachable, 20 operator-only, 119 with no entry point. `config/reachability-classification.json` contains no `UNREACHABLE_BUG` or `NEEDS_TRIAGE` entry found by this inspection; no economically justified missing path was proven strongly enough to wire in this lane without crossing peer ownership or external gates.

## Model/provider readiness observed

No live model invocation occurred.

Canonical main states that the protected Vercel AI Gateway configuration exists, but a live model canary remains unrun. PR #329 is still a separate draft integration head for Open Model Universe / Frontier Operator work. Its provider factory adds explicit `AI_GATEWAY_*` mapping and an `open-model` provider, but that work is not copied into this branch because it belongs to the Sol integration lane and hosted exact-head verification remains unresolved.

## External / elapsed-time gates

- GitHub Actions has repeatedly produced zero-step startup failures on the current integration work. A zero-step run is infrastructure non-evidence, not a code test failure.
- Vercel exact-current production verification remains externally constrained by deployment/build quota evidence recorded in canonical state.
- No provider credential or access was invented.
- No paid model was invoked.
- Sustained founder-absence soak over real elapsed time remains unproven and cannot be manufactured inside one run.
- Human escalation transport remains externally unconfigured; no channel was invented.

## Zero-effect ledger

- customer contact: 0
- outbound messages: 0
- live model/provider calls: 0
- model spend: USD 0
- purchases: 0
- payment mutations: 0
- money movement: USD 0
- production deployments: 0
- production business mutations: 0
- credentials exposed: 0

## Next highest-value runtime blocker

Run the queue's new timeout/lease-fencing tests against the repository's real Store/PostgreSQL implementation and then attack **lease renewal failure during a long-running handler**: prove that heartbeat failure plus stale recovery cannot produce duplicate side effects, and add an explicit reconciliation path for `JOB_RUNTIME_TIMEOUT_UNCERTAIN` before any manual requeue is allowed.
