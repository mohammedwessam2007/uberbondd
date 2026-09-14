# UberInboxes capacity decision — 2026-09-14

## Objective

Turn the existing two owned roots into the largest evidence-backed mailbox fleet that can later feed UberWarm and the governed sender mesh. This document is a dated decision receipt, not a permanent provider endorsement.

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

## DigitalOcean eliminated as UberDoso SMTP host

DigitalOcean's current documentation says SMTP ports 25, 465 and 587 are blocked on all Droplets. Therefore creating a DigitalOcean Droplet does not remove the UberDoso outbound SMTP bottleneck and would add spend without satisfying the mission. Do not provision a Droplet for this purpose unless DigitalOcean's policy changes and fresh evidence is captured.

Source:

- https://docs.digitalocean.com/support/why-is-smtp-blocked/

## Architecture consequence

The self-hosted UberDoso topology retains its conservative eight-mailbox-per-root policy. Provider-managed UberInboxes is a different capacity class and may use a higher density only when a fresh provider profile explicitly supports it. `src/uberinboxes-scale-profiles.mjs` implements that distinction.

## Remaining external cut

Software now has:

1. provider-neutral mailbox provisioning adapters,
2. explicit spend/approval gates,
3. idempotent provisioning,
4. provider inventory reconciliation,
5. a 200-mailbox Azure fleet compiler,
6. UberWarm health/ramp/quarantine,
7. sender routing, suppression, reply handling and cold-send safety.

The remaining physical cut is provider custody: an Icemail account/API key, a live provider quote/payment, domain connection/DNS authority, provider-created mailbox receipts, warm-up/health evidence, and outreach authorization. No repository commit can manufacture these external facts.

## Number discipline

- Physically verified live cold capacity before provider activation: **0/day**.
- Evidence-backed Icemail Azure topology envelope on the two current roots: **1,000 cold/day**.
- This becomes an operational number only after provider inventory, authentication, warm-up, health, placement and authorization evidence make the mailboxes eligible.
