# Email, payment, deployment, or provider effect

## Quality profile

- All AI roles: Claude Sonnet 5
- Architecture and review: max
- Execution: xhigh
- No lower-model fallback

## Ordered skills

1. `/compile-mission`
2. `/model-uncertain-outcomes`
3. `/audit-pre-effect-rechecks`
4. `/audit-external-actions`
5. `/issue-final-verdict`

## Required final artifact

`FINAL_VERDICT.json`

## Stop rule

Stop after the required artifact is validated, external actions are recorded accurately, and the mission state is `STOP` or `BLOCKED_USER_INPUT`.
