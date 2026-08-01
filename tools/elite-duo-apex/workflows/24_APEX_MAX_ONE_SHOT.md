# Maximum Sonnet-only finite mission

## Quality profile

- All AI roles: Claude Sonnet 5
- Architecture and review: max
- Execution: xhigh
- No lower-model fallback

## Ordered skills

1. `/compile-mission`
2. `/build-context-capsule`
3. `/design-fable-execution`
4. `/design-sol-architecture`
5. `/merge-dual-contracts`
6. `/implement-contract`
7. `/review-fable-lens`
8. `/review-sol-lens`
9. `/adjudicate-reviews`
10. `/repair-from-contract`
11. `/issue-final-verdict`

## Required final artifact

`FINAL_VERDICT.json`

## Stop rule

Stop after the required artifact is validated, external actions are recorded accurately, and the mission state is `STOP` or `BLOCKED_USER_INPUT`.
