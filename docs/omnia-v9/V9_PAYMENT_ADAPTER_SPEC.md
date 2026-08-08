# OMNIA V9 Payment Adapter Spec (Design Only — Not Implemented)

**No payment adapter is built or wired in this mission.** This document exists because the mission asked for the next adapter's design, not its code, and because getting the evidence-state model right on paper first avoids repeating the outbound adapter's early mistakes on a domain where mistakes cost real money.

## Current reality

`src/payments.mjs` (unmodified by this mission) already handles Lemon Squeezy webhooks: `verifyLemonSignature` (HMAC-SHA256, timing-safe compare), `normalizeLemonEvent` (extracts event name, amount, currency, customer email, status). This is real, working, production signature verification — a solid foundation, not something to replace.

## The core distinction this spec exists to enforce

**A verified webhook signature proves the provider sent this event. It does not prove the money has moved, cleared, or will stay moved.** Conflating "provider event verified" with "payment final" is exactly the kind of fact-laundering the frozen V9 kernel's evidence-lifecycle model was built to prevent.

## Required payment fact states

| State | Meaning | Can a signed webhook alone produce this state? |
|---|---|---|
| `ADMIN_ASSERTED` | A human/admin claims this happened, no provider confirmation | Never from a webhook — this is the opposite source |
| `PROVIDER_EVENT_VERIFIED` | A signed webhook was received and its signature verified | **Yes — this is the ceiling of what a webhook alone proves** |
| `AUTHORIZED` | Provider reports the charge was authorized | Only if the provider's own event semantics say so |
| `CAPTURED` | Provider reports funds captured | Only if the provider's own event semantics say so |
| `SETTLED` | Provider reports final settlement | Only if the provider's own event semantics say so, and typically arrives as a later, separate event |
| `REFUNDED` / `PARTIALLY_REFUNDED` | Provider reports a refund | Only from the corresponding refund event, never inferred |
| `DISPUTED` / `CHARGEBACK` | Provider reports a dispute/chargeback | Only from the corresponding event |
| `REVERSED` | A previously-settled payment was reversed | Only from the corresponding event |
| `UNKNOWN` | No verified event yet corresponds to a claimed payment | Default — never skip to a stronger state without evidence |

## The rule

**A single `PROVIDER_EVENT_VERIFIED` webhook may only ever produce the payment state that specific event's own semantics describe — never a stronger one.** A `subscription_created` webhook does not mean `SETTLED`. An `order_created` webhook does not mean `CAPTURED`. Each Lemon Squeezy event name maps to exactly one payment fact state; nothing may skip states based on assumption, urgency, or a "usually this means..." heuristic. If the mapping for a given event name is unclear, the correct output is `UNKNOWN`, not a guess.

## What a future adapter would need (not built here)

- A pure mapping function: `lemonEventName -> paymentFactState`, total (every known event name mapped, unknown names map to `UNKNOWN`, never throw).
- A P0-level `ActionIntent`/evidence shape for payment-consequential actions (refund issuance, dispute response), following the exact pattern `outbound-admission.mjs` established: derive from a summarized context, call the frozen `admitAction`, never touch the payment provider API directly from the adapter.
- Idempotency keyed on the provider's own event ID (`normalizeLemonEvent(...).eventId`), following the same durable-reservation pattern the outbound path already uses, to prevent the same webhook retry from being evaluated as two separate facts.
- Evidence origin for a webhook-derived fact should be `PROVIDER_CALLBACK` (already a valid origin in the frozen kernel's evidence model — see `EXTERNAL_ORIGINS` in `src/omnia-v9/kernel.mjs`), never `EXTERNAL_SOURCE` (reserved for a URL a human or crawler observed) and never `SYNTHETIC`.

## No live payment mutation

This mission makes no payment API calls, issues no refunds, and does not modify `src/payments.mjs`. This document is a specification for future work, gated the same way any other V9 core-adjacent expansion is: a reproduced real integration need, not architectural completeness for its own sake.
