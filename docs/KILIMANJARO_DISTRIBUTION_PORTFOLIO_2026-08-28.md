# Kilimanjaro — Distribution portfolio red team

Date: 2026-08-28
Issue: #77

## Decision

UberBond should not have one growth channel. The first bounded portfolio should use **five motions with different failure modes**:

1. governed cold email;
2. high-intent services marketplaces;
3. agency/CRM/vertical-software partner motion;
4. product-led diagnostic/audit;
5. inbound SEO/AEO/local-intent content.

Paid media stays off until a real offer has positive cleared contribution economics. Referral loops become high priority only after a real accepted customer exists. Agent/plugin ecosystems are a research/distribution option, not a substitute for buyer evidence.

## Scorecard

Scores are 0–5 ordinal judgements from current mechanics/evidence. They are not forecast conversion rates.

| Motion | Speed to first buyer evidence | Low cash cost | Repeatability | Platform independence | Compliance/control | Attribution | Current readiness | Verdict |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| Governed cold email | 5 | 4 | 4 | 3 | 3 | 5 | 5 | **TOP 5 / bounded activate only with authority** |
| Upwork / service marketplaces | 4 | 4 | 3 | 2 | 4 | 5 | 3 | **TOP 5** |
| Agency / CRM / white-label partners | 3 | 4 | 5 | 3 | 4 | 5 | 2 | **TOP 5** |
| Product-led diagnostic / audit | 3 | 5 | 5 | 5 | 5 | 5 | 4 | **TOP 5** |
| SEO / AEO / useful inbound content | 2 | 5 | 5 | 4 | 5 | 4 | 3 | **TOP 5** |
| Google/local-business ecosystem | 3 | 5 | 4 | 2 | 5 | 4 | 2 | attach to client/inbound strategy |
| Referral loop | 4 after customer | 5 | 5 | 5 | 5 | 5 | 0 now | **LOCKED: needs accepted customer** |
| Paid search/social | 4 | 1 | 4 | 2 | 4 | 5 | 1 | **DEFER: no proven CAC ceiling** |
| Communities/directories | 2 | 5 | 2 | 2 | 3 | 3 | 2 | opportunistic, not core |
| Agent/plugin ecosystems | 2 | 4 | 4 | 2 | 4 | 3 | 1 | research / product distribution later |

## 1. Governed cold email

**Current economics.** Instantly's July 2026 published plans place the software layer at $47/$97/$358 per month before mailboxes/domains/data and operating effort. That means the transport software is affordable but not evidence that messages land, buyers reply, or revenue clears.

**Why it survives.** UberBond already has the hard control-plane pieces: public-contact provenance, qualification, suppression/unsubscribe, sender-health checks, mailbox caps, business windows, message reservation/idempotency, uncertain-outcome handling, reply classification and authority gates. A cold-email attempt can be linked to prospect → reply → meeting → offer → provider-cleared payment instead of counting sends as success.

**Failure modes.** Reputation damage, bad lists, legal/privacy mistakes, duplicate sends, mailbox/provider suspension, domain burn, founder attention on replies, and optimizing copy instead of economic outcomes.

**Kill conditions.** Any canonical deliverability/authority gate denies; source provenance becomes unknown; unsubscribe/complaint/bounce state is unreadable; provider outcome is uncertain; or a bounded experiment cannot show enough buyer signal to justify its all-in resource cost. No threshold is invented here: the live deliverability policy owns those numbers.

## 2. High-intent marketplaces

**Current economics.** Upwork is currently free to join; paid Freelancer/Agency Plus is $19.99/month. Proposals use Connects ($0.15 each for additional Connects), and freelancer service fees range from 0–15% per contract. The platform therefore trades margin and platform dependence for visible buyer intent and payment/dispute infrastructure.

**Why it survives.** Unlike cold prospecting, a marketplace job is explicit demand. It is useful for first-payment evidence even if it never becomes the long-run scale channel.

**Failure modes.** Fee drag, proposal labor, race-to-the-bottom competition, platform policy/account risk, weak customer ownership and one-off project mix.

**Kill conditions.** Net contribution after platform fees and founder/proposal minutes is worse than the next channel; jobs cannot be scoped into the canonical ServiceSKU/acceptance contract; or marketplace demand consistently selects bespoke work that cannot become reusable recurring delivery.

## 3. Agency / CRM / vertical-software partners

**Current economics.** HighLevel's current agency pricing is $97 Starter, $297 Unlimited and $497 Pro. The $497 Pro tier includes SaaS Mode, white labeling, API access and rebilling; HighLevel explicitly describes SaaS Mode as a way to resell subscriptions and automatically create client accounts. This is proof that an agency-reseller/white-label operating model is a live market structure, not proof UberBond should buy it now.

**Why it survives.** A partner can already own trust, distribution and vertical account access while UberBond supplies a narrow evidence-backed mechanism. This can reduce founder prospecting and multiply one integration across many end customers.

**Failure modes.** Revenue share, partner concentration, slow enablement, support escalation, white-label opacity, bad-fit customers, platform lock-in and the partner becoming the customer-data gatekeeper.

**Kill conditions.** No attributable partner-sourced pipeline after a bounded test; support burden grows faster than contribution; partner terms obscure customer/payment/acceptance truth; or one partner exceeds the channel concentration ceiling.

## 4. Product-led diagnostic / audit

**Mechanism.** A prospect or inbound user receives a bounded evidence-based diagnostic, gap map or revenue-recovery proof packet. The product demonstrates the diagnosis before asking them to buy execution.

**Why it survives.** UberBond already has website evidence capture, deterministic audits, prospect scoring, offer compilation, opportunity/economic lineage and a Lead OS surface. This motion reuses the strongest existing software and can produce a shareable artifact without an external model/provider call if run deterministically.

**Failure modes.** Free-tool tourists, expensive evidence collection, generic recommendations, diagnostic results not mapping to an executable offer, or a report that exposes sensitive prospect data.

**Kill conditions.** Diagnostic completion does not produce a qualified next step; evidence collection cost/founder time exceeds the expected commercial value; or a finding cannot be tied to a specific measurable ServiceSKU outcome.

## 5. SEO / AEO / useful inbound content

**Current platform facts.** Google says SEO helps search engines understand content and users find a site but explicitly says there is no secret that guarantees first position. Google Search supports structured data for local businesses, organizations, software apps and other entities. Google Business Profiles can be added/claimed at no charge for eligible businesses and surface on Search/Maps.

**Why it survives.** It is slow but compounds, has low marginal distribution cost and reduces dependence on outbound providers. The content should be evidence pages, calculators, diagnostic tools, implementation guides and vertical proof—not AI filler.

**Failure modes.** Long time-to-signal, content volume vanity, algorithm changes, weak commercial intent and duplicated/generic material.

**Kill conditions.** Pages are produced without a query/buyer-intent thesis; attribution cannot distinguish qualified organic demand; freshness decays; or content production consumes founder/model budget without measurable qualified outcomes over an appropriately long observation window.

## Motions deliberately held back

### Referral loop — unlock after first accepted customer

This is potentially the best long-run channel because trust and customer outcome travel together, but today UberBond has zero accepted customers. A referral program before a customer is a diagram, not a channel.

### Paid media — no cash until a CAC ceiling exists

Google Ads lets the advertiser choose an average daily budget and CPC/target strategy, and actual daily spend can vary while a monthly charging limit is enforced. That controllability does not solve the important problem: UberBond currently has no real conversion, gross-margin or retention distribution from which to derive a defensible CAC ceiling.

Activation gate: at least one offer must have provider-cleared revenue, measured delivery/support cost, and a repeat/retention observation sufficient to set a bounded loss limit. Until then the allocated paid-media budget is **$0**.

### Agent/plugin ecosystem — later product distribution

OpenAI's current Plugin directory is the discovery layer for plugins that can package apps/skills; app submissions are accepted and Apps SDK/MCP experiences can be published subject to review. This is a legitimate future software-distribution surface. It is not yet the fastest path to a home-service buyer or first managed-service payment.

## Pre-proof portfolio allocator

Allocate **distribution work units**, not dollars, until economic truth exists:

| Motion | Share of bounded distribution effort |
|---|---:|
| Governed cold email | 30% |
| Marketplaces | 25% |
| Partner/white-label research + enablement | 20% |
| Product-led diagnostic | 15% |
| SEO/AEO/inbound proof pages | 10% |
| Paid media | 0% cash |
| Referral | 0% until customer exists |

Rules:

- no channel may exceed 35% of new-pipeline dependence once three channels have enough data to compare;
- the allocator consumes only verified channel outcomes; a send, pageview, proposal or partner conversation is not revenue;
- channel-level contribution includes platform fees, data/telecom, refunds, support and founder minutes;
- a platform outage/account restriction is a channel-risk event, not a business failure;
- if only one channel has evidence, remain diversified in preparation but do not fabricate weights for the others.

## Missing software capabilities

The current code has a fail-closed distribution channel registry/allocator, but its strongest state is correctly blocked until cleared-payment outcomes exist. The missing activation surfaces are narrower:

1. **Marketplace evidence adapter** — manually/provider-imported job/proposal/contract/payment IDs into canonical lineage without scraping or private-data inference.
2. **Partner/referral graph** — partner identity, agreement/authority reference, referred opportunity/customer, revenue share and attributable payment/retention.
3. **Inbound content outcome adapter** — page/query/source → qualified event → offer/payment lineage, with source freshness.
4. **Channel cost ledger** — platform fees, Connects/data/telecom/ad spend and founder minutes attached to the same outcome identity.
5. **Portfolio concentration guard** — blocks capital allocation when a channel exceeds policy or its evidence is stale/contradictory.

These should reuse existing commercial outcome and capital-allocation primitives rather than create a second attribution system.

## Current source register — accessed 2026-08-28

- Instantly plans: https://help.instantly.ai/en/articles/10273259-instantly-plans-overview
- Upwork 2026 pricing: https://www.upwork.com/resources/is-upwork-free
- Upwork freelancer service fees: https://support.upwork.com/hc/en-us/articles/211062538-Learn-about-the-Freelancer-Service-Fee
- HighLevel pricing: https://www.gohighlevel.com/pricing
- HighLevel Agency Pro: https://help.gohighlevel.com/support/solutions/articles/48001180534
- Google SEO Starter Guide: https://developers.google.com/search/docs/fundamentals/seo-starter-guide
- Google Search appearance/structured data: https://developers.google.com/search/docs/appearance
- Google Business Profile: https://support.google.com/business/answer/7039811
- Google Ads budget/bids: https://support.google.com/google-ads/answer/2375454
- OpenAI plugin/app distribution: https://help.openai.com/en/articles/11487775/
- OpenAI Apps SDK/submission: https://help.openai.com/en/articles/12515353-build-with-the-apps-sdk.iso

## Terminal truth

`ISSUE_77_DISTRIBUTION_PORTFOLIO_COMPLETE__PAID_MEDIA_AND_REFERRALS_EVIDENCE_GATED`

This portfolio specifies what to test and how to stop. It authorizes no outreach, account creation, submission or spend.