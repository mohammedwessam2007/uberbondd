# UberInboxes capacity decision — 2026-09-14

## Objective

Turn the existing two owned roots into the largest evidence-backed mailbox fleet that can later feed UberWarm and the governed sender mesh, while preserving lead quality. This document is a dated decision receipt, not a permanent provider endorsement.

## Current owned roots

- `uberbond.agency`
- `uberbond.cloud`

## Provider evidence observed on 2026-09-14

### Icemail Azure

Official Icemail documentation states that Azure is its high-volume mailbox class, supports up to 100 mailboxes per domain, and caps each mailbox at 10 messages/day split as 5 cold + 5 warm. With the two owned roots this yields a provider-advertised topology envelope of:

- 200 mailboxes total
- 1,000 cold messages/day theoretical provider envelope
- 2,000 total messages/day including warm traffic

Sources:

- https://help.icemail.ai/en/articles/54-%F0%9F%93%AC-faqs-mailbox-management-in-icemailai
- https://icemail.ai/pricing

Pricing evidence conflicts slightly: the pricing page observed $29/domain/month while the help article reported $30/domain/month. UberBond therefore must obtain a live provider quote before any purchase and must not silently pick either value as cleared spend truth.

### Icemail SMTP

Official Icemail documentation states up to 10 SMTP mailboxes per domain and up to 50 messages/day per mailbox. The documentation does not establish that all 50 may be cold outreach, so UberBond records 1,000 total messages/day across the two roots but leaves cold capacity UNKNOWN until a provider-specific cold limit is observed.

## Sovereign mailbox layer added

`src/ubermail-foundry.mjs` now compiles 100 founder-alias accounts per owned root, 200 identities total, for an owned Stalwart Community deployment. This removes the assumption that UberBond must pay a mailbox SaaS merely to create mailbox identities. Identity capacity remains separate from reputation/egress capacity.

## Egress truth layer added

`src/uberegress-topology.mjs` now admits only fresh, authorized, terms-compatible, observed-capacity egress. It supports self-hosted direct-MX and authorized SMTP-relay routes. Multiple roots sharing one route do not multiply its capacity. Unknown egress contributes zero.

## Quality-preserving governor added

`src/uberquality-capacity-governor.mjs` computes one daily maximum as the minimum of ready mailbox, domain, egress, recipient-provider, high-quality lead inventory, and campaign ceilings. It fixes the lead-quality floor first and never lowers it to fill infrastructure.

If the system can carry 1,000/day but only 620 leads clear the quality floor, the correct maximum is 620/day while discovery/enrichment/verification searches for more qualifying opportunities.

## DigitalOcean eliminated as UberDoso SMTP host

DigitalOcean's current documentation says SMTP ports 25, 465 and 587 are blocked on all Droplets. Therefore creating a DigitalOcean Droplet does not remove the UberDoso outbound SMTP bottleneck and would add spend without satisfying the mission. Do not provision a Droplet for this purpose unless DigitalOcean's policy changes and fresh evidence is captured.

Source:

- https://docs.digitalocean.com/support/why-is-smtp-blocked/

## Architecture consequence

The self-hosted UberDoso topology retains its conservative eight-mailbox-per-root policy. Provider-managed UberInboxes and sovereign mailbox identity virtualization are distinct capacity classes and may use higher identity density only without pretending identity density creates reputation.

## Number discipline

- Physically verified live cold capacity before real egress/auth/warm-up observations: **not established by repository evidence**.
- Evidence-backed Icemail Azure topology envelope on the two current roots: **1,000 cold/day**.
- Current software target for quality-preserving operation: **up to 1,000/day**, but the runtime must calculate `min(mailbox, domain, egress, recipient, high-quality-leads, campaign-ceiling)` from observed evidence.
- Scaling beyond 1,000/day requires evidence that a real bottleneck widened; it must never come from lowering lead quality, inventing reputation, or evading provider/recipient controls.
