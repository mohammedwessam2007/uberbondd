# Audit operational reachability

## Quality profile

- All AI roles: Claude Sonnet 5
- Architecture and review: max
- Execution: xhigh
- No lower-model fallback

## Ordered skills

1. `/map-repository`
2. `/trace-runtime`
3. `/design-real-path-tests`
4. `/issue-final-verdict`

## Required final artifact

`RUNTIME_WIRING_REPORT.md`

## Stop rule

Stop after the required artifact is validated, external actions are recorded accurately, and the mission state is `STOP` or `BLOCKED_USER_INPUT`.
