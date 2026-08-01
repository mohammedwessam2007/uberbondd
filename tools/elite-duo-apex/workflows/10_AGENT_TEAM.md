# Opt-in independent parallel work

## Quality profile

- All AI roles: Claude Sonnet 5
- Architecture and review: max
- Execution: xhigh
- No lower-model fallback

## Ordered skills

1. `/compile-mission`
2. `/plan-agent-team`
3. `/assign-file-ownership`
4. `/create-worktree-plan`
5. `/implement-module`
6. `/adjudicate-reviews`

## Required final artifact

`FINAL_VERDICT.json`

## Stop rule

Stop after the required artifact is validated, external actions are recorded accurately, and the mission state is `STOP` or `BLOCKED_USER_INPUT`.
