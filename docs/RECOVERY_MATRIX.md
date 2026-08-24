# Recovery matrix

Wave 18's exit gate. Every persistence boundary where a crash could produce a
second irreversible effect, with the classification it must produce and the test
that holds it there.

**Current exception:** post-BLACK-SKY revalidation found the transactional report-email path is not covered by the generic outbound rows below. See the dedicated section under Outbound. Until that P1 is repaired and the hostile regression passes, this matrix is not a complete recovery exit gate.

Classifications:

| | |
|---|---|
| `IDEMPOTENT_REPLAY` | the same logical operation applied again changes nothing |
| `RESUME` | work continues from durable state without repeating an effect |
| `SAFE_RETRY` | the operation may be repeated because no effect has left yet |
| `UNCERTAIN` | an effect may have happened and cannot be determined; never retried automatically |
| `QUARANTINE` | the record is set aside for a human rather than advanced |
| `FAIL_CLOSED` | a contradictory or unverifiable claim is refused |

`BLIND_REPEAT_IRREVERSIBLE_EFFECT` is not a permitted outcome anywhere.

---

## Outbound — a message to a real person

| Boundary | Crash point | Classification | Test |
|---|---|---|---|
| Intent compiled | before reservation | `SAFE_RETRY` | `tests/send-safety.test.mjs` |
| Authority checked | before reservation | `SAFE_RETRY` | `tests/outbound-stale-authorization.test.mjs` |
| Reservation created | before dispatch | `IDEMPOTENT_REPLAY` | `tests/reservation-recovery.test.mjs` |
| Final freshness recheck | before provider call | `FAIL_CLOSED` | `tests/pipeline-deliverability-guard.test.mjs` |
| Provider call begins | during | `UNCERTAIN` | `tests/omnia-v9-external-effect-crash-recovery.test.mjs` |
| **Provider accepted, response lost** | after accept, before receipt | `UNCERTAIN` — never resend | `tests/omnia-v9-external-effect-crash-recovery.test.mjs` (checkpoint C) |
| Send receipt write fails | after provider accept | `UNCERTAIN` | `tests/omnia-v9-external-effect-crash-recovery.test.mjs` |
| Reservation stuck `dispatching` | interrupted prior attempt | `QUARANTINE` | `tests/pipeline-deliverability-guard.test.mjs` |

The checkpoint-C case is the one that matters: a crash after the provider
accepted but before the local receipt landed must reconcile from provider
evidence and must never redispatch.

### Transactional report email — open P1 #128

This path is implemented separately in `RevenueEngine.sendReportEmail()` and does **not** currently use the outbound reservation/execution fence above. Direct inspection on BLACK SKY main `2ce97af4bafa05db3dbeec3a83320186ea06a956` shows the irreversible provider call occurs before any durable in-flight state is claimed.

| Boundary | Crash/race point | Required classification | Current proof |
|---|---|---|---|
| Report email admission | before provider call | `SAFE_RETRY` only before any durable claim/provider effect | open P1 #128 |
| Provider accepts, account/token persistence fails | after irreversible accept, before sent marker | `UNCERTAIN` + `QUARANTINE`; never automatic retry | `tests/revenue-report-email-black-sky-recovery.test.mjs` on PR #134 |
| Two callers share stale unsent lead snapshot | concurrent pre-provider admission | exactly one may cross the provider boundary; loser must `FAIL_CLOSED`/observe in-flight state | same |
| Restart sees unresolved in-flight attempt | restart | `UNCERTAIN`; never automatic retry | same |
| Durable sent marker exists | replay | `IDEMPOTENT_REPLAY` / terminal preservation | existing revenue report-email audit coverage |

The current production source does not yet satisfy the middle three rows. `src/revenue.mjs` is sovereignty-protected, so the repair must be human/sovereignty-governed rather than bypassing that boundary. The narrow repair is to atomically re-read the durable lead, claim `dispatching` before the provider call, refuse automatic replay from `dispatching`/`uncertain`, and transition monotonically to `sent` or `uncertain`.

## Payment — money

| Boundary | Crash point | Classification | Test |
|---|---|---|---|
| Webhook received | before persistence | `SAFE_RETRY` | `tests/payment-recovery-war.test.mjs` |
| Provider event persisted | replay ×100 | `IDEMPOTENT_REPLAY` | `tests/payment-recovery-war.test.mjs` |
| Order committed, ledger write lost | between | `FAIL_CLOSED` — not a cleared payment | `tests/payment-recovery-war.test.mjs` |
| Ledger committed, classification lost | between | `FAIL_CLOSED` — two of three witnesses | `tests/payment-recovery-war.test.mjs` |
| Same event, changed amount | replay | `FAIL_CLOSED` | `tests/payment-recovery-war.test.mjs` |
| Same event, changed currency | replay | `FAIL_CLOSED` | `tests/payment-recovery-war.test.mjs` |
| Refund before original payment | reordering | `FAIL_CLOSED` — contradiction raised | `tests/payment-recovery-war.test.mjs` |
| Duplicate refund callback | replay | `IDEMPOTENT_REPLAY` — reversed once | `tests/payment-recovery-war.test.mjs` |
| Store parity, duplicate payment | JSON vs PostgreSQL | identical `ConflictError` | `tests/payment-recovery-war.test.mjs` |

Until `tests/payment-recovery-war.test.mjs` existed, every one of the 114
real-PostgreSQL tests exercised OMNIA V9 infrastructure and none touched
`orders`, `revenue_events` or `leads`. The money tables had only ever run
against the JSON store, whose uniqueness lives in JavaScript rather than in a
`UNIQUE` index. They now run against both, and agree.

## Fulfillment — delivery, acceptance, renewal

| Boundary | Crash point | Classification | Test |
|---|---|---|---|
| Every event in the delivery sequence | after each of six | `IDEMPOTENT_REPLAY` | `tests/recovery-war-boundaries.test.mjs` |
| Delivered, acceptance requested | before acceptance | `FAIL_CLOSED` — never inferred | `tests/recovery-war-boundaries.test.mjs` |
| Accepted, support window running | restart | `FAIL_CLOSED` — a restart is not elapsed time | `tests/recovery-war-boundaries.test.mjs` |
| Same event id, different content | replay after crash | `FAIL_CLOSED` — identity collision | `tests/recovery-war-boundaries.test.mjs` |
| Contractual time | any claimed future timestamp | `FAIL_CLOSED` | `tests/fulfillment-forward-time.test.mjs` |

## Escalation — the owner finding out

| Boundary | Crash point | Classification | Test |
|---|---|---|---|
| Escalation row written, page not dispatched | between | `IDEMPOTENT_REPLAY` + new `OWNER_UNREACHABLE` | `tests/recovery-war-boundaries.test.mjs` |
| Transport throws after bytes may have left | during | `UNCERTAIN` — never `FAILED`, never `DELIVERED` | `tests/recovery-war-boundaries.test.mjs` |
| Twenty restarts inside one outage | repeated | one episode, one page | `tests/recovery-war-boundaries.test.mjs` |
| Ledger unreadable during recovery | read failure | `FAIL_CLOSED` — resolves nothing | `tests/recovery-war-boundaries.test.mjs` |
| Condition resolves, recurs later | across episodes | new episode, pages again | `tests/operator-escalation-episodes.test.mjs` |

## Scheduler and agent mesh

| Boundary | Crash point | Classification | Test |
|---|---|---|---|
| Cycle `STARTED`, no `TERMINAL` | mid-cycle | `QUARANTINE` → reconciled `DEGRADED` | `tests/agent-mesh-abandoned-cycle-reconciliation.test.mjs` |
| Same occurrence redelivered | replay | `IDEMPOTENT_REPLAY` | `tests/agent-mesh-soak.test.mjs` |
| Mission seed, same occurrence | replay | `ALREADY_SEEDED` | `tests/agent-mesh-mission-seed.test.mjs` |
| Fairness ledger unreadable | read failure | `FAIL_CLOSED` | `tests/durable-audit-scan-ceiling.test.mjs` |
| Snapshot scan cannot complete | pagination stall | `FAIL_CLOSED` | `tests/durable-audit-scan-ceiling.test.mjs` |
| Cognitive loop, each stage | six restart points | `RESUME` | `tests/cognitive-loop-crash-restart.test.mjs` |

## Authority and execution — OMNIA V9

| Boundary | Crash point | Classification | Test |
|---|---|---|---|
| After authority reservation | crash | never redispatch | `tests/omnia-v9-external-effect-crash-recovery.test.mjs` |
| After execution object created | crash | never redispatch | same |
| After `DISPATCHING` durable | crash | never redispatch | same |
| Immediately before provider call | crash | never redispatch | same |
| Two recovery workers, one execution | race | exactly one outcome | same, on real PostgreSQL |
| Kill switch engaged mid-flight | during | blocks new dispatch, not recovery | same |
| Revocation after dispatch began | during | finalizes from provider evidence | same |

---

## Boundaries deliberately not covered

**A store that loses a committed write.** Every classification here assumes the
durable layer keeps what it acknowledged. Testing otherwise would be testing
PostgreSQL, not this repository.

**Partial writes inside one transaction.** The store exposes `transaction()` and
the sequences above use it; a torn transaction is a database failure, not an
application state.

**Real provider behaviour under crash.** Every provider here is a deterministic
fake. What a real payment provider does when a connection dies mid-webhook is a
reality gate, and no test in this repository can close it.
