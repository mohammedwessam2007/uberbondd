# Intelo.ai — approval-to-WMS integration QA note

Prepared: 2026-10-03. Public-evidence prework; no customer systems accessed.

## Observed boundary

Intelo's official article, published July 14, 2026, describes planners changing
quantities, excluding items and overriding store selections before release.
Approved runs subsequently flow into production WMS systems.

Source: https://www.intelo.ai/blog/field-trial-to-live-execution

Its official integration-partnership invitation is published at
https://www.intelo.ai/contact with partnerships@intelo.ai.
Scope: integration partners and collaboration with technology/consulting firms.

## Proposed partner QA artifact — not a claim of observed defects

| Proposed test | Expected release evidence |
|---|---|
| Planner edits an allocation after approval | Superseded plan cannot execute; a new approval binds the edited plan |
| Excluded SKU remains in a stale recommendation | Released payload excludes that SKU and records the exclusion |
| Store selection changes before write | Actual destination set matches the approved destination set |
| WMS request times out after possible acceptance | Reconciliation occurs before retry; uncertain outcome is not called failure |
| Same approved run is replayed | Idempotency prevents duplicate inventory effects |
| Partial WMS acceptance | Accepted/rejected items and compensating actions remain separately evidenced |
| Revoke approval before execution | Revoked approval cannot authorize the write |

This note proposes a bounded integration QA collaboration within UberBond's
existing AI Agent Production Release Gate offer. It does not assert that Intelo
lacks these controls, has lost revenue, or has defective agents. Acceptance,
integration access, delivery scope and a commercial relationship remain unproven.

No client relationship, consent, or send authorization is created by this note.
