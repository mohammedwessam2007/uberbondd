# OMNIA V9 P5 Plan

P5 closes the pre-effect/post-effect proof loop around the existing outbound Gmail side effect.

## Objective

After P4 observes the exact reserved outbound action immediately before Gmail, P5 creates a separate content-bound **ExecutionReceiptShadow** only after Gmail returns or the provider result becomes uncertain.

## Non-negotiable semantics

- A pre-effect observation is not an execution receipt.
- A Gmail API success response is provider evidence of dispatch acceptance, not proof of recipient delivery.
- An uncertain provider result must never be rewritten as success.
- Receipt creation is shadow/audit only and cannot change legacy send behavior.
- Receipt logging failure must not alter legacy send behavior.
- Receipt fields are content-bound by digest.
- The receipt binds to reservation ID, idempotency key, prospect/campaign, sender/recipient, subject/body digests, provider IDs when present, legacy reservation outcome, and exact timing.

## Expected states

- `PROVIDER_ACCEPTED` after Gmail returns an API success payload.
- `PROVIDER_RESULT_UNCERTAIN` when the existing pipeline enters its uncertain-send branch.
- Future delivery/bounce/complaint evidence remains separate downstream evidence and must not mutate this receipt into a stronger epistemic claim.

## Safety

P5 is not authorization and not enforcement. It observes and records what the legacy pipeline already did.
