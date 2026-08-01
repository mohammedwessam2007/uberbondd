# Bounded programmatic processing

## Quality profile

- All AI roles: Claude Sonnet 5
- Architecture and review: max
- Execution: xhigh
- No lower-model fallback

## Ordered skills

1. `/design-programmatic-stage`
2. `/write-local-tool-program`
3. `/validate-program-output`

## Required final artifact

`PROGRAM_EVIDENCE.json`

## Stop rule

Stop after the required artifact is validated, external actions are recorded accurately, and the mission state is `STOP` or `BLOCKED_USER_INPUT`.
