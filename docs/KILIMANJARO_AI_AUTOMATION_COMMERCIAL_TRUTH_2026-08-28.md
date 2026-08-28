# Kilimanjaro — Commercial truth for the ten AI-automation offers

Date: 2026-08-28
Issue: #74
Truth rule: the owner-supplied $14,750/month bundle remains `CREATOR_CLAIM`. This report does not convert displayed creator prices, vendor feature pages, case studies, or software subscription prices into proof that a buyer will pay UberBond.

## Executive finding

All ten mechanisms have current live-software evidence. None has current UberBond transaction evidence. The strongest near-term service mechanisms are **estimate follow-up**, **missed-call text-back**, **lead follow-up/re-engagement**, and **appointment reminders**, because they attach to observable commercial events and can reuse one identity/CRM/consent/conversation spine. Voice receptionist has a real low-level cost market but materially greater reliability, disclosure, telephony and support burden. Full custom CRM and standalone custom dashboard are the weakest things to build from scratch because mature software already bundles those surfaces for a small fraction of the creator-post prices.

## Pricing-confidence table

| Offer | Current first-party comparison | What the comparison proves | Service-price confidence | Recommendation |
|---|---|---|---|---|
| AI Voice Receptionist | Retell AI pay-as-you-go: $0.07–$0.31/minute; HighLevel Voice AI has a $0.045/min voice-engine component plus TTS/model/phone charges, or AI Employee plans at $50/$97 per enabled location subject to plan limits/fair use | Real infrastructure exists and unit cost can be metered | LOW | RESEARCH_MORE |
| Missed Call Text-Back | HighLevel documents an automatic missed-call text-back feature; HighLevel core platform is $97/$297/$497 per month plus telecom usage | The trigger and automation are standard live product behavior | LOW-MEDIUM | BUILD |
| Review Management | NiceJob Reviews is $75/month; HighLevel includes online reputation management and Reviews AI, with Reviews AI pay-per-use at $0.01/review outside plans | Recurring review monitoring/request/response workflow is a paid category | LOW-MEDIUM | BUILD as bundle component |
| Lead Follow-Up | HighLevel core plans include CRM, pipelines, unified conversations, email/SMS and workflow automation at $97/$297/$497 | Follow-up is a commodity platform capability, not evidence for a $1,500/mo standalone service | LOW | BUILD shared automation, not bespoke stack |
| Customer Re-Engagement | HighLevel workflow/email/SMS automation; Jobber Plus explicitly markets customer re-engagement via Marketing Suite | Re-engagement is a recurring lifecycle workflow sold inside operating systems | LOW | BUILD shared lifecycle primitive |
| Appointment Reminders | Calendly Standard $10/seat/month includes automations/reminders; Jobber documents automated visit reminders | Reminder mechanics are mature and inexpensive | LOW | BUILD, bundle rather than sell as exotic AI |
| Cold Outreach | Instantly Outreach currently lists Growth $47/mo, Hyper Growth $97/mo and Light Speed $358/mo in its July 2026 help material, with warmup, scheduling, analytics and block lists | The software layer is real and highly commoditized; deliverability remains an operating constraint | LOW-MEDIUM for software, LOW for service WTP | BUILD as governed distribution capability |
| Full Backend CRM | HighLevel: $97/$297/$497 with unlimited contacts/users and CRM/pipelines; Jobber and Housecall Pro provide vertical operating systems | A greenfield generic CRM has heavy competitive substitution | MEDIUM that software is cheap; LOW that custom CRM merits creator price | REJECT as standalone greenfield build; integrate/reuse |
| Custom Dashboard | AgencyAnalytics is $20/client/month billed annually with unlimited reports/dashboards and 85+ integrations; HighLevel includes custom dashboards/reporting | Generic reporting is commoditized; premium value would have to come from proprietary economic truth/integration | MEDIUM | RESEARCH_MORE standalone; BUILD as proof surface |
| Estimate Follow-Up | Jobber documents automatic quote email/text follow-ups and quote reminders; Housecall Pro Basic starts at $59/mo annually and includes estimates, invoicing, scheduling, payments and review management | Quote/estimate state is a live, recurring field-service workflow and naturally links to won/lost revenue | MEDIUM for mechanism, LOW for UberBond price | BUILD |

## Ten evidence dossiers

### 1. AI Voice Receptionist — RESEARCH_MORE

**Direct evidence.** Retell sells AI voice agents on pay-as-you-go economics and publishes metered call, TTS, model, telephony and add-on costs. HighLevel separately sells Voice AI inside an agency operating stack and publishes both plan and component pricing.

**Delivery model.** Phone number/SIP/telephony → voice engine/TTS/model → knowledge/function tools → CRM/calendar actions → transcripts/analytics → fallback/escalation.

**Recurring trigger.** Every inbound call, after-hours call, overflow call or explicitly authorised outbound call.

**Support burden.** HIGH relative to the other nine: latency, call routing, hallucinated commitments, knowledge freshness, accents/noise, telephony failures, recording/disclosure rules, escalation, booking conflicts and customer-specific scripts.

**Unit-cost envelope.** Measurable and usage-linked, which is good for margin control; final gross margin is UNKNOWN until real call volume, support minutes and sale price exist.

**Expansion.** Missed-call recovery, appointment booking, qualification, callback, CRM update, reminders.

**Contradiction to creator claim.** A $2,500/month displayed price is not validated by infrastructure costing cents per minute. A managed service could still be worth materially more than infrastructure; this research does not establish how much.

### 2. Missed Call Text-Back — BUILD

**Direct evidence.** HighLevel's current support documentation explicitly describes automatic SMS after a missed call and even warns that repeated missed calls can generate repeated SMS without workflow controls.

**Delivery model.** Missed-call event → identity/suppression/consent check → dedupe/cooldown → bounded text → reply capture → CRM state → escalation/booking.

**Recurring trigger.** Every eligible missed inbound call.

**Support burden.** LOW-MEDIUM: telecom deliverability, opt-out, duplicate-call suppression, timezone/business-hour policy, number reputation and reply routing.

**Economics.** Core logic is cheap; telecom is usage-based. The economic value is not proven until a missed-call cohort produces attributable appointments or revenue.

**Expansion.** Lead follow-up, booking, reminders, estimate follow-up and re-engagement use the same messaging/identity spine.

### 3. Review Management — BUILD as bundle component

**Direct evidence.** NiceJob sells a $75/month Reviews product with automated review requests/follow-up reminders, monitoring, widgets and sharing. HighLevel also bundles reputation management and has explicit Reviews AI pricing.

**Delivery model.** Completed-service/customer event → eligibility → review request → monitoring → response draft/approval where consequential → escalation → coverage dashboard.

**Recurring trigger.** Every completed eligible customer interaction and every new review.

**Support burden.** LOW-MEDIUM, but public replies are consequential and must remain approval/gate controlled.

**Economics.** Mature point solutions cap standalone software value; UberBond should attach review operations to delivery/retention rather than pretend response generation alone is a premium moat.

### 4. Lead Follow-Up — BUILD shared automation

**Direct evidence.** HighLevel's paid core explicitly combines CRM/pipelines, unified conversations, email/SMS, booking and workflow automation.

**Delivery model.** Lead event → provenance/identity → authority/suppression → stage-specific sequence → reply/booking/outcome → attribution.

**Recurring trigger.** New lead, no reply, stage age, booked/not-booked state, estimate state or explicit customer event.

**Support burden.** MEDIUM because bad state, stale authority or incorrect suppression can turn automation into spam.

**Economics.** Platform competition means the defensible value is verified outcome lineage and vertical execution, not possession of a sequencer.

### 5. Customer Re-Engagement — BUILD shared lifecycle primitive

**Direct evidence.** HighLevel sells lifecycle messaging/workflows; Jobber Plus explicitly includes a Marketing Suite for re-engaging customers.

**Delivery model.** Dormant/eligible cohort → consent/suppression → reasoned trigger → message/offer draft → response → booking/payment attribution.

**Recurring trigger.** Service interval, inactivity window, seasonal need, unfinished quote, lapsed plan or known replenishment cycle.

**Support burden.** MEDIUM: segmentation quality, consent, frequency caps and avoiding irrelevant contact matter more than copy generation.

### 6. Appointment Reminders — BUILD

**Direct evidence.** Calendly Standard is $10/seat/month billed annually and includes automations/reminders; Calendly documents automated email/SMS reminder workflows. Jobber documents automated visit reminders in field service.

**Delivery model.** Confirmed appointment → channel consent → timed reminder/reconfirmation → change/no-show state → optional reschedule flow.

**Recurring trigger.** Every booked eligible appointment.

**Support burden.** LOW-MEDIUM: timezones, calendar drift, cancellations/reschedules, channel opt-out and stale appointments.

**Economics.** Cheap, mature capability. Best sold inside a broader revenue-ops bundle where no-show recovery is measured.

### 7. Cold Outreach — BUILD as governed distribution capability

**Direct evidence.** Instantly's July 2026 plan documentation lists Growth $47/month, Hyper Growth $97/month and Light Speed $358/month and includes warmup, sequences, scheduling, analytics, block lists and increasing send/contact limits.

**Delivery model.** Lawful sourced prospect → provenance/fit → contact verification → authority/suppression → message approval/personalization → mailbox pacing → replies/bounces/complaints → attribution.

**Recurring trigger.** Explicitly authorised campaign schedules only.

**Support burden.** HIGH because sender/domain health, list quality, privacy/compliance, unsubscribe, reputation and inbox placement can dominate copy quality.

**Economics.** Software cost is transparent but domains/mailboxes/data and operator time remain real. No deliverability or revenue outcome should be inferred from send capacity.

### 8. Full Backend CRM — REJECT as standalone greenfield build

**Direct evidence.** HighLevel offers CRM/pipelines, unlimited contacts/users and broad sales/marketing capability from $97/month. Jobber and Housecall Pro provide more verticalised operating systems.

**Why reject the standalone interpretation.** Rebuilding generic CRM CRUD, tasks, contacts and pipeline screens does not create a strong economic moat when those are already bundled cheaply. UberBond should preserve its canonical economic/evidence graph and integrate with whichever system a customer already uses.

**What still deserves BUILD.** UberBond's own internal canonical identity, opportunity, event, payment, delivery and proof spine because that is the truth substrate across integrations.

### 9. Custom Dashboard — RESEARCH_MORE standalone; BUILD proof surface

**Direct evidence.** AgencyAnalytics charges $20/client/month billed annually for unlimited reports/dashboards, users, data sources, API, alerts, white label and 85+ integrations. HighLevel also bundles custom dashboards/reporting.

**Recurring trigger.** Every new verified operational/economic event and scheduled reporting window.

**Support burden.** MEDIUM: integrations break, metrics drift and dashboards become dangerous if freshness/provenance are hidden.

**Defensible version.** A dashboard that proves cleared contribution economics, contradictions, source freshness and causal lineage is more valuable than generic charts. Buyer willingness to pay for that remains unknown.

### 10. Estimate Follow-Up — BUILD

**Direct evidence.** Jobber's August 2026 automation docs explicitly support automatic email/text quote follow-ups after a configurable number of days. Jobber's quote approval path links quote → client approval/deposit → job. Housecall Pro includes estimates, invoicing, scheduling, payments and review management from a $59/month annual Basic plan.

**Delivery model.** Sent estimate → awaiting response → timed eligible follow-up → reply/change/approve/reject/expire → job/payment attribution.

**Recurring trigger.** Every outstanding eligible estimate.

**Support burden.** LOW-MEDIUM if the service reads authoritative estimate state and refuses stale/conflicting records.

**Why strongest.** It sits directly between a known commercial request and a won/lost outcome, reuses the same identity/messaging/CRM spine as five other offers, and is less technically/regulatorily complex than voice. That makes it the best current wedge to challenge first, not proof that it will sell.

## Contradiction table

| Claim/intuition | Current evidence | Resolution |
|---|---|---|
| The posted prices total $14,750/mo, therefore the bundle is worth $14,750/mo | Mature software covers many mechanisms for tens or hundreds of dollars monthly plus usage | Keep every posted number `CREATOR_CLAIM`; service willingness-to-pay is unproven |
| AI makes voice cheap, so voice is automatically the best margin offer | Infrastructure is cheap and metered, but voice carries telephony/reliability/disclosure/support risk | Research/pilot before prioritising |
| CRM/dashboard should be premium standalone builds | HighLevel, AgencyAnalytics, Jobber and Housecall Pro commoditize broad parts of both | Reuse/integrate; sell outcome/proof, not CRUD/charts |
| Missed-call/estimate follow-up are too simple to matter | Major operating platforms ship those workflows because they map to real commercial state | Treat simplicity as a deployment advantage; still require outcome evidence |
| Cold outreach software equals distribution success | Instantly sells capacity, warmup and controls, not guaranteed replies/revenue | Keep delivery and economic proof separate |

## Opportunity dedupe

Do not mint ten new businesses. Preserve the existing five mechanism families already recorded in `AI_AUTOMATION_SERVICE_BUNDLE_2026-08-22.md`:

1. conversation + lead response;
2. reputation operations;
3. commercial system of record;
4. decision intelligence;
5. distribution.

The first six conversational offers plus estimate follow-up share one lifecycle/communications spine. Review management is an adjacent event-driven module. CRM is substrate/integration, not a separate greenfield company. Dashboard is a proof/reporting surface. Cold outreach is a governed acquisition channel that can also become a client service only after legal/authority gates.

## Source register — accessed 2026-08-28

First-party/current sources:

- Retell AI pricing: https://www.retellai.com/pricing
- HighLevel pricing: https://www.gohighlevel.com/pricing
- HighLevel missed-call text-back: https://help.gohighlevel.com/support/solutions/articles/48001239140
- HighLevel AI product pricing, updated 2026-08-21: https://help.gohighlevel.com/support/solutions/articles/155000006652
- HighLevel AI usage limits, updated 2026-08-24: https://help.gohighlevel.com/support/solutions/articles/155000007813-ai-usage-limits
- HighLevel reputation management: https://www.gohighlevel.com/online-reputation-management-software
- NiceJob pricing: https://get.nicejob.com/pricing
- Calendly pricing: https://calendly.com/pricing
- Calendly automations/reminders, updated 2026-08-20: https://calendly.com/learn/calendly-workflows
- Instantly plans overview, updated 2026-07-17: https://help.instantly.ai/en/articles/10273259-instantly-plans-overview
- Instantly outreach plan comparison, updated 2026-07-13: https://help.instantly.ai/en/articles/7920548-email-outreach-plans-comparison
- AgencyAnalytics pricing: https://agencyanalytics.com/pricing
- Jobber automations, updated 2026-08-06: https://help.getjobber.com/en/articles/automations/
- Jobber quote approvals, updated 2026-08-11: https://help.getjobber.com/en/articles/quote-approvals/
- Jobber pricing: https://www.getjobber.com/pricing/
- Housecall Pro pricing: https://www.housecallpro.com/pricing/
- Housecall Pro estimates, updated 2026-07-22: https://help.housecallpro.com/en/articles/1185469-how-to-create-an-estimate

## Terminal truth

`ISSUE_74_RESEARCH_COMPLETE__BUYER_AND_TRANSACTION_PROOF_STILL_EXTERNAL`

This closes the requested current-market reconstruction. It does **not** establish a winning vertical, a sale price, a customer, cleared revenue or delivery acceptance.