# UberBond Opportunity Tournament — 2026-08-20

This receipt describes a local, deterministic ranking of the one canonical
Opportunity Registry. It is not a market census, payment proof, customer
proof, or permission to contact anyone.

## Verified run

- Policy: `opportunity-tournament-1.0.0`
- Reference date: `2026-08-20T09:00:00.000Z`
- Tournament ID: `fb1dd56aa4e92fde76860b6903f80f0367ac40ce91df2b4cf3dfb4ef2352c28e`
- Registry rows: `438`
- Unique IDs: `438`
- Rows scored: `438`
- Returned slice: top `15`
- Implementation distance for the shared economic spine: `0.00`
- External effects: provider calls `0`, messages `0`, purchases `0`, deployments `0`, spend `0` cents

## Ranking

| Rank | Opportunity | Score | Confidence | Sufficiency | Truth |
|---:|---|---:|---:|---|---|
| 1 | Paid Media Revenue Assurance | 42 | 0.12 | WEAK | BUYER_SIGNAL only; not payment proof |
| 2 | AI Automation Reliability Pilot | 34 | 0.11 | WEAK | BUYER_SIGNAL only; not payment proof |
| 3 | Conversational Funnel Reliability Audit | 31 | 0.11 | WEAK | BUYER_SIGNAL only; not payment proof |

The remaining 435 rows are hypotheses with insufficient data. A low score is
not a claim that the mechanism cannot work; it is the honest result of missing
evidence in the tournament criteria.

## Shared capability reuse

The top-level tournament reused these already-tested capability ids:

`market-signal-registry`, `opportunity-registry`, `prometheus-economic-spine`,
`commercial-experiment-compiler`, `distribution-channel-registry`,
`commercial-outcome-lineage`, and `commercial-learning-memory`.

The handler writes one compact `commercial_opportunity_tournament` receipt to
the existing `auditLog`; it does not create a second registry or advance any
promotion stage.
