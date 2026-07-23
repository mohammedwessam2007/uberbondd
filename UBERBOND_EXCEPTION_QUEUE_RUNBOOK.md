# UberBond Owner Exception Queue Runbook

Implementation: `src/automation/exceptions.mjs`. Tests: `tests/automation-exceptions.test.mjs`,
plus end-to-end coverage in `tests/automation-hostile.test.mjs`.

Per spec section L, the owner is meant to handle only: campaign approval, uncertain evidence,
legal/compliance concerns, positive replies, negotiation, payment mismatches, credential issues,
fulfillment incidents, refunds/chargebacks, and kill-switch recovery. Everything else in the loop
is meant to run without them. `buildExceptionQueue()` is the single function that turns the state
of every subsystem into that list.

## Priority and SLA

| Priority | SLA | Meaning |
|---|---|---|
| P0 | 4 hours | Something is actively wrong or exposed: a payment dispute, a chargeback, a paused sending inbox, a dead-lettered job, a legal/compliance-flagged reply. |
| P1 | 24 hours | Needs a human decision but nothing is actively breaking: a positive reply, an ambiguous/unmatched reply, a blocked or SLA-overdue fulfillment task, a failed monitoring payment. |
| P2 | 72 hours | Reserved for lower-urgency categories (e.g. routine campaign-approval review) — not yet populated by any current source in `buildExceptionQueue`, but the priority tier exists for callers that add one. |

`slaAt` is computed as `createdAt + SLA hours` for the row's priority, so the control center or a
future notifier can sort by "how much runway is left," not just by category.

## Categories and exact owner actions

| Category | Priority | Trigger | Exact action (verbatim `exactAction` text) |
|---|---|---|---|
| `positive_reply` | P1 | Reply classified `interested`/`meeting-requested`/`asks-for-information` | "Review the reply, send a personal reply from the owner. Do not auto-negotiate price or scope." |
| `reply_review` | P1 | Reply needs human classification review, or is unmatched to any prospect | "Manually classify or match this reply to a prospect." |
| `legal_compliance` | P0 | Reply classified `legal`/`legal-threat`/`complaint` | "Escalate to legal/compliance review before any further contact with this prospect." |
| `payment_mismatch` | P0 | Order `paymentState === 'disputed'` | "Investigate the dispute with the payment provider. Do not proceed with fulfillment until resolved." |
| `payment_mismatch` | P1 | Monitoring subscription `status === 'payment_failed'` | "Contact the customer about the failed monitoring payment before the next scheduled check." |
| `refund` | P0 | Order `paymentState === 'refunded'` | "Confirm the refund with the provider and halt or roll back the fulfillment lane." |
| `chargeback` | P0 | Order `paymentState === 'chargeback'` | "Confirm the chargeback with the provider and halt or roll back the fulfillment lane." |
| `credential_issue` | P1 | Fulfillment task `blocked` with an incomplete `credential-request-sent` onboarding item | "Follow up with the customer for the missing access/credentials on the checklist." |
| `fulfillment_incident` | P1 | Fulfillment task `blocked` (non-credential) or past its `slaDueAt` while still active | "Unblock the fulfillment task or reassign the lane." / "Check in with the assigned lane and either complete or reassign the task today." |
| `kill_switch_recovery` | P0 | A sender inbox is paused (bounce/complaint threshold) | "Investigate the bounce/complaint spike before resuming this inbox." |
| `kill_switch_recovery` | P1 | A job has moved to the dead-letter queue | "Diagnose the failure and requeue from the dead-letter queue, or resolve manually." |

`evidence` on every row carries the minimum context needed to act without opening another screen
(reply excerpt, order amount/currency, task/delivery IDs, sender inbox counters) — never the full
underlying record, to keep the queue itself lightweight and reviewable.

## Sort order

Rows are sorted by `priorityRank` (P0 before P1 before P2), then by `createdAt` ascending (oldest
first within the same priority) — so the oldest P0 is always first.

## What is deliberately not in the automated queue

- **Campaign approval** itself is not yet a generated row (no source in `buildExceptionQueue` emits
  it) — campaign policy signing is currently an explicit owner action taken by calling
  `signCampaignPolicy` directly (e.g. from a script or an admin route once one exists), not
  something the system nags about. See the readiness doc.
- **Uncertain evidence** at the individual-finding level is already handled upstream by
  `src/qualification.mjs#validateAuditEvidence` rejecting anything below its confidence threshold
  before a prospect ever reaches `QUALIFIED` — there is no separate "uncertain evidence" exception
  category because the existing gate prevents uncertain evidence from becoming actionable in the
  first place, rather than surfacing it for review after the fact.
- **Negotiation** has no automated trigger by design — spec section D and G both explicitly forbid
  automatic negotiation, so there is nothing to route into an exception queue; a human already
  owns every reply that could involve negotiation via `positive_reply`/`reply_review`.
