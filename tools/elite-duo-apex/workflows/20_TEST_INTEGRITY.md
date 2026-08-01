# Audit and strengthen tests

## Quality profile

- All AI roles: Claude Sonnet 5
- Architecture and review: max
- Execution: xhigh
- No lower-model fallback

## Ordered skills

1. `/detect-weakened-tests`
2. `/design-real-path-tests`
3. `/design-negative-tests`
4. `/design-concurrency-tests`

## Required final artifact

`TEST_INTEGRITY_REPORT.json`

## Stop rule

Stop after the required artifact is validated, external actions are recorded accurately, and the mission state is `STOP` or `BLOCKED_USER_INPUT`.
