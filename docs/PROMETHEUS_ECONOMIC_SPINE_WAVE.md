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

The exact branch head verified in a temporary checkout was
\`69c535fc13995372d10a15700721aee60123f7d8\`.

- \`npm ci\` — PASS; 20 packages installed.
- \`node --check src/prometheus-economic-spine.mjs\` — PASS.
- \`node --check src/market-signal-registry.mjs\` — PASS.
- \`node --test tests/prometheus-economic-spine.test.mjs tests/market-signal-registry.test.mjs\` — 24/24 PASS.
- \`npm run check\` — 340/340 deterministic tests PASS.
- \`npm run test:browser\` — NOT_RUN; the environment required network approval for the browser command and approval was unavailable.
- \`npm audit\` — NOT_RUN for the same network-approval limitation.

The older branch evidence of 316/316 is not being used as proof for these changes; the 340/340 result was run after this wave.

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


## Signal registry extension

The second slice adds src/market-signal-registry.mjs and tests/market-signal-registry.test.mjs.

It provides:

- bounded batch normalization;
- replay-safe dedupe against prior market_signal_ingest audit entries;
- coexistence and explicit flagging of contradictory observations;
- stale-signal flags without deleting history;
- synthetic-to-external rejection through the canonical normalizer;
- explicit dry-run default;
- optional compact audit persistence through store.log;
- zero-provider, zero-spend, zero-message behavior;
- queue handler prometheus.signals.ingest.

The registry does not call a source adapter. A future adapter must supply candidates through this contract and declare its own access/policy state. An empty or unconfigured adapter therefore produces a truthful zero-signal result.

## Commercial experiment, distribution, and outcome extension

The third slice adds three source-adapter-neutral contracts:

- `src/commercial-experiment.mjs` compiles a `PROBE` experiment from a
  prepared economic-spine decision. It makes the primary metric
  `CLEARED_PAYMENT`, records kill conditions and owner-minute/budget limits,
  and never advances the promotion ladder.
- `src/distribution-channel.mjs` normalizes channel descriptions and ranks
  preparation plans only when measured outcomes contain a verified
  `CLEARED_PAYMENT`, contribution margin, and owner minutes. Without that
  evidence it returns `DO_NOT_DISTRIBUTE`.
- `src/commercial-outcome.mjs` normalizes outcome lineage through the existing
  payment classifier and audit writer. A cleared-payment outcome requires the
  existing payment policy version, a cleared classification, amount/currency,
  and provider event proof. It is not a second revenue ledger.

The queue handlers are `prometheus.experiment.prepare`,
`prometheus.distribution.allocate`, and `prometheus.outcome.record`. All are
local-only preparation/receipt handlers. They do not send, spend, deploy,
publish, mutate checkout, or claim revenue without external proof.

The capability graph now marks the registry, economic spine, experiment
compiler, distribution allocator, and outcome lineage as `TEST_VERIFIED`.
That status means local deterministic behavior is covered; it does not mean
any source adapter, channel, checkout, customer, payment, or live deployment
exists.
