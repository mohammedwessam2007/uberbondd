# OMNIA V9 Crash-Recovery State Machine: the 10 Scenarios

This document walks the 10 crash scenarios A-J this mission specifies, against the actual implementation in [`src/omnia-v9/integrations/external-effect-dispatcher.mjs`](../../src/omnia-v9/integrations/external-effect-dispatcher.mjs) and [`external-effect-recovery.mjs`](../../src/omnia-v9/integrations/external-effect-recovery.mjs). For every scenario: what is known, what is unknown, whether retry is legal, whether provider reconciliation is required, whether human review is required, what evidence exists, and the exact safe next transition. All ten are exercised directly by [`tests/omnia-v9-external-effect-crash-recovery.test.mjs`](../../tests/omnia-v9-external-effect-crash-recovery.test.mjs) and [`omnia-v9-external-effect-property.test.mjs`](../../tests/omnia-v9-external-effect-property.test.mjs) (1,000-scenario property run) against real PostgreSQL.

Naming note: this mission's suggested 8 states became 10 in the implementation (`RECONCILING` and `RECONCILED_NOT_SUBMITTED` added; `RECEIPT_PERSISTED` folded into evidence records rather than kept as a separate FSM state) -- full rationale in [`src/omnia-v9/integrations/external-effect-state-machine.mjs`](../../src/omnia-v9/integrations/external-effect-state-machine.mjs)'s header comment.

## A -- crash before authority reservation

**Known:** nothing durable exists for this action anywhere. **Unknown:** nothing -- there is genuinely no ambiguity. **Retry legal:** yes, unconditionally -- this is simply the first attempt. **Reconciliation required:** no. **Human review:** no. **Evidence:** none exists or is needed. **Safe next transition:** a fresh `dispatchExternalEffect()` call, from scratch.

## B -- crash after authority reservation, before execution-attempt registration (`store.prepare()`)

**Known:** the frozen P1 authority reservation is committed (`omnia_v9_authority_reservations`). **Unknown:** whether anything downstream ever ran -- but downstream code cannot have made a network call, because `store.prepare()` (the durable execution-intent object) had not yet been created. **Retry legal:** yes -- a fresh `dispatchExternalEffect()` call reuses the same (already-committed, idempotent) authority reservation and proceeds to create the execution object for the first time. **Reconciliation required:** no. **Human review:** no. **Evidence:** none. **Safe next transition:** `(none) -> PREPARED`, proceeding normally.

## C -- crash after execution-attempt registration (`PREPARED`), before provider call

**Known:** a durable `PREPARED` row exists; `DISPATCHING` was never reached. **Unknown:** nothing meaningful -- `DISPATCHING` never became durable, which structurally proves no network call was ever attempted (the dispatcher's code has no path to `adapter.dispatch()` that skips the `DISPATCHING` transition). **Retry legal:** yes. **Reconciliation required:** no. **Human review:** no. **Evidence:** none needed. **Safe next transition:** `recoverOneExecution()` transitions `PREPARED -> ABORTED_BEFORE_DISPATCH`, which releases the business key (migration 011's partial unique index), then a fresh attempt is legal under the same business key.

## D -- crash during the provider call itself

**Known:** `DISPATCHING` is durable; `adapter.dispatch()` was invoked but never returned to the caller (network partition, process kill mid-call, etc.). **Unknown:** whether the provider received and/or processed the request before the crash -- this is irreducible from the caller's side alone. **Retry legal: no.** **Reconciliation required: yes.** **Human review:** only if reconciliation itself is inconclusive or ambiguous. **Evidence:** none locally (no `DISPATCH_RESPONSE` evidence was ever recorded, because the call never returned). **Safe next transition:** `DISPATCHING -> RESULT_UNCERTAIN -> RECONCILING`, then `adapter.reconcile()`.

## E -- provider accepted but response lost

**Known:** `DISPATCHING` is durable; the provider's own side (modeled by `omnia_v9_null_provider_ledger` for the simulator) truly recorded acceptance; our local process never received/persisted that response (`RESPONSE_LOST_AFTER_SUCCESS` / `TIMEOUT_AFTER_PROVIDER_RECEIPT` simulation modes). **Unknown (locally):** the outcome, until reconciled. **Retry legal: no.** **Reconciliation required: yes**, and it resolves cleanly (case A of the reconciliation-proof matrix below). **Human review:** no. **Evidence:** a `RECONCILIATION_LOOKUP` evidence record with `lifecycle: RECONCILED_ACCEPTED`. **Safe next transition:** `RESULT_UNCERTAIN -> RECONCILING -> RECONCILED_ACCEPTED`, action `FINALIZE_CONFIRMED`.

## F -- provider rejected but response lost

Symmetric to E. **Evidence:** `RECONCILIATION_LOOKUP` with `lifecycle: RECONCILED_REJECTED`. **Safe next transition:** `RECONCILING -> RECONCILED_REJECTED`, action `FINALIZE_REJECTED`.

## G -- provider response received but process crashes before local receipt (**checkpoint C**)

This is the exact failure this mission exists to kill. **Known:** `DISPATCHING` is durable; the provider genuinely accepted (verified independently via the provider-side ledger in the kill-shot test); the crash lands between the dispatch response returning and the local evidence (`DISPATCH_RESPONSE`) being appended. **Unknown (locally, until recovery inspects):** whether local evidence survived. **Retry legal: no.** **Reconciliation required:** only if local evidence did *not* survive; **[`tests/omnia-v9-external-effect-crash-recovery.test.mjs`](../../tests/omnia-v9-external-effect-crash-recovery.test.mjs)'s "CHECKPOINT C KILL-SHOT" test crashes at exactly `AFTER_RECEIPT_BEFORE_AUTHORIZATION_BINDING` is not what's tested here** -- the kill-shot specifically crashes at `IMMEDIATELY_AFTER_PROVIDER_ACCEPTS`, i.e. *before* local evidence is even written, so recovery finds zero local evidence and must reconcile. **Human review:** no. **Safe next transition:** `recoverOneExecution()` sees `DISPATCHING` with no `DISPATCH_RESPONSE` evidence, transitions through `RESULT_UNCERTAIN -> RECONCILING`, reconciles, and finalizes `RECONCILED_ACCEPTED` -- **`adapter.dispatch()` is never called a second time.** Zero duplicate external effects, proven directly against the provider's own independent ledger (`omnia_v9_null_provider_ledger` row count == 1).

## H -- local receipt written but authorization binding not yet written

**Known:** `DISPATCHING` is durable; a `DISPATCH_RESPONSE` evidence record already exists (local receipt written); the final status transition (`DISPATCHING -> PROVIDER_ACCEPTED`/`PROVIDER_REJECTED`, the "authorization binding") has not yet committed. **Unknown:** nothing -- the local evidence is authoritative and sufficient. **Retry legal: no** (and unnecessary). **Reconciliation required: no** -- recovery finds the local `DISPATCH_RESPONSE` evidence directly (`evidenceStore.findByType(executionId, 'DISPATCH_RESPONSE')`) and finalizes from it, with **zero network calls**. **Human review:** no. **Safe next transition:** `DISPATCHING -> PROVIDER_ACCEPTED` (or `PROVIDER_REJECTED`), action `FINALIZE_CONFIRMED`/`FINALIZE_REJECTED`, directly from local evidence.

## I -- post-effect reconciliation crash

**Known:** the execution is in `RECONCILING`, possibly with a prior inconclusive reconciliation attempt already recorded. **Unknown:** the final outcome. **Retry legal:** not of the *dispatch* -- but a further *reconciliation* attempt is always legal and expected (`RECONCILING -> RESULT_UNCERTAIN` loops back for exactly this). **Reconciliation required: yes**, potentially more than once (the delayed-reconciliation test in [`tests/omnia-v9-external-effect-crash-recovery.test.mjs`](../../tests/omnia-v9-external-effect-crash-recovery.test.mjs) models this directly: first pass returns `RECONCILE_PROVIDER` with no finalization, second pass -- after the provider-side visibility delay elapses -- finalizes). **Human review:** only if reconciliation itself proves ambiguous or contradictory. **Safe next transition:** re-run `reconcileAndTransition()`; idempotent regardless of how many times it is interrupted mid-flight, since each pass either finalizes or safely re-parks in `RESULT_UNCERTAIN`.

## J -- duplicate recovery workers

**Known:** two (or more) recovery processes may run concurrently against the same unresolved-execution backlog. **Unknown:** which worker, if any, will actually claim a given row. **Retry legal:** n/a -- this scenario is about recovery concurrency, not dispatch retry. **Reconciliation required:** exactly once per execution, regardless of worker count. **Human review:** no additional review beyond what a single worker would trigger. **Mechanism:** `claimUnresolvedForRecovery()` uses `SELECT ... FOR UPDATE SKIP LOCKED` inside `store.withTransaction()`, so concurrent workers partition the unresolved set rather than racing on the same row. [`tests/omnia-v9-external-effect-concurrency.test.mjs`](../../tests/omnia-v9-external-effect-concurrency.test.mjs) proves this directly against real PostgreSQL with two concurrent workers on both a single contested row and a 12-row backlog: every row is claimed by exactly one worker, zero duplicate `adapter.dispatch()` calls, zero duplicate finalizations.

## Provider reconciliation proof matrix (mission section 14)

| Case | Scenario | Reconciliation result | Safe action |
|---|---|---|---|
| A | Provider accepted, local response lost | `RECONCILED_ACCEPTED` | `FINALIZE_CONFIRMED` |
| B | Provider rejected, local response lost | `RECONCILED_REJECTED` | `FINALIZE_REJECTED` |
| C | Provider never saw the request (proven) | `NOT_FOUND` -> `RECONCILED_NOT_SUBMITTED` | `ABORTED_BEFORE_DISPATCH` (frees business key for a real retry) |
| D | Provider outcome still ambiguous / not yet visible | `UNCERTAIN` | `RECONCILE_PROVIDER` (loop, try again later, never a dispatch retry) |
| E | Provider evidence is contradictory or irreducibly ambiguous | `AMBIGUOUS` | `OWNER_REVIEW_REQUIRED` (fail closed, never auto-resolved) |

All five rows are exercised directly in [`tests/omnia-v9-external-effect-crash-recovery.test.mjs`](../../tests/omnia-v9-external-effect-crash-recovery.test.mjs) using [`null-sink-v2.mjs`](../../src/omnia-v9/integrations/null-sink-v2.mjs)'s dedicated simulation modes.
