# Database migration

## Quality profile

- All AI roles: Claude Sonnet 5
- Architecture and review: max
- Execution: xhigh
- No lower-model fallback

## Ordered skills

1. `/compile-mission`
2. `/design-migration`
3. `/review-transaction-boundaries`
4. `/attack-concurrency`
5. `/design-real-path-tests`
6. `/implement-contract`
7. `/run-full-validation`
8. `/review-sol-lens`

## Required final artifact

`FINAL_VERDICT.json`

## Stop rule

Stop after the required artifact is validated, external actions are recorded accurately, and the mission state is `STOP` or `BLOCKED_USER_INPUT`.
