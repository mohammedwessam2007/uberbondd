# Prometheus commercial economics wave

Date: 2026-08-18

## Outcome

The local economic spine now has a complete preparation-only loop:

`MarketSignal`
-> `BusinessGenome`
-> `OpportunityScore`
-> `OfferPacket`
-> `CommercialExperiment`
-> `DistributionPlan`
-> `CommercialOutcome`
-> existing `auditLog` receipts.

This is a contract loop, not a claim that the company has market access or
revenue. The implementation accepts caller-supplied records and keeps all
consequential boundaries disabled.

## What materially works

### Experiment compiler

`compileCommercialExperiment()` creates a bounded `PROBE` packet only from a
canonical spine decision. It includes:

- signal/opportunity/offer lineage;
- a cleared-payment primary metric;
- accepted delivery, renewal, contribution margin, and owner-minute metrics;
- kill conditions;
- explicit budget uncertainty or owner-provided-but-not-authorized budget;
- owner-minute ceiling;
- promotion stage without automatic advancement;
- zero external-effect ledger.

### Distribution registry and allocator

`normalizeDistributionChannel()` makes channel type, status, terms evidence,
and audience evidence explicit. `allocateDistribution()` ignores views,
clicks, replies, model estimates, and unmeasured margin. It returns
`DO_NOT_DISTRIBUTE` until at least one channel has a verified cleared-payment
outcome with measured contribution margin and owner minutes. Even after that
threshold, the output is `PREPARE_ONLY_RANKED`, with spend and external action
disabled.

### Outcome lineage

`normalizeCommercialOutcome()` preserves a lineage from signal, opportunity,
experiment, and channel. For `PAYMENT_CLEARED` or `RENEWAL_CLEARED`, the caller
must provide the existing `payments.mjs` decision, its policy version, a
cleared classification, a positive amount, currency, and provider event proof.
Refund/dispute outcomes use the existing refund classification and are
represented as negative economic impact. Non-payment outcomes remain
observations. A numeric amount attached to an observation is rejected rather
than treated as revenue.

## Queue surface

- `prometheus.signals.ingest` — bounded, caller-supplied signal candidates;
  dry-run unless explicitly asked to write a compact audit receipt.
- `prometheus.opportunity.prepare` — signal-to-offer composition and receipt.
- `prometheus.experiment.prepare` — experiment packet and receipt.
- `prometheus.distribution.allocate` — fail-closed channel ranking and receipt.
- `prometheus.outcome.record` — payment-proof-gated outcome normalization and
  receipt.

None of these handlers performs a provider call, sends a message, spends
money, deploys, changes credentials/DNS, mutates production, or marks a
payment cleared by assertion.

## Honest boundary

Still absent and therefore not claimed:

- compliant public-source adapters and real source access;
- real buyer/distribution outcomes;
- configured checkout and a cleared payment;
- accepted delivery, renewal, contribution-margin proof, or customer;
- revenue-weighted learning from non-synthetic outcomes;
- formal upgrade/capital allocation engines;
- shadow/canary promotion;
- a final canonical OMNIA V9 vs Deliverability Guard authority decision.

The highest-leverage external dependency remains a configured, owner-approved
checkout path followed by one real stranger payment. Until then, allocation
must remain `DO_NOT_DISTRIBUTE` or preparation-only.
