# Independent code review

## Quality profile

- All AI roles: Claude Sonnet 5
- Architecture and review: max
- Execution: xhigh
- No lower-model fallback

## Ordered skills

1. `/compile-mission`
2. `/map-repository`
3. `/trace-runtime`
4. `/review-fable-lens`
5. `/review-sol-lens`
6. `/adjudicate-reviews`

## Required final artifact

`REVIEW_ADJUDICATION.json`

## Stop rule

Stop after the required artifact is validated, external actions are recorded accurately, and the mission state is `STOP` or `BLOCKED_USER_INPUT`.
