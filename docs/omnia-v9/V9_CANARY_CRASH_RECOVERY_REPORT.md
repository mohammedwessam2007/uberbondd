# OMNIA V9 Canary Crash Recovery Report

Tests: [`tests/omnia-v9-canary-crash-recovery.test.mjs`](../../tests/omnia-v9-canary-crash-recovery.test.mjs).

## Methodology

This environment cannot cleanly exec and kill a real second process mid-test. Each checkpoint is instead reproduced by manually driving the exact durable database state a real crash at that point would leave behind, then invoking a **fresh** `evaluateAndGateCanaryNull()` call with a **fresh** `NullConsequenceAdapter` instance — standing in for a restarted process with no in-memory state — against that state. This tests the real durable-state recovery logic honestly; it does not test process-supervisor or signal-handling behavior, which this environment cannot exercise, and this report does not claim otherwise.

## Checkpoint A — crash before any reservation attempt

**Simulated state**: nothing durable exists yet for this candidate. **Recovery**: a fresh evaluation runs the normal path end to end and executes exactly once. No special recovery logic is needed or exists for this checkpoint — it is simply the first attempt.

## Checkpoint B — crash after authority reservation, before null execution

**Simulated state**: the intent is persisted, `reserveAuthority()` has committed (`ok: true`), but the sink was never called and no receipt exists.

**Recovery**: a fresh evaluation observes `reservation.duplicate === true` and, after the bounded receipt-poll window elapses with nothing found, correctly treats this as a genuine gap and executes exactly once, closing it. The approval's usage counter is confirmed to remain at exactly 1 — the original reservation is the only one that ever counted; recovery does not reserve a second time.

**This is the one checkpoint recovery closes cleanly and durably**, because reservation state is the durable source of truth for "was authority granted," and the absence of a receipt after a bounded wait is an honest signal that execution never happened.

## Checkpoint C — crash after null execution, before receipt persistence

**Simulated state**: the reservation is committed, the sink was actually called (in a since-destroyed process), but no receipt was ever persisted.

**Recovery result, stated plainly**: the recovering process **cannot tell** "the sink already fired and only the receipt write crashed" apart from "the sink never fired" using only the reservation and receipt tables, because sink execution itself has no separate durable marker between those two states. Recovery therefore re-fires the sink.

**This is documented as a known limitation, not glossed over.** For the null sink, this is harmless — `NULL_SINK_ACCEPTED` has no external effect, and firing it twice across two different "process lifetimes" costs nothing real. Authority consumption itself is *not* double-counted (the reservation was already committed and is never re-reserved), only the in-memory sink call happens twice.

**This is exactly why this pattern must not be reused unmodified for a real send adapter.** A real Gmail send re-fired under this same recovery logic would be a genuine double-send. Closing this gap for a real adapter requires one of:
1. A durable "execution attempted" marker written in the *same* transaction as the reservation (before calling the sink), checked on recovery before ever calling a real send adapter again, or
2. Making the real send itself idempotent at the provider (e.g. a client-supplied idempotency key the provider deduplicates on), or
3. Collapsing reservation + execution + receipt into a single transactional unit where that is achievable.

None of these exist in this codebase today. See [`V9_REAL_OUTBOUND_CANARY_ELIGIBILITY.md`](./V9_REAL_OUTBOUND_CANARY_ELIGIBILITY.md) for why this alone is sufficient to block real-outbound eligibility regardless of how the rest of this mission's gates score.

## Checkpoint D — crash after receipt persistence

**Simulated state**: fully recovered steady state — reservation committed, receipt durably persisted.

**Recovery**: a fresh evaluation finds the existing receipt immediately (no poll needed), reports `executed: true` (the logical consequence occurred), and calls the sink **zero** additional times. The returned receipt digest is byte-identical to the original.

## Proof chain resolvability

After a successful execution, the receipt, the reservation row, and the underlying `OWNER_APPROVAL` proof object all cross-reference correctly: the receipt's `intent_digest` matches the reservation's `intent_digest`; the reservation's `approval_id` resolves to a real, stored approval object. Nothing in the recovery paths above breaks this chain — even checkpoint C's honest limitation leaves a fully resolvable, if doubly-recorded-in-memory, proof trail.

## Summary

| Checkpoint | Recovery outcome |
|---|---|
| A — before reservation | Clean first attempt, executes once |
| B — after reservation, before execution | **Gap closed cleanly** — executes exactly once |
| C — after execution, before receipt | **Known limitation** — sink re-fires (harmless for null sink, unsafe to reuse unmodified for a real send) |
| D — after receipt persisted | Fully recovered, zero additional executions |

3 of 4 checkpoints recover cleanly with no double effect. The fourth is a real, understood, documented gap — this report treats that as a finding to act on before any real-consequence adapter is built, not as a result to minimize.
