# Night Runtime Autonomy — 2026-09-03 Run 09

## Refreshed truth

- Current `main` at refresh: `33303ffdd88c021de838be25da4dcd3d910cbae4`.
- Main now contains the merged convergence stack: Frontier Operator, Open Model Universe, provider-neutral model execution, mutation-binding guards, and first-cash convergence.
- Runtime branch was 61 commits behind and 22 commits ahead before refresh.
- Mechanical refresh PR #337 merged current main into `work/night-runtime-20260903` with merge commit `3c621fd395b7f26ef236b9441ab0ee99a1445d2b`.
- Runtime work remains isolated from Night Frontier / Night Verification source ownership.

## Concrete runtime delta

Closed a crash/restart accounting seam in the durable autonomy mission ledger.

Before this run, `tickAutonomyRun` wrote an `agent_autonomy_execution_receipt` and only afterwards saved the resulting run snapshot. If the process died after the receipt write but before the snapshot, restart loaded the old `AWAITING_RESULT` snapshot, consumed the same already-completed worker result again, and appended a second execution receipt. External relay dispatch was already idempotent, but the durable accounting ledger was not. Duplicate receipts could distort long-horizon liveness, execution counts, or downstream spend attribution.

Added `src/agent-autonomy-receipt-ledger.mjs`:

- deterministic audit identity binds `runId + sessionId + taskId + sequence`;
- atomic `store.add('auditLog', deterministicId)` is the write boundary;
- concurrent duplicates recover through `store.get` and return `RECEIPT_ALREADY_LOGGED`;
- same identity with different persisted truth fails closed as `autonomy-execution-receipt-conflict`;
- receipt creation time is not part of truth equality, so a restart at a later wall clock time is a harmless replay rather than a false conflict.

Updated `src/agent-autonomy-job.mjs`:

- uses the idempotent receipt ledger before snapshot persistence;
- refuses to advance the durable snapshot if receipt truth cannot be safely established;
- surfaces receipt audit id and duplicate status for runtime evidence.

Added `tests/night-runtime-autonomy-receipt-restart.test.mjs` covering concurrent duplicate insertion, restart replay, and conflicting truth.

## Tests actually executed

Focused Node reconstruction of the exact receipt-ledger decision logic:

- syntax check: PASS;
- concurrent duplicate hostile case: PASS;
- restart replay hostile case: PASS;
- conflicting truth hostile case: PASS;
- total: 3/3 tests pass, 0 failed, 0 cancelled.

This is focused invariant evidence, not whole-repository or PostgreSQL proof.

Exact hosted head before this receipt: `5c42538bd1f91a150d70ebf49ea6805665d02708`.
GitHub CI run `33736994728` produced `postgres`, `browser`, and `deterministic` jobs with `steps=null` and `logs_url=null`. Repository commands executed there: 0. Classification: `INFRASTRUCTURE_NON_EVIDENCE`.

## Reachability delta

0. No source module was wired or deleted merely to reduce the historical no-entry-point count. The runtime priority remained crash/restart correctness.

## Crash/recovery evidence

The autonomy path now has two independent restart protections at different layers:

1. relay task dispatch is idempotent on deterministic task identity, preventing duplicate delegated work after dispatch-before-snapshot death;
2. execution receipt persistence is idempotent on deterministic run/session/task/sequence identity, preventing duplicate durable accounting after receipt-before-snapshot death.

The run snapshot remains the progression authority; if its write fails, the next scheduler tick can safely replay the already-persisted execution receipt and then retry snapshot persistence.

## Model/provider readiness

No live model/provider call was made. No credential was read, created, logged, or exposed. Model spend: USD 0. The merged main now contains the convergence runtime, but live provider identity, pricing, credential, and authorized canary evidence remain external/account-gated where not already proven.

## Unresolved gates

Internal/high-value next blocker:

- prove the full `tickAutonomyRun` receipt-before-snapshot crash sequence against the real Store/PostgreSQL implementation, including a forced snapshot failure followed by process-style restart, and verify one execution receipt + one eventual newer snapshot.

External/time gates:

- GitHub hosted runner startup currently executes zero repository steps;
- real PostgreSQL test execution is therefore still unearned in hosted CI;
- genuine elapsed-time founder-absence soak remains elapsed-time evidence, not code-generated proof;
- provider/account credentials and cost-bounded live canaries remain external authorization/account gates;
- human escalation transport remains external until a real channel exists.

## Zero-effect ledger

- customers contacted: 0
- outbound messages: 0
- live provider/model calls: 0
- model spend: USD 0
- purchases: 0
- payment mutations: 0
- money movement: USD 0
- production deployments initiated: 0
- production business mutations: 0
- credentials exposed: 0
