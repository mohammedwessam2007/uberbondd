# Single polished result after hidden internal stages

## Quality profile

- All AI roles: Claude Sonnet 5
- Architecture and review: max
- Execution: xhigh
- No lower-model fallback

## Ordered skills

1. `/compile-mission`
2. `/design-fable-execution`
3. `/design-sol-architecture`
4. `/implement-contract`
5. `/review-fable-lens`
6. `/review-sol-lens`
7. `/adjudicate-reviews`
8. `/audit-final-message`

## Required final artifact

`FINAL_VERDICT.json`

## Stop rule

Stop after the required artifact is validated, external actions are recorded accurately, and the mission state is `STOP` or `BLOCKED_USER_INPUT`.
