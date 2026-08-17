# Prometheus External Gates

Every point in this system where further real progress requires something
this session cannot do alone — a credential, an owner decision, or live-
world evidence. Consolidated from this wave and prior waves so it's in one
place rather than scattered across handoff docs.

| Gate | Blocks | What's needed | Owned by |
|---|---|---|---|
| Checkout URLs unconfigured | The actual first real dollar (`src/founder-command-center.mjs` already flags this as the #1 owner action) | Configure `fullAuditCheckoutUrl`/`strategyAuditCheckoutUrl`/`monitoringCheckoutUrl` with a real Lemon Squeezy product | Owner |
| V9-vs-Guard architecture decision | Adapters, ingestion, business-genome extraction, distribution brain, self-upgrade engine (all deferred this wave — see respective docs) | A direction call between the unmerged OMNIA V9 formal kernel and this branch's lighter Deliverability Guard | Owner (`docs/PROMETHEUS_CANONICAL_INTEGRATION_PLAN.md`) |
| Vercel deployment target misconfigured | The "Vercel – uberbondd" CI check | Vercel dashboard access to repoint the project at the correct target (or off the repo root) | Owner |
| GitHub Actions billing lock | Hosted CI execution (jobs trigger but complete in ~3s with no logs) | Account billing resolution | Owner |
| No real credentials for social/platform signal sources | Planetary market radar (YouTube/TikTok/X/Instagram/etc.) | Credentials + a compliant-access-path decision per source; explicitly on the kill list otherwise (`docs/PROMETHEUS_SCOPED_VERDICT.md`) | Owner, per-source |
| No real distribution history anywhere in this system | Distribution Value Estimator, Autonomous Distribution Allocator (`docs/PROMETHEUS_DISTRIBUTION_BRAIN.md`) | Outbound (or any channel) authorized to run live and produce real outcomes | Owner |
| `PostgresStore` was live-unproven | Confidence in the production data layer | **CLOSED this wave** — `tests/postgres-store-live.test.mjs`, 19/19 against a real local PostgreSQL 16 server | — |
| No real customer, payment, or revenue event anywhere | Any claim of commercial traction | A real buyer completing a real purchase | Owner + market |

## What is NOT a gate (already closed, listed for contrast)

- PostgresStore live proof — closed this wave.
- Branch/PR reconciliation visibility — closed this wave (was previously
  simply unknown; now documented with independently-verified evidence).
- Payment-truth overcounting bug — closed in the prior wave.
- Checkout-not-configured *visibility* — closed (the founder command
  center surfaces it automatically); the checkout *configuration itself*
  remains the real open gate above.
