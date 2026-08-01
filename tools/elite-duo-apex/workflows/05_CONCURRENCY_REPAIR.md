# Race or ordering repair

## Quality profile

- All AI roles: Claude Sonnet 5
- Architecture and review: max
- Execution: xhigh
- No lower-model fallback

## Ordered skills

1. `/design-state-machine`
2. `/attack-concurrency`
3. `/design-idempotency`
4. `/design-concurrency-tests`
5. `/repair-from-contract`
6. `/run-full-validation`

## Required final artifact

`FINAL_VERDICT.json`

## Stop rule

Stop after the required artifact is validated, external actions are recorded accurately, and the mission state is `STOP` or `BLOCKED_USER_INPUT`.
