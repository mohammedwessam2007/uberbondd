# Controlled MCP enablement

## Quality profile

- All AI roles: Claude Sonnet 5
- Architecture and review: max
- Execution: xhigh
- No lower-model fallback

## Ordered skills

1. `/compile-mission`
2. `/audit-mcp`
3. `/audit-permissions`
4. `/design-hooks`
5. `/issue-final-verdict`

## Required final artifact

`OWNER_ACTION_CARD.md`

## Stop rule

Stop after the required artifact is validated, external actions are recorded accurately, and the mission state is `STOP` or `BLOCKED_USER_INPUT`.
