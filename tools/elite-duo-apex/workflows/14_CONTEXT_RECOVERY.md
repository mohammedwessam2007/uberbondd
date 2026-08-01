# Recover after compaction or interrupted session

## Quality profile

- All AI roles: Claude Sonnet 5
- Architecture and review: max
- Execution: xhigh
- No lower-model fallback

## Ordered skills

1. `/rehydrate-after-compaction`
2. `/validate-memory`
3. `/build-context-capsule`

## Required final artifact

`REHYDRATION_REPORT.json`

## Stop rule

Stop after the required artifact is validated, external actions are recorded accurately, and the mission state is `STOP` or `BLOCKED_USER_INPUT`.
