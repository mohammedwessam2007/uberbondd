# UberEgress + quality-preserving outreach capacity

## Purpose

UberBond must maximize high-quality outreach, not raw message count. Nominal inbox count is not capacity and low-quality lead inventory must never be used to fill unused sender slots.

The canonical daily ceiling is therefore:

```text
QUALITY_PRESERVING_DAILY_MAX = min(
  observed_ready_mailbox_capacity,
  observed_ready_domain_capacity,
  observed_ready_egress_capacity,
  observed_recipient_provider_budget,
  high_quality_verified_unsuppressed_lead_inventory,
  campaign_daily_ceiling
)
```

Unknown dimensions contribute zero. Capacity may be widened only by improving a real bottleneck or producing more opportunities that still clear the fixed quality floor.

## UberMail Foundry

`src/ubermail-foundry.mjs` compiles 100 founder-alias accounts per currently owned root, 200 identities total, for an owned Stalwart Community deployment. The accounts are aliases of the founder and do not fabricate employees/personas.

The foundry distinguishes mailbox identity capacity from delivery/reputation capacity. Creating 200 or 20,000 local accounts does not create cold-send authority or independent sender reputation.

Stalwart Community is used as the current open-source reference backend because its official documentation exposes account management through JMAP, supports local mailbox protocols, and supports outbound MX and relay routing. These are replaceable implementation capabilities rather than a permanent vendor dependency.

## UberEgress

`src/uberegress-topology.mjs` recognizes two legitimate egress classes:

- `SELF_HOSTED_DIRECT_MX`
- `AUTHORIZED_SMTP_RELAY`

A direct-MX route only counts when fresh evidence shows authorization, compatible terms, READY state, a numeric observed cold-send cap, outbound port 25 reachability, static public IP, PTR, and TLS readiness.

An SMTP relay only counts when fresh evidence shows authorization, compatible terms, READY state, relay authentication, provider readiness, and a numeric observed cold-send cap.

Multiple domains sharing one egress route do not multiply that route's capacity. The route is counted once. This prevents topology theater from turning aliases into fake throughput.

## Quality preservation

`src/uberquality-capacity-governor.mjs` fixes the quality floor before calculating volume. By default it requires:

- `safeForOutreach === true`
- a verified/safe/owner-confirmed contact route
- no suppression or unsubscribe
- no active cooldown
- quality score >= 0.82
- at most one contact per account per day unless policy explicitly widens the account-density ceiling

Adding lower-quality leads cannot increase the maximum. If only 620 opportunities clear the quality floor while infrastructure can carry 1,000, UberBond sends at most 620 and asks discovery/enrichment/verification to manufacture more qualifying opportunities. It does not lower the threshold.

## Current planning envelope

Fresh Icemail Azure evidence captured elsewhere in PR #868 provides a dated two-root provider topology envelope of 200 mailboxes and 1,000 cold messages/day. That remains a useful planning benchmark, not live evidence.

The sovereign software path can reproduce the mailbox identity/account-management layer without per-mailbox SaaS licensing. It cannot manufacture the physical reputation-bearing egress evidence required to promote the planning number into observed live capacity.

## Safety and provider law

UberBond does not treat account multiplication, source-IP rotation, relay failover, subdomains, free tiers, trials, quota boundaries, billing boundaries, or recipient filtering as obstacles to evade. Scaling is allowed only through independently authorized, terms-compatible, observable capacity.

The optimization target is qualified conversations and contribution profit per unit of sender reputation, not maximum emitted SMTP traffic.
