# Long multi-phase mission

## Quality profile

- All AI roles: Claude Sonnet 5
- Architecture and review: max
- Execution: xhigh
- No lower-model fallback

## Ordered skills

1. `/compile-mission`
2. `/build-context-capsule`
3. `/plan-subagents`
4. `/design-fable-execution`
5. `/design-sol-architecture`
6. `/merge-dual-contracts`
7. `/implement-contract`
8. `/compile-evidence-packet`
9. `/review-fable-lens`
10. `/review-sol-lens`
11. `/adjudicate-reviews`

## Required final artifact

`FINAL_VERDICT.json`

## Stop rule

Stop after the required artifact is validated, external actions are recorded accurately, and the mission state is `STOP` or `BLOCKED_USER_INPUT`.
