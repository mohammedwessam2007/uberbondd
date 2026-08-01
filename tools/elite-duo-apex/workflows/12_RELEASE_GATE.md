# Release readiness gate

## Quality profile

- All AI roles: Claude Sonnet 5
- Architecture and review: max
- Execution: xhigh
- No lower-model fallback

## Ordered skills

1. `/recompute-counts`
2. `/audit-artifacts`
3. `/review-fable-lens`
4. `/review-sol-lens`
5. `/issue-final-verdict`

## Required final artifact

`FINAL_VERDICT.json`

## Stop rule

Stop after the required artifact is validated, external actions are recorded accurately, and the mission state is `STOP` or `BLOCKED_USER_INPUT`.
