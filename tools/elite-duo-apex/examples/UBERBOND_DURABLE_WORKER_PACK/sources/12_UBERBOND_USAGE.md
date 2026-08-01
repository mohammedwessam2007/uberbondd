# UberBond usage profile

Recommended UberBond roles:

- `fable-execution-architect`: durable acquisition, payment, and delivery state machines;
- `sol-decision-architect`: Canon decisions, lane gates, offer architecture, and kill conditions;
- `runtime-wiring-auditor`: worker, scheduler, queue, and provider reachability;
- `concurrency-red-team`: durable queue and reservation races;
- `external-effect-reviewer`: outbound, payments, deployment, and provider boundaries;
- `authority-adjudicator`: Canon versus current code versus historical research;
- `fable-independent-reviewer` and `sol-independent-reviewer`: PR and commercial-deliverable review;
- `release-gatekeeper`: final controlled-simulation or canary verdict.

For UberBond:

- preserve `lite/`;
- keep live outbound disabled unless an owner-approved mission changes it;
- retain `send_eligible=false` on research records;
- never promote simulation to revenue;
- cap owner actions at three;
- keep PRs draft until independent review passes.
