# Incident diagnosis and recovery plan

## Quality profile

- All AI roles: Claude Sonnet 5
- Architecture and review: max
- Execution: xhigh
- No lower-model fallback

## Ordered skills

1. `/compile-mission`
2. `/debug-causally`
3. `/build-incident-plan`
4. `/create-rollback`
5. `/build-owner-action-card`

## Required final artifact

`INCIDENT_PLAN.md`

## Stop rule

Stop after the required artifact is validated, external actions are recorded accurately, and the mission state is `STOP` or `BLOCKED_USER_INPUT`.
