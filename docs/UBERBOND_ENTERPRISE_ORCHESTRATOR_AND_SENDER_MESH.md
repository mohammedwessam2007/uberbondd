# UberBond Enterprise Orchestrator + Sender Infrastructure Mesh

## Decision

Absorb the useful mechanisms from Braze and Customer.io into the existing UberBond Distribution OS rather than cloning another standalone marketing-automation product.

The implementation boundary is deliberately narrow:

- `src/enterprise-journey-orchestrator.mjs` compiles bounded event-driven journeys into a reference-only graph that must execute through UberBond's canonical durable scheduler and omnichannel communication contract.
- `src/sender-infrastructure-mesh.mjs` allocates authenticated, warm, policy-approved sender infrastructure for healthy capacity and traffic-class isolation. It explicitly refuses identity/reputation/block/quota evasion.

These modules create no live communication authority.

## Market mechanisms worth absorbing

Braze/Customer.io-class orchestration contributes:

- event-triggered journeys;
- profile/audience segmentation and exit conditions;
- delays and conditions;
- multiple message channels;
- webhooks as reusable configured actions;
- frequency/rate limits;
- conversion goals;
- experiments;
- channel coordination;
- message-state observability.

UberBond already has durable scheduling, omnichannel commands/events, suppression, social-publication scheduling, outbound sequencing, payment/delivery truth and distribution attribution. Therefore this layer must compose those systems instead of creating a second workflow runtime.

## Sender Infrastructure Mesh

The safe/useful version of a domain and IP mesh is a reputation-aware capacity allocator, not a reputation-reset machine.

Allowed uses:

- separate transactional and marketing traffic;
- allocate among truthful sending domains belonging to the same organization;
- route through provider-approved shared or dedicated pools;
- gradual warm-up;
- capacity balancing;
- maintenance and provider failover;
- pause unhealthy nodes;
- measure domain/IP reputation and complaint/spam signals;
- require SPF, DKIM, DMARC, rDNS, TLS and alignment;
- require one-click unsubscribe readiness for marketing traffic;
- preserve a stable sender identity.

Prohibited design objective:

- rotating domains or IPs to evade spam reputation, provider blocks, complaints, quotas, enforcement or recipient suppression.

If a sending node is blocked, degraded or over the hard reputation threshold, UberBond pauses it. It does not select a fresh identity to continue the same traffic.

## Current external guidance encoded into the design

Google's current sender requirements require authentication and infrastructure hygiene, with bulk senders requiring SPF, DKIM and DMARC, aligned From domains, TLS, valid forward/reverse DNS, and one-click unsubscribe for relevant marketing/subscribed messages. Google recommends keeping user-reported spam below 0.1% and preventing it from reaching 0.3% or higher.

Customer.io documents shared and dedicated IP pools and currently requires at least 50,000 emails/week for a dedicated IP because low-volume dedicated IPs can perform unpredictably. Its transactional pool is deliberately separated from normal marketing traffic.

Braze's current IP-warming guidance emphasizes small initial sends, gradual volume ramp, engaged audiences and monitoring rather than identity churn.

## Journey execution law

A compiled journey is not permission to communicate.

At each due action, execution must still pass:

`journey occurrence -> current audience/profile state -> current suppression/consent -> current communication/platform policy -> current authority receipt -> sender-health/capacity allocation -> canonical omnichannel command -> provider adapter -> provider receipt -> canonical event fold`

Cold outreach continues to route through UberBond's canonical outreach engine rather than this customer-lifecycle journey compiler.

## Next capability sequence

1. Integrate the journey compiler with the durable scheduler as a plan-only occurrence expander.
2. Integrate the Sender Infrastructure Mesh with existing sender-health and outbound safety data.
3. Add provider-neutral configured webhook references.
4. Add per-profile frequency and per-channel rate-limit state.
5. Add journey conversion/goal attribution through the existing distribution/economic graph.
6. Add traffic-class isolation for transactional versus marketing email.
7. Add provider adapters only after credentials, terms, budget and consequence authority are explicit.

## Economic purpose

The target is not 'more messages'. The orchestrator should eventually optimize channel, timing, sender infrastructure and journey path using trusted downstream evidence:

`cleared contribution / founder minute`

Until real payment, delivery acceptance, variable cost and founder-minute receipts exist, allocation remains preparation/operational optimization rather than proof of ROI.
