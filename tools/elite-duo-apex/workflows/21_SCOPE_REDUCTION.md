# Remove unnecessary design without quality loss

## Quality profile

- All AI roles: Claude Sonnet 5
- Architecture and review: max
- Execution: xhigh
- No lower-model fallback

## Ordered skills

1. `/build-authority-map`
2. `/run-counterfactuals`
3. `/audit-context-cost`
4. `/issue-final-verdict`

## Required final artifact

`SCOPE_REDUCTION.md`

## Stop rule

Stop after the required artifact is validated, external actions are recorded accurately, and the mission state is `STOP` or `BLOCKED_USER_INPUT`.
