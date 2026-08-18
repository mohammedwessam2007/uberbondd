# Prometheus Task Universe wave

Date: 2026-08-18

## Outcome

UberBond now has a shared, bounded contract for generating work from
`blueprint × entity × trigger` without pre-creating combinatorial noise. The
contract is implemented in `src/task-universe.mjs` and reuses the existing
DurableQueue only as a future execution substrate; this wave does not create a
second task store or enqueue work automatically.

## Primitives

- `TaskBlueprint` — immutable version, purpose, inputs/outputs, eligibility,
  policy, evaluator, retry limits, owner burden, cost ceiling, expiration,
  success conditions, and kill conditions.
- `Trigger` — schedule/event/threshold/state/evidence/reply/payment/failure/
  benchmark/owner-instruction identity with a payload digest rather than raw
  payload persistence.
- `PolicyDecision` — `ALLOW_LOCAL_PREPARATION`, `REVIEW_REQUIRED`, or `DENY`,
  with reason codes, authority, evidence references, and a zero-effect ledger.
- `DependencyEdge` — typed prerequisite, block, supersede, invalidate, retry,
  compensate, or unlock edge.
- `TaskInstance` — immutable blueprint version, entity/evidence/trigger refs,
  explainable priority, idempotency key, lease, attempts, cost, result,
  policy decision, and next transition.
- `Evaluator` — deterministic required-output checks with explicit failure and
  quarantine states.
- `Receipt` — input/output digests and task references; raw payloads are not
  stored.
- `LearningEvent` — task outcome, error class, repair, and optional benchmark
  delta for future commercial memory.

## Safety boundary

Only `LOCAL_PREPARATION` is automatically allowed. External-effect policies
are denied, owner-required policies are review-gated, synthetic triggers are
blocked unless the blueprint explicitly permits test fixtures, and unknown
priority economics remain `UNKNOWN`. The queue handlers
`prometheus.task.generate` and `prometheus.task.evaluate` only return and audit
contracts; they do not enqueue, send, spend, deploy, or mutate production.

## Verification

- `tests/task-universe.test.mjs`: 13/13 PASS.
- `npm run check`: 392/392 PASS locally, including the 13 Task Universe tests.
- Real commercial state remains 0 customers, $0 verified revenue, 0 cleared
  payments, and 0 accepted deliveries.
