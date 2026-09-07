# Night swarm state

This directory is the durable shared state for issue #463.

- `claims/` contains per-packet per-agent claim files.
- `receipts/` contains per-packet per-agent completion or blocker receipts.

Agents must follow `docs/NIGHT_SWARM_COORDINATION_PROTOCOL.md` and refresh PR #458 + issue #463 before claiming new work.

The coordination layer has no business-effect authority. Claim/receipt presence never proves source correctness, deployment, payment, customer state, or life outcomes.
