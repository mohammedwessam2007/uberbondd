# Event Driven Architecture failure playbook

## Trigger conditions

- authoritative inputs changed;
- work partially committed;
- final-boundary evidence became stale;
- a retry may duplicate an effect;
- required evidence is absent;
- the agent attempts to stop before the contract is satisfied.

## Response sequence

1. Freeze new effects.
2. Persist exact state and evidence.
3. Classify confirmed, pending, failed, and unknown outcomes.
4. Identify the last durable boundary.
5. Revalidate authority, approval, suppression, health, and budget.
6. Choose resume, compensate, roll back, or escalate.
7. Run targeted recovery tests.
8. Issue an incident evidence packet.
