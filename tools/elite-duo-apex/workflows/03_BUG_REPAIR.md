# Root-cause bug repair

## Quality profile

- All AI roles: Claude Sonnet 5
- Architecture and review: max
- Execution: xhigh
- No lower-model fallback

## Ordered skills

1. `/compile-mission`
2. `/map-repository`
3. `/debug-causally`
4. `/run-targeted-tests`
5. `/run-full-validation`
6. `/compile-evidence-packet`
7. `/review-fable-lens`
8. `/review-sol-lens`

## Required final artifact

`FINAL_VERDICT.json`

## Stop rule

Stop after the required artifact is validated, external actions are recorded accurately, and the mission state is `STOP` or `BLOCKED_USER_INPUT`.
