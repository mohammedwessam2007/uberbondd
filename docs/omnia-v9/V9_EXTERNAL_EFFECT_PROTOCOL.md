# OMNIA V9 External-Effect Execution Protocol

Mission 6 ("external-effect exactness and crash-recovery"). This document is the core design reference; [`V9_CRASH_RECOVERY_STATE_MACHINE.md`](./V9_CRASH_RECOVERY_STATE_MACHINE.md) covers the 10 crash scenarios in detail, [`V9_EXECUTION_RECEIPT_SEMANTICS.md`](./V9_EXECUTION_RECEIPT_SEMANTICS.md) covers evidence/receipt vocabulary, and [`V9_EXECUTION_RECOVERY_REPORT.md`](./V9_EXECUTION_RECOVERY_REPORT.md) covers what was actually built and tested.

## Central rule

**Uncertainty must never become retry permission.** Every design decision below exists to serve this one rule. A stuck external action is an acceptable outcome; a duplicated one is not.

## What this mission does not claim

Per explicit instruction, this protocol never claims "exactly once" delivery. The vocabulary used throughout is:

- **effectively-once execution** -- in the overwhelming majority of cases (no crash, or a crash the protocol can prove happened before any provider contact), exactly one external effect occurs.
- **idempotent submission** -- where a stable business identity exists, a genuinely duplicate submission attempt (which this protocol structurally never makes automatically) would at least be recognizable after the fact.
- **at-most-once retry semantics** -- an automated retry only ever happens when non-submission has been *proven*, never merely assumed.
- **provider-reconciled consequence identity** -- when local certainty is lost, the system falls back to asking the provider, using a stable identity generated before dispatch.
- **uncertainty-preserving recovery** -- when neither local state nor provider reconciliation can resolve what happened, the system parks the execution for owner review rather than guessing in either direction.

Gmail specifically does **not** provide sufficiently strong idempotency to make blind retry ever safe -- see [`V9_GMAIL_IDEMPOTENCY_AND_RECONCILIATION_RESEARCH.md`](./V9_GMAIL_IDEMPOTENCY_AND_RECONCILIATION_RESEARCH.md).

## The state model

Implemented in [`src/omnia-v9/integrations/external-effect-state-machine.mjs`](../../src/omnia-v9/integrations/external-effect-state-machine.mjs), enforced identically at the database layer by a trigger in [`migrations/011_omnia_v9_external_effect_executions.sql`](../../migrations/011_omnia_v9_external_effect_executions.sql). Ten durable states (a full mapping from this mission's suggested vocabulary to the implemented one, with the reasoning for every departure, is documented in that module's header comment and repeated in [`V9_CRASH_RECOVERY_STATE_MACHINE.md`](./V9_CRASH_RECOVERY_STATE_MACHINE.md)):

```
PREPARED -> DISPATCHING -> PROVIDER_ACCEPTED   (terminal)
                        -> PROVIDER_REJECTED   (terminal)
                        -> RESULT_UNCERTAIN -> RECONCILING -> RECONCILED_ACCEPTED      (terminal)
                                                            -> RECONCILED_REJECTED      (terminal)
                                                            -> RECONCILED_NOT_SUBMITTED (terminal, frees business key)
                                                            -> OWNER_REVIEW_REQUIRED -> (any of the three RECONCILED_* above, or back to RECONCILING)
                                                            -> RESULT_UNCERTAIN (inconclusive reconciliation, try again later)
PREPARED -> ABORTED_BEFORE_DISPATCH (terminal, frees business key)
```

`isLegalTransition(from, to)` is the single source of truth; [`tests/omnia-v9-external-effect-state-machine.test.mjs`](../../tests/omnia-v9-external-effect-state-machine.test.mjs) exhaustively drives every one of the 88 possible `(from, to)` pairs (11 states + creation, times 11 states) against a real Postgres database and asserts the trigger's accept/reject decision matches the JS module's decision every single time -- illegal transitions are rejected by the database itself, not merely by application convention.

## Provider-neutral adapter contract

[`src/omnia-v9/integrations/external-effect-adapter.mjs`](../../src/omnia-v9/integrations/external-effect-adapter.mjs) defines the contract every provider implements, exactly as this mission specifies:

- **`prepare(effectIntent)`** -- computed before any network I/O; attaches/confirms the provider-independent effect identity.
- **`dispatch(preparedEffect)`** -- the only method allowed to perform a mutating network call. May throw; a thrown error is *never* interpreted as REJECTED, only as UNCERTAIN, because a thrown error proves nothing about what the provider actually did.
- **`reconcile(effectIdentity)`** -- read-only. Queries independent provider-side evidence without ever resubmitting.
- **`classifyOutcome(providerEvidence)`** -- pure function, evidence in, one of `ACCEPTED / REJECTED / UNCERTAIN / RECONCILED_ACCEPTED / RECONCILED_REJECTED / NOT_FOUND / AMBIGUOUS` out. Never trusts a bare boolean.

[`src/omnia-v9/integrations/null-sink-v2.mjs`](../../src/omnia-v9/integrations/null-sink-v2.mjs) is the only implementation built in this mission. A future Gmail adapter would be a second implementation of the same four methods; the dispatcher and recovery worker below are written against the contract, never against a specific provider.

## Durable execution intent (before any provider call is possible)

[`src/omnia-v9/integrations/external-effect-execution-store.mjs`](../../src/omnia-v9/integrations/external-effect-execution-store.mjs)'s `prepare()` persists, in one row, before any provider call: `executionId`, `actionIntentDigest`, `authorizationDigest`, `tenantId`, `operation`, `resource`, `businessKey`, `provider`, `providerEffectIdentity`, `attemptNumber`, `status` (always `PREPARED` at creation), `constitutionDigest`, `policyDigest`, `approvalId`, `consequenceClass`. This is not optional scaffolding -- there is no code path in [`external-effect-dispatcher.mjs`](../../src/omnia-v9/integrations/external-effect-dispatcher.mjs) that reaches a provider call without this row existing first.

## Durable DISPATCHING marker (committed before network I/O)

Immediately before `adapter.dispatch()` is ever called, the execution is durably transitioned `PREPARED -> DISPATCHING` via a transactional `UPDATE ... WHERE status='PREPARED'`. This is the single most load-bearing line in the whole protocol: **after this commits, a crash can never make the action look freely retryable again.** [`tests/omnia-v9-external-effect-crash-recovery.test.mjs`](../../tests/omnia-v9-external-effect-crash-recovery.test.mjs) proves this by mutation: removing this transition (see [`V9_EXECUTION_RECOVERY_REPORT.md`](./V9_EXECUTION_RECOVERY_REPORT.md)'s mutation-A) breaks 12 of 15 crash-recovery tests, including the checkpoint-C kill-shot.

## No blind retry (structural, not a policy)

`dispatchExternalEffect()` has no retry loop anywhere in its body. An `UNCERTAIN` classification (whether from a thrown `dispatch()` or an ambiguous reconciliation) always durably parks the execution (`RESULT_UNCERTAIN`, `OWNER_REVIEW_REQUIRED`, or loops back to `RESULT_UNCERTAIN` for a later reconciliation attempt) -- it never re-enters `DISPATCHING`. [`external-effect-recovery.mjs`](../../src/omnia-v9/integrations/external-effect-recovery.mjs)'s recovery worker is the only code that acts on an unresolved execution, and it calls `adapter.reconcile()` (read-only, by contract), **never** `adapter.dispatch()`.

## Provider business identity

`providerEffectIdentity` and `businessKey` are generated by the caller before `prepare()` is ever invoked (see the docstring in [`external-effect-dispatcher.mjs`](../../src/omnia-v9/integrations/external-effect-dispatcher.mjs)): unique per logical consequence, durable, cannot contain secrets. For a future Gmail adapter, the concrete candidate is a caller-set `Message-ID:` header, reconcilable via the real, documented `rfc822msgid:` search operator -- see [`V9_GMAIL_IDEMPOTENCY_AND_RECONCILIATION_RESEARCH.md`](./V9_GMAIL_IDEMPOTENCY_AND_RECONCILIATION_RESEARCH.md) for exactly what is and is not verified about that mechanism.

## Safe retry policy, made a database constraint, not a convention

migration 011's partial unique index:

```sql
CREATE UNIQUE INDEX uq_omnia_v9_external_effect_executions_active_business_key
  ON omnia_v9_external_effect_executions(business_key)
  WHERE status NOT IN ('ABORTED_BEFORE_DISPATCH', 'RECONCILED_NOT_SUBMITTED');
```

At most one *active* execution may ever exist per business key. The only two terminal states that release that constraint are exactly the two states that mean "proven, not merely assumed, that no external consequence occurred": `ABORTED_BEFORE_DISPATCH` (crash before `DISPATCHING` ever became durable -- no network call was structurally possible) and `RECONCILED_NOT_SUBMITTED` (the provider's own record affirmatively has no trace of this request). Every other outcome -- including every flavor of `RESULT_UNCERTAIN` -- keeps the business key permanently occupied. [`tests/omnia-v9-external-effect-crash-recovery.test.mjs`](../../tests/omnia-v9-external-effect-crash-recovery.test.mjs) proves the database, not just the application, refuses a second active row (mutation-D in the recovery report removes this index and exactly one test -- the one testing it -- fails).

## Authority/execution coupling

Authority reservation ([`src/omnia-v9/proof-store.mjs`](../../src/omnia-v9/proof-store.mjs)'s frozen `reserveAuthority()`) happens once, before this execution layer is ever invoked, exactly as in the zero-consequence canary's existing reservation-then-execute pattern. This execution layer never re-reserves and never refunds: an execution sitting in `RESULT_UNCERTAIN` keeps its authority consumed, on the conservative assumption that the effect may have already happened. Revocation of the approval after dispatch begins does not touch the execution's recorded `approvalId`/`actionIntentDigest` -- see the revocation-after-dispatch test in [`tests/omnia-v9-external-effect-concurrency.test.mjs`](../../tests/omnia-v9-external-effect-concurrency.test.mjs) and [`V9_EXECUTION_RECOVERY_REPORT.md`](./V9_EXECUTION_RECOVERY_REPORT.md).

## Kill switch

`OMNIA_V9_EXTERNAL_EFFECT_KILL_SWITCH=engaged` is a dedicated stop for this execution layer, independent of the general `OMNIA_V9_MODE` switch, so it can be flipped in an emergency without touching the broader shadow/compare/canary configuration. Engaging it makes `dispatchExternalEffect()` throw *before* `store.prepare()` ever runs -- no orphaned durable object is created for a blocked new effect. It deliberately does not gate `external-effect-recovery.mjs`: read-only reconciliation of an already-uncertain execution keeps working under the kill switch, per this mission's explicit requirement.

## Append-only execution history (composition, not duplication)

migration 011 clones the exact pattern of the frozen P9 `authority-transition-ledger` (hash-chained, trigger-captured, no-update/no-delete triggers) into a new, separate, non-frozen table (`omnia_v9_execution_transition_events`, keyed by `execution_id` instead of `idempotency_key`). No frozen file was modified; the pattern was reused, not rebuilt.
