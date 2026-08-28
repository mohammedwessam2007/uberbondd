# UberBond Distribution Capability Reference Map

Research snapshot: 2026-08-28.

Purpose: map external distribution/software patterns to UberBond capabilities without creating clone soup or copying incompatible code.

**Law:** product/repository popularity is maturity/context evidence, not revenue proof. Public source availability does not grant reuse rights. AGPL, fair-code, source-available, mixed, or license-uncertain code is `REFERENCE_ONLY` unless separately reviewed. Even permissive reuse requires an explicit code/license review and attribution decision.

## Open/public repository references

| Reference | Observed public surface | UberBond absorption target | Current UberBond state | Decision |
| --- | --- | --- | --- | --- |
| `n8n-io/n8n` | workflow automation, integrations, AI/tool orchestration | connector manifest ideas, webhook/event integration patterns | durable task/queue/agent/provider contracts already exist | `REFERENCE_ONLY`; do not build a second workflow engine |
| `activepieces/activepieces` | AI/workflow connectors and tool packaging | connector packaging and integration ergonomics | canonical provider boundaries already exist | `REFERENCE_ONLY` |
| `chatwoot/chatwoot` | omnichannel support inbox, live chat, email/WhatsApp conversation lifecycle | conversation routing, provider receipts, support lifecycle | `omnichannel-communication-contract.mjs` plus inbound/operator escalation | `INTEGRATE_OR_REFERENCE` |
| `novuhq/novu` | notification orchestration across multiple channels | channel-neutral notification events and preferences | omnichannel + outreach/send-safety | `INTEGRATE_OR_REFERENCE` |
| `gitroomhq/postiz-app` | social publishing/scheduling | publication scheduling and provider-specific posting patterns | social schedule composes canonical scheduler + omnichannel contract | `REFERENCE_ONLY`; observed AGPL-3.0 |
| `mautic/mautic` | lifecycle campaigns, segmentation, nurture | lifecycle trigger/segment patterns | outreach, lead operations, task universe | `REFERENCE_ONLY` |
| `knadh/listmonk` | mailing lists/newsletters/campaign state | mailing-list segmentation and campaign lifecycle | canonical outbound/suppression/send-safety already exist | `REFERENCE_ONLY` |
| `dubinc/dub` | link attribution and partner/referral measurement patterns | durable attribution identity from exposure through payment | distribution and commercial-learning layers exist; control plane adds portfolio reasoning | `REFERENCE_ONLY_OR_INTEGRATE` |
| `PostHog/posthog` | analytics, experiments, replay, flags, observability | experiment/holdout measurement and behavioral evidence | commercial learning + monitoring already exist | `REFERENCE_ONLY_OR_INTEGRATE` |
| `growthbook/growthbook` | experimentation/feature decisions | transparent experiment assignment and measurement | experiment identity belongs in canonical distribution envelope | `REFERENCE_ONLY_OR_INTEGRATE` |
| `calcom/cal.com` | scheduling/booking lifecycle | availability, booking, reschedule/cancel receipts | `booking-calendar-contract.mjs` | `INTEGRATE_OR_REFERENCE` |
| `formbricks/formbricks` | forms/surveys/feedback | structured intake/feedback references | `form-feedback-contract.mjs` | `INTEGRATE_OR_REFERENCE` |
| `documenso/documenso` | commercial-document signature lifecycle | signature request/provider evidence | `commercial-signature-contract.mjs` | `REFERENCE_ONLY` unless license review approves another mode |
| `twentyhq/twenty` | CRM/account lifecycle | external CRM object identities and conflict-safe synchronization | `external-crm-sync-contract.mjs` | `INTEGRATE_OR_REFERENCE`; UberBond truth remains canonical |
| `apify/crawlee` | reliable public web crawling patterns | bounded crawl budgets, retry/cursor behavior, source policy | `browser-crawler.mjs` + `web-context-extraction-contract.mjs` | `REFERENCE_ONLY_OR_ADAPTER` |
| `firecrawl/firecrawl` | agent-oriented web search/crawl/extract API | scalable context-extraction adapter pattern | web extraction contract exists | `REFERENCE_ONLY`; do not vendor core code automatically |
| `plausible/analytics`, `umami-software/umami` | privacy-oriented web analytics | low-friction owned-surface measurement | attribution/learning integration surface | `REFERENCE_ONLY_OR_INTEGRATE` |
| `discourse/discourse` | community/forum lifecycle | community distribution and response workflows | channel family exists; provider-specific integration remains external | `REFERENCE_ONLY_OR_INTEGRATE` |

Current GitHub metadata observed during this mission confirms, among other things, that n8n describes itself as a fair-code workflow platform with 400+ integrations, Chatwoot describes an omnichannel support desk, Postiz describes agentic social scheduling and reports AGPL-3.0, Dub describes link attribution, and PostHog describes analytics/experiments/observability. These descriptions are repository-owner claims and are used only to map capability surfaces.

## Proprietary/reference product families

The following are clean-room feature references, not source-code targets:

| Family | Reference products | Capability UberBond should own or integrate |
| --- | --- | --- |
| B2B data/targeting | Apollo-style systems | persona/account/contact filters, saved audiences, provenance, dedupe, lawful source evidence |
| enrichment | Clay-style systems | bounded enrichment waterfalls, cost ceilings, freshness/confidence, contradiction preservation |
| email sales engagement | Instantly/Smartlead-style systems | sender/mailbox/domain health, sequencing, pacing, replies, suppression, reservation/idempotency, provider receipts |
| intent/account intelligence | 6sense/Common Room-style systems | intent evidence, account signals, audience expansion; never permission inference |
| lookalikes | Ocean-style systems | bounded candidate generation and similarity evidence |
| hygiene | Hunter/ZeroBounce-style systems | contact/delivery confidence, bounce evidence, suppression and provenance |
| CRM/sales | HubSpot/Salesforce/Pipedrive-style systems | lifecycle synchronization while UberBond retains canonical commercial truth |
| partner/affiliate | PartnerStack/Impact-style systems | partner identity, attribution, commission basis only after canonical cleared payment |
| social | Buffer/Hootsuite/Postiz-style systems | publication schedule, platform policy, content refs, provider receipts, public engagement evidence |
| SEO/content | Ahrefs/Semrush-style systems | topic/keyword/link evidence, content opportunity ranking, owned-surface measurement |
| landing/forms | Unbounce/Typeform-style systems | conversion surfaces, structured intake and feedback; form fields cannot manufacture payment/acceptance truth |
| analytics/experiments | GA/PostHog/GrowthBook-style systems | holdouts, treatment identity, funnel measurement, attribution confidence, outcome learning |
| community | Discourse/Circle-style systems | community publishing/listening/referral workflows under platform policy |
| marketplaces | app/service marketplaces | listing/evidence/lead flow adapters; platform terms and provider receipts required |
| paid media | Google/Meta/LinkedIn ad systems | campaign preparation, budget/cost receipts, incrementality/holdout evidence; disabled until explicit budget authority and positive measured economics |

## Canonical UberBond distribution stack

Rather than cloning each product wholesale, UberBond composes:

`market evidence -> opportunity/offer -> audience/provenance -> enrichment -> eligibility -> channel portfolio -> experiment/holdout -> consequence gate -> provider adapter -> external receipt -> inbound/response -> booking -> commercial commitment -> cleared payment -> accepted delivery -> renewal/expansion -> attribution -> commercial learning -> reallocation`

Existing provider-neutral contracts already cover outbound, inbound, voice, omnichannel, browser action, booking, CRM sync, web extraction, receivables, forms, signatures, social scheduling and accounting export.

`src/distribution-control-plane.mjs` is the higher portfolio layer: it consumes trusted commercial-learning economics, enforces safety and concentration gates, allows bounded preparation-only exploration of unproven low-consequence channels, and leaves all external execution disabled.

## What remains external

No clean-room architecture can prove:

- a sender/domain is healthy in production;
- a platform/provider account is authorized or usable;
- a real audience wants the offer;
- paid media is profitable;
- a partner will distribute;
- a customer paid, accepted delivery, renewed or referred others;
- UberBond is objectively in a stated global percentile.

Those claims require durable external receipts and real comparative evidence.
