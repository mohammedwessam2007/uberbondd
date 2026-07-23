# UberBond Automation State Machine

Implementation: `src/automation/state-machine.mjs`. Tests: `tests/automation-state-machine.test.mjs`
(15 tests covering the full transition table, every terminal state, and the projection function).

## States

Lifecycle (21):
```
DISCOVERED → CRAWLED → EVIDENCE_VERIFIED → QUALIFIED → DRAFT_READY → POLICY_ELIGIBLE
→ SEND_RESERVED → SENT → REPLIED / NO_REPLY → FOLLOWUP_ELIGIBLE → PROPOSAL_READY
→ INVOICE_READY → PAID → ONBOARDING → FULFILLMENT_ACTIVE → QA → DELIVERED
→ MONITORING_OFFERED → MONITORING_ACTIVE → CLOSED
```

Terminal (6, no outgoing transitions): `REJECTED`, `SUPPRESSED`, `FAILED`, `REFUNDED`,
`CHARGEBACK`, `CANCELLED`.

## Full transition table

| From | Allowed to |
|---|---|
| DISCOVERED | CRAWLED, REJECTED, SUPPRESSED, FAILED |
| CRAWLED | EVIDENCE_VERIFIED, REJECTED, SUPPRESSED, FAILED |
| EVIDENCE_VERIFIED | QUALIFIED, REJECTED, SUPPRESSED, FAILED |
| QUALIFIED | DRAFT_READY, REJECTED, SUPPRESSED, FAILED |
| DRAFT_READY | POLICY_ELIGIBLE, REJECTED, SUPPRESSED, FAILED |
| POLICY_ELIGIBLE | SEND_RESERVED, REJECTED, SUPPRESSED, FAILED |
| SEND_RESERVED | SENT, REJECTED, SUPPRESSED, FAILED |
| SENT | REPLIED, NO_REPLY, REJECTED, SUPPRESSED, FAILED |
| NO_REPLY | FOLLOWUP_ELIGIBLE, CLOSED, REJECTED, SUPPRESSED, FAILED |
| FOLLOWUP_ELIGIBLE | SEND_RESERVED, REJECTED, SUPPRESSED, FAILED |
| REPLIED | PROPOSAL_READY, REJECTED, SUPPRESSED |
| PROPOSAL_READY | INVOICE_READY, REJECTED, SUPPRESSED |
| INVOICE_READY | PAID, CANCELLED, REJECTED, SUPPRESSED |
| PAID | ONBOARDING, REFUNDED, CHARGEBACK |
| ONBOARDING | FULFILLMENT_ACTIVE, CANCELLED |
| FULFILLMENT_ACTIVE | QA, CANCELLED |
| QA | DELIVERED, FULFILLMENT_ACTIVE (rework loop) |
| DELIVERED | MONITORING_OFFERED, CLOSED |
| MONITORING_OFFERED | MONITORING_ACTIVE, CLOSED |
| MONITORING_ACTIVE | CLOSED, CANCELLED, REFUNDED |
| any terminal | (none — terminal) |

Design notes:
- `FAILED` is reachable only up through `FOLLOWUP_ELIGIBLE` (pre-reply). Once a human has replied
  (`REPLIED` onward), a processing failure no longer makes sense as a system state — a reply means
  the pipeline succeeded at its job; what happens next is a business outcome (`REJECTED`/
  `SUPPRESSED`), not a technical failure. This is asserted by
  `tests/automation-state-machine.test.mjs`'s "FAILED is only reachable pre-reply" test.
- `QA → FULFILLMENT_ACTIVE` is the only lifecycle-to-lifecycle backward edge, modeling a rework
  loop when QA finds a defect — this mirrors `src/delivery.mjs`'s existing `on-hold` re-entry
  transitions for the same reason (real fulfillment work is not always linear).
- `REFUNDED`/`CHARGEBACK`/`CANCELLED` only apply from the stages where they are meaningful
  (payment-adjacent and fulfillment/monitoring stages) rather than being universal, unlike
  `REJECTED`/`SUPPRESSED`/`FAILED` which apply to every pre-terminal outreach stage.

## Mapping to the running system

`projectLifecycleState(prospect, context)` projects the pre-existing, already-tested
`acquisitionStatus` vocabulary (`src/cockpit.mjs#deriveAcquisitionStatus`) plus delivery/
subscription status onto this formal vocabulary, so the control center can display one consistent
lifecycle label without a data migration of `prospects`/`deliveries`/`subscriptions`. See the
architecture doc for the one known projection gap: the existing pipeline does not expose a status
distinct for `EVIDENCE_VERIFIED` vs. `CRAWLED`/`QUALIFIED` (the crawl+audit-validation pass is a
single step in `src/pipeline.mjs#processProspect`), so a live prospect currently projects straight
from `CRAWLED`-equivalent to `QUALIFIED`-equivalent. The state and transition itself is still fully
defined and tested in the abstract FSM.

## What "test every allowed and forbidden transition" means here

`tests/automation-state-machine.test.mjs` asserts:
1. The exact vocabulary (21 lifecycle + 6 terminal, no duplicates).
2. The full documented happy path is walkable end to end (18 consecutive `assertTransition` calls).
3. The no-reply → follow-up branch and its own closure (`NO_REPLY → CLOSED`).
4. Every non-terminal, non-post-payment state can reach an appropriate rejection/suppression
   terminal.
5. Every terminal state has zero outgoing transitions, and attempting one throws
   `StateMachineError`.
6. Representative forbidden transitions are rejected: stage-skipping (`DISCOVERED → SENT`),
   backward-past-terminal (`PAID → DISCOVERED`), and skip-to-payment (`DISCOVERED → PAID`).
7. Unknown state strings are rejected rather than silently treated as a no-op.
8. `FAILED` is reachable pre-reply but not post-reply.
