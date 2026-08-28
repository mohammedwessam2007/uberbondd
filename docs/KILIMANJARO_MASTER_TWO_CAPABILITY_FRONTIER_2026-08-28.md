# Kilimanjaro — Master-Two shared capability frontier

Date: 2026-08-28
Issue: #76

## Answer first

If UberBond is allowed to master only **two shared capability families** first, they are:

1. **Commercial Truth Spine** — identity/account/contact graph + canonical event envelope + lifecycle state + consent/suppression/preferences + durable idempotency/queue/audit + payment/delivery/outcome lineage.
2. **Governed Conversation & Trigger Engine** — trigger eligibility + conversation state machine + templates/knowledge + scheduling/calendar semantics + approval/authority recheck + channel-adapter contract for SMS/email/voice/review requests.

These two families are not two new systems. They are a consolidation rule over capabilities that already exist across the current canonical registry and revenue/outreach/autonomy code. The frontier says where every new business feature should attach.

## Why these two

The canonical opportunity registry already names shared primitives such as `opportunity-registry`, `commercial-experiment-engine`, `revenue-outcome-graph`, `commercial-memory`, `consequence-boundary` and `durable-queue`. The capability graph separately records payment truth, durable queue, deliverability guard, outcome lineage, commercial learning and adapter contracts as tested capabilities. The ten-offer automation bundle independently collapses into five mechanism families rather than ten standalone agencies.

The two families above are the intersection:

- the **Truth Spine** answers *who/what happened, under what authority, and did it lead to money/acceptance?*;
- the **Conversation & Trigger Engine** answers *when is a communication/action eligible, through which bounded channel, and what state does the dialogue move to?*

Everything else in the ten-offer bundle is mostly a policy/template/integration over those two.

## Capability × ten-offer matrix

Legend: `C` = core dependency, `A` = attach/extension, `—` = not central.

| Capability atom | Voice | Missed call | Reviews | Lead follow-up | Re-engage | Reminders | Cold outreach | CRM | Dashboard | Estimate follow-up |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Identity/contact/account lifecycle | C | C | C | C | C | C | C | C | C | C |
| Canonical commercial event envelope/router | C | C | C | C | C | C | C | C | C | C |
| Consent/suppression/preferences + authority | C | C | C | C | C | C | C | C | A | C |
| Durable idempotency/lease/retry/dead-letter | C | C | A | C | C | C | C | C | A | C |
| Conversation/lifecycle state machine | C | C | A | C | C | A | C | A | — | C |
| Trigger eligibility compiler | C | C | C | C | C | C | C | A | — | C |
| Channel adapter contract | C | C | C | C | C | C | C | A | — | C |
| Calendar/appointment semantics | A | A | — | A | A | C | — | A | A | A |
| Estimate/quote state adapter | — | — | — | A | A | — | — | A | A | C |
| Outcome/revenue/acceptance lineage | C | C | C | C | C | C | C | C | C | C |
| Audit/provenance/contradiction receipt | C | C | C | C | C | C | C | C | C | C |
| Proof/economic dashboard | A | A | A | A | A | A | A | A | C | A |

The matrix makes the frontier obvious: identity/event/authority/outcome are nearly universal; the next broadest layer is trigger/conversation/channel execution. A separate custom CRM, separate reminder engine, separate re-engagement system and separate estimate-follow-up product would duplicate the same state transitions.

## Weighted build-distance graph

Distance is architectural distance from current canonical main, not calendar time and not a vendor quote.

| Node | Current state | Distance | Unlock |
|---|---|---:|---|
| Durable queue / idempotency / recovery | implemented and heavily regression-tested | 0 | every asynchronous workflow |
| Consequence / deliverability / suppression boundary | implemented, live outbound still gated | 0–1 | every communication workflow |
| Payment / delivery / commercial outcome lineage | implemented, real transactions absent | 0–1 | economic truth across every offer |
| Identity/account lifecycle + event normalization | distributed across current revenue/outreach/commercial primitives | 1 | all ten offers; should be the shared internal contract |
| Trigger eligibility + conversation state | substantial primitives exist; vertical policy still needed | 1 | at least seven offers directly |
| Email transport | machinery exists; external authorization/credentials gated | 1 external | lead follow-up, re-engagement, reminders, outreach, estimates |
| SMS/telephony transport | adapter contract exists; provider/number/authorization external | 2 external | voice, missed call, reminders, estimates |
| Vertical CRM/PMS/FSM adapters | no universal live provider grant | 2–3 external | authoritative customer/job/estimate/appointment state |
| Voice-agent runtime | model/telephony components available externally, not yet proven for UberBond | 3 | voice receptionist only, plus optional call qualification |
| Generic custom CRM/dashboard rebuild | technically buildable but commercially substitutable | high opportunity cost | little unique economic unlock |

## Top five capabilities by marginal economic unlock

1. **Canonical event + identity lifecycle.** Every other automation needs an authoritative subject and event. It is also the key to deduping activity and attributing results.
2. **Consent/suppression/preferences + consequence gate.** A capability that cannot know whether it may act is not safely reusable. This unlocks communications without widening authority.
3. **Trigger eligibility + conversation state.** Converts many offers from bespoke scripts into policy over one state machine.
4. **Outcome/revenue/acceptance lineage.** Converts activity into evidence about whether the automation actually created retained economic value.
5. **Provider/vertical adapter boundary.** The shared code becomes useful only when it can read authoritative job, appointment, quote, call and payment state without credential sprawl.

## Top five capabilities by founder-minute reduction

1. **Event-driven triggers instead of manual checking** — removes inbox/CRM/calendar polling.
2. **Durable queue + lease/retry/dead-letter + uncertain-outcome semantics** — removes manual babysitting and unsafe retries.
3. **Identity/state reconciliation** — removes duplicate-account and stale-state cleanup.
4. **Reusable conversation sequences with suppression/approval baked in** — removes bespoke follow-up composition per workflow.
5. **Receipt-derived economic dashboard + escalation** — replaces manual reconciliation with a bounded owner action queue.

## BUILD / BUY / PARTNER / DEFER

### BUILD — UberBond-owned truth

- canonical identity/account/contact references;
- commercial event envelope and deterministic event identity;
- consent/suppression/preferences normalization;
- trigger eligibility and authority recheck;
- conversation/lifecycle state machines;
- durable queue, idempotency, conflict, retry and uncertain-outcome handling;
- outcome/payment/delivery/acceptance lineage;
- audit/provenance/contradiction receipts;
- economic learning and routing based only on verified outcomes.

These are the control plane and economic memory. Outsourcing them would outsource UberBond's truth.

### PARTNER / BUY — commodity transports and systems of record

- telephony/SMS carrier and phone numbers;
- email mailbox transport;
- voice-model/TTS/STT infrastructure;
- calendar infrastructure;
- customer's existing FSM/PMS/CRM where authoritative job/appointment/estimate state already lives;
- payment provider;
- generic dashboard rendering/BI if a customer already owns one.

UberBond should integrate and reconcile these, not recreate Twilio/Google Calendar/Jobber/NexHealth/Shopmonkey/HighLevel-class infrastructure.

### DEFER

- greenfield generic CRM;
- standalone generic dashboard product;
- custom voice receptionist rollout before a bounded buyer/quality test;
- broad enrichment/discovery spend before one vertical and one acquisition motion show positive cleared contribution;
- any provider adapter whose terms/credential/budget are not explicitly authorised.

## Duplicate capability families to consolidate

The dangerous duplicates are conceptual, even where separate modules are legitimate:

- `externalEffectLedger` and `businessEffectLedger` must remain two historical shapes over one normalized meaning, not drift into two definitions of zero effect;
- CRM/contact/prospect/lead identifiers must resolve into one identity boundary rather than per-offer identities;
- reminder, lead-follow-up, re-engagement and estimate-follow-up should not each grow a separate scheduler/retry engine;
- review request, outreach, reminder and estimate messaging should share the same suppression/authority/channel gate;
- payment, delivery and acceptance must feed one commercial outcome lineage rather than separate success counters;
- dashboards should read receipts and lineage rather than create their own truth.

## Frontier implication for the vertical winner

For urgent home services, the Master-Two sequence is:

`authoritative call/lead/estimate event → identity + consent + durable event → trigger eligibility → governed conversation → booking/estimate/payment state → outcome lineage → receipt/economic learning`

That single path can express missed-call recovery, lead follow-up, reminders, estimate follow-up, review request and re-engagement without six independent products.

## Terminal truth

`ISSUE_76_MASTER_TWO_COMPLETE__TRUTH_SPINE_PLUS_GOVERNED_CONVERSATION_ENGINE`

The software frontier is an architecture/economic-reuse conclusion. External provider access, customer system access and real buyer outcomes remain evidence gates rather than implied completion.