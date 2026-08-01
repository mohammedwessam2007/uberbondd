# Architecture decision without edits

## Quality profile

- All AI roles: Claude Sonnet 5
- Architecture and review: max
- Execution: xhigh
- No lower-model fallback

## Ordered skills

1. `/compile-mission`
2. `/build-authority-map`
3. `/build-context-capsule`
4. `/design-fable-execution`
5. `/design-sol-architecture`
6. `/merge-dual-contracts`

## Required final artifact

`ELITE_DECISION_CONTRACT.json`

## Stop rule

Stop after the required artifact is validated, external actions are recorded accurately, and the mission state is `STOP` or `BLOCKED_USER_INPUT`.
