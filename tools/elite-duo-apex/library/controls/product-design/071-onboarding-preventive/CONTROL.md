# Onboarding preventive control

## Objective

Prevent invalid state, unauthorized action, evidence loss, and duplicated truth before execution.

## Enforcement

- deterministic hook or validation where possible;
- Sonnet 5 max review where judgment is required;
- exact audit event;
- explicit owner and failure behavior;
- no silent fail-open behavior for critical controls.

## Test

Attempt the prohibited or detectable condition and verify the control produces a structured block or finding.
