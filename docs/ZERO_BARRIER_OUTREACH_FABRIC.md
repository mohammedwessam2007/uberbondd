# UberBond Zero-Barrier Outreach Fabric

Date: 2026-09-16

## Purpose

Turn the remaining outreach bottleneck into explicit interchangeable resources without weakening the existing 100,000-send launch certificate or pretending that software creates external capacity.

The existing SMTP 100K certificate remains authoritative for the current one-button SMTP launch. Alternate channels and future protocols are additive and may not silently redefine that contract.

## Implemented in this wave

### UberSwarm edge fabric

`src/uberswarm-edge-fabric.mjs`

Admits only owner-authorized or explicitly consented devices with fresh evidence, supported platforms, capacity and thermal headroom. Deceptive enrollment is rejected. It schedules internal compute fragments only and grants no messaging, deployment, spend or network-relay authority.

### UberMail Exchange

`src/ubermail-capacity-exchange.mjs`

Compiles explicitly delegated, terms-compatible outbound-capacity offers into a spot-capacity view. Open relays, residential-IP evasion, disposable identity rotation, stale evidence and duplicate route capacity are rejected. Capacity evidence does not grant send authority.

### UberAttention canary

`src/uberattention-protocol.mjs`

Implements recipient-issued attention permits and structural request matching. This is a post-SMTP research/runtime canary. A matched permit is not delivery authority and cannot make the existing SMTP 100K certificate green.

### UberReach universal transport

`src/uberreach-universal-transport.mjs`

Routes opportunities across legitimate reachable endpoint classes: email, web contact, Matrix, ActivityPub, Nostr, XMTP, business APIs and recipient attention APIs. A reachable endpoint is not contact authority or outcome proof.

### UberGrant zero-cost resource registry

`src/ubergrant-zero-cost-registry.mjs`

Compiles only resources for which eligibility and allowed use are verified. Fake accounts/projects, identity misrepresentation and automatic application are explicitly rejected.

### UberZero substitution engine

`src/uberzero-substitution-engine.mjs`

Makes each infrastructure substitution state its scarce resource, maturity, remaining external dependencies, hard physical bounds and falsifier. Mechanisms requiring policy evasion, false evidence or unauthorized resources are invalid.

### Canonical 100K evidence hardening

`src/outreach-100k-launch-contract.mjs`

The launch certificate rejects duplicate domain, mailbox, egress-route and recipient-provider evidence, rejects unknown numeric usage instead of coercing it to zero, requires dry-run to be explicitly disabled, requires global outbound to be explicitly resumed, and requires a future campaign-authorization expiry. These are truth hardenings, not new send authority.

### Zero-barrier composition

`src/outreach-zero-barrier-fabric.mjs`

Composes the above systems around the canonical SMTP launch certificate. It keeps alternative economic reach explicitly separate from the SMTP 100K certificate.

## Preserved donor ideas

1. owned-device P2P edge swarm
2. permissioned DePIN / sovereign gateways
3. portable or zero-knowledge reputation research
4. JIT provisioning donor, with disposable-identity rotation rejected
5. legitimate idle capacity / relay market
6. recipient-side inversion APIs
7. attention staking / economic anti-spam research
8. federated alternate channels
9. institutional credit harvesting donor, rewritten to verified legitimate eligibility only

No useful donor capability is deleted merely because an unsafe or non-credible mechanism is rejected.

## What this does not prove

This source wave does not establish:

- 100,000 eligible live recipients
- 100,000/day authenticated transport capacity
- provider approval for the exact traffic category
- domain or mailbox reputation health
- recipient-provider budgets
- inbox placement
- response rate or revenue
- a live owned-device swarm
- DePIN availability
- recipient adoption of UberAttention
- external grants/credits
- a production SMTP-capacity marketplace

Those remain external evidence or future implementation gates.

## Today equation

The existing SMTP path remains bounded by:

`MIN(eligible inventory, sender+egress capacity, recipient-provider capacity, campaign authority, remaining dispatch-window capacity)`

UberSwarm can reduce compute cost. UberMail Exchange can aggregate legitimate delegated transport. UberGrant can reduce infrastructure cost. UberReach/UberAttention can reduce dependence on SMTP for a separate economic-reach objective. None may counterfeit a missing term in the SMTP equation.

## Safety and sovereignty law

Route around cost, centralization and obsolete assumptions. Never route around truth, consent, provider policy, suppression, or external-effect authority.
