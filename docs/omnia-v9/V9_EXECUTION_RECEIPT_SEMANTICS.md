# OMNIA V9 Execution Receipt Semantics

Epistemic honesty in what a "receipt" claims. Per this mission's explicit instruction: an API call returning success is not "delivered," "provider accepted" is not "recipient received," and "recipient received" is not "recipient read." This system never conflates these.

## Evidence levels, distinct and never collapsed

Implemented as the `evidence_type` and `lifecycle` columns of [`omnia_v9_external_effect_provider_evidence`](../../migrations/011_omnia_v9_external_effect_executions.sql), populated by [`external-effect-evidence-store.mjs`](../../src/omnia-v9/integrations/external-effect-evidence-store.mjs):

| Level | What it actually claims | evidence_type | lifecycle values |
|---|---|---|---|
| **LOCAL_ATTEMPTED** | This process invoked `adapter.dispatch()`. Proves nothing about the outcome. | (implicit -- the durable `DISPATCHING` state itself) | n/a |
| **PROVIDER_ACCEPTED** | The provider's synchronous response, received by *this* process, said it accepted the request. | `DISPATCH_RESPONSE` | `ACCEPTED` |
| **PROVIDER_REJECTED** | The provider's synchronous response said it rejected the request. | `DISPATCH_RESPONSE` | `REJECTED` |
| **PROVIDER_UNCERTAIN** | Neither of the above -- the local process cannot say what happened (thrown error, crash, timeout). | (no evidence exists yet -- absence of evidence, not evidence of absence) | n/a (execution status is `RESULT_UNCERTAIN`) |
| **RECONCILED_ACCEPTED** | A *later*, independent lookup against the provider's own record (not the original synchronous response) found acceptance. | `RECONCILIATION_LOOKUP` | `RECONCILED_ACCEPTED` |
| **RECONCILED_REJECTED** | Same, but the provider's own record shows rejection. | `RECONCILIATION_LOOKUP` | `RECONCILED_REJECTED` |

**`PROVIDER_ACCEPTED` and `RECONCILED_ACCEPTED` are deliberately kept as distinct terminal execution states**, not merged into one, even though both mean "the provider accepted this." The former means "we personally watched it happen"; the latter means "we found out after the fact." This distinction is not cosmetic: [`tests/omnia-v9-external-effect-crash-recovery.test.mjs`](../../tests/omnia-v9-external-effect-crash-recovery.test.mjs)'s checkpoint-C kill-shot explicitly asserts the recovered execution lands in `RECONCILED_ACCEPTED`, not `PROVIDER_ACCEPTED`, precisely because recovery never directly observed the dispatch response -- it only reconciled after the fact.

Neither of those, nor anything else in this system, is ever labeled "DELIVERED." No code path claims the recipient received anything, let alone read it -- this system's provider-neutral contract has no concept of read receipts or delivery confirmation beyond what the provider's own synchronous or reconciled response actually states.

## Never a bare boolean

Every piece of evidence this system stores is a structured object, never a caller-supplied `providerConfirmed: true`. [`omnia_v9_external_effect_provider_evidence`](../../migrations/011_omnia_v9_external_effect_executions.sql) requires, per row: `provider`, `account_identity`, `business_identity`, `provider_reference_id`, `observed_at`, `evidence_type`, `acquisition_method`, `reconciliation_source`, `lifecycle`, `detail` (jsonb) -- see the "provider receipt provenance" requirement this satisfies. `classifyOutcome()` in every adapter (currently only [`null-sink-v2.mjs`](../../src/omnia-v9/integrations/null-sink-v2.mjs)) derives its answer from this structured object's `lifecycle` field, never from an ad-hoc flag a caller could forge or misuse.

## Append-only, never overwritten

`omnia_v9_external_effect_provider_evidence` has explicit no-update/no-delete triggers (migration 011). If reconciliation later produces evidence that contradicts an earlier record (mission section 14E, "contradictory evidence"), both records are kept -- the contradiction itself is the signal that routes the execution to `OWNER_REVIEW_REQUIRED`, not something resolved by silently overwriting the earlier record.

## Rollback vs. suppression vs. compensation

External communication cannot be rolled back once genuinely sent -- this system never uses the word "rollback" for anything after `PROVIDER_ACCEPTED`/`RECONCILED_ACCEPTED`. What the system *can* do, and what a real adapter's compensation logic (not built in this mission -- see [`V9_REAL_OUTBOUND_CANARY_CONTRACT.md`](./V9_REAL_OUTBOUND_CANARY_CONTRACT.md)) would implement on top of this execution layer:

- **Suppression**: prevent a *future* duplicate send for the same business key -- already enforced structurally by migration 011's partial unique index, with zero additional code needed.
- **Compensation**: mark a customer/prospect as contacted, notify the owner, or trigger a correction workflow -- application-level behavior a caller can build on top of a `PROVIDER_ACCEPTED`/`RECONCILED_ACCEPTED` terminal state; not part of this execution layer itself.
- **Never rollback**: no code in this system attempts to "un-send" anything.
