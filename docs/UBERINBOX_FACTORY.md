# UberInbox Factory

`UberInbox` is UberBond's provider-neutral mailbox-capacity planning layer. It exists to maximize **legitimately evidenced, reputation-compatible mailbox inventory** across domains the founder actually owns and providers whose capacity, pricing, provisioning API, and allowed use are explicitly observed.

It is not a quota-evasion system, provider-policy bypass, spam sender, DNS mutator, purchaser, or mailbox provisioner. The planning module has `externalEffectAuthority: NONE` and performs zero provider calls, purchases, DNS changes, mailbox creation, or sends.

## Why this exists

Raw mailbox count is a weak proxy for usable distribution capacity. A provider can advertise a large or even "unlimited" inbox count while throughput, per-domain density, IP reputation, warmup, placement, provider terms, budget, or downstream sender health remains the real bottleneck.

UberInbox therefore plans against observed constraints rather than marketing language. An `unlimited` claim without a numeric slot observation remains `UNKNOWN` and is not converted into infinity.

The current canonical capacity primitive is still mailbox inventory because that is what the provider and UberDoso contracts can measure directly. However, UberInbox explicitly carries an unknown-unknown research hypothesis that **reputation-isolated usable sending capacity** may be the better primitive. That hypothesis must earn promotion from observed operations.

## Inputs

- canonical owner-confirmed outreach domains
- canonical existing mailbox inventory
- fresh provider-capacity observations
- provider terms compatibility
- API-provisioning support
- numeric mailbox-slot ceilings
- known mailbox unit cost
- optional provider per-domain and monthly-volume ceilings
- founder budget and requested additional capacity

## Outputs

- provider/domain allocations
- bounded provisioning batches
- estimated monthly cost
- remaining requested capacity
- rejected providers and exact blockers
- rejected domains and exact blockers
- unknown-capacity providers
- unknown-unknown questions and blind spots

Every batch requires separate explicit owner authorization and provider receipts before external execution.

## Unknown-unknown discovery

UberInbox composes the repository's existing `unknown-unknown-mining.mjs` instead of creating another discovery engine. It currently tests an explicit ontology hypothesis:

> Should reputation-isolated sending capacity replace raw mailbox count as the primary capacity primitive?

This remains `HYPOTHESIS_ONLY`. The system must reject the hypothesis if observed operations show raw mailbox count predicts usable governed capacity better after controlling for provider, domain, reputation, warmup, placement, throughput, and budget constraints.

Blind-spot dimensions include mailbox count, throughput, domain density, IP reputation, warmup, placement, terms, billing, DNS automation, and exportability.

## Hard boundaries

UberInbox must fail closed when provider evidence is stale or materially future-dated, ownership is unverified, terms are not explicitly compatible, API provisioning is not observed, slot capacity is not numeric, or unit cost is unknown. It reuses UberDoso's current per-domain mailbox policy ceiling and does not create contact or send authority.

Provisioning, purchases, provider writes, DNS changes, warmup, placement claims, live sends, and any provider-policy exceptions belong to separate authorized execution and evidence layers.

## Verification status

The branch carries hostile tests for provider evidence freshness, unknown unit cost, budget ceilings, provider slot ceilings, domain ownership, canonical root-domain enforcement, per-domain density, provider binding, bounded batches, and unknown-unknown blind spots. GitHub-hosted verification must still execute successfully before these tests count as passing evidence; a workflow that fails before running steps is infrastructure non-evidence rather than a source verdict.
