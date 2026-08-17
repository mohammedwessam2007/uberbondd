# Prometheus economic spine wave

Date: 2026-08-18

## Outcome

The existing canonical kernels are now composed into one local-only vertical slice:

MarketSignal
-> BusinessGenome
-> Opportunity score
-> Offer packet
-> dry-run experiment packet
-> existing auditLog receipt

The composition lives in \`src/prometheus-economic-spine.mjs\`. It does not create a parallel opportunity, offer, payment, experiment, or authorization store.

## Implemented

- Re-normalizes every incoming signal through \`normalizeMarketSignal\`.
- Denies malformed signals and malformed opportunity candidates.
- Rejects a candidate whose declared \`signalId\` does not match the normalized signal.
- Preserves evidence classes; it never upgrades a hypothesis, synthetic fixture, or weak signal.
- Requires at least \`BUYER_SIGNAL\` evidence, freshness, and non-contradiction before a packet can be marked \`PREPARED\`.
- Reuses \`compileBusinessGenome\` and \`scoreOpportunity\` without inventing missing criteria.
- Reuses \`compileOfferPacket\` and keeps checkout, evidence, and campaign approval gates visible.
- Keeps promotion stages unchanged during preparation; no automatic promotion occurs.
- Emits an explicit dry-run experiment packet whose success metric is a cleared payment, not a simulated payment.
- Emits a zero external-effect ledger.
- Persists one compact \`prometheus_economic_spine\` receipt through the existing \`store.log\` writer.
- Adds the durable queue handler \`prometheus.opportunity.prepare\`; it only prepares and audits.
- Wires source syntax and hostile tests into the real deterministic verification command.

## Truth boundary

This wave does not:

- fetch social/platform data;
- scrape websites;
- contact buyers;
- send messages;
- call providers;
- create checkout links;
- process payments;
- deploy;
- change credentials or DNS;
- mark revenue;
- claim a customer or commercial proof.

A \`PREPARED\` result means a local packet passed the current gates. It does not mean an offer was sent, purchased, delivered, accepted, renewed, or profitable.

## Verification

The new test file is \`tests/prometheus-economic-spine.test.mjs\`. The branch's required commands are:

- \`node --check src/prometheus-economic-spine.mjs\`
- \`node --test tests/prometheus-economic-spine.test.mjs\`
- \`npm run check\`

The connected GitHub environment used for this change does not execute repository commands, so post-change test results remain NOT_RUN until Claude Code or another repository runner executes them. Prior branch evidence of 316/316 was recorded before this wave and is not reused as proof for these new changes.

## Remaining economic spine

Still missing and intentionally not fabricated:

- a compliant source adapter and real MarketSignal ingestion;
- a persistent registry for externally sourced signals;
- mechanism atoms and recombination;
- distribution channel/outcome data;
- payment/acceptance/renewal outcomes;
- revenue-weighted learning;
- formal UpgradeProposal and capital-allocation engines;
- shadow/canary promotion;
- V9-vs-Guard canonical authority decision;
- configured hosted checkout and live deployment proof.

## Next gate

Run the new deterministic suite. If it passes, the next highest-leverage safe slice is a bounded, source-adapter-neutral signal ingestion registry that persists canonical signals through an existing store collection/audit path, stays disabled when adapters are unconfigured, and proves dedupe, contradiction, freshness, retention, and replay behavior before any distribution automation is considered.
