# User Research detective control

## Objective

Detect drift, bypass, unsupported claims, stale checks, and incomplete evidence after or during execution.

## Enforcement

- deterministic hook or validation where possible;
- Sonnet 5 max review where judgment is required;
- exact audit event;
- explicit owner and failure behavior;
- no silent fail-open behavior for critical controls.

## Test

Attempt the prohibited or detectable condition and verify the control produces a structured block or finding.
