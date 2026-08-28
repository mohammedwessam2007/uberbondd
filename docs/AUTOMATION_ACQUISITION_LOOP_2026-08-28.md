# UberBond automation capability acquisition loop — 2026-08-28

## Objective

Continuously reduce founder work while increasing lawful, risk-adjusted recurring contribution profit by acquiring only automation capabilities that are genuinely missing from UberBond.

This is not a mandate to vendor or clone every popular repository. UberBond already has canonical queueing, workflow/agent orchestration, outbound, CRM-like lifecycle state, payment truth, delivery/acceptance, learning, evidence capture, recovery, authority gates, and audit receipts. A second workflow engine would increase maintenance and ambiguity rather than autonomy.

The acquisition loop therefore follows:

`observe current main -> discover public automation repositories -> map to canonical capability coverage -> penalize overlap/license/maintenance/effect risk -> select one bounded gap -> build adapter/contract -> hostile test -> review -> whole-tree gate -> merge -> repeat`

No candidate repository can grant customer-contact, provider-call, spend, purchase, deploy, credential, DNS, KYC, payment, or production-mutation authority.

## Dated GitHub observations

Metadata was observed from GitHub on 2026-08-28. Star counts and push times are freshness/maturity signals only; they are not evidence of revenue or suitability. `NOASSERTION` means the GitHub repository metadata did not provide a reliable SPDX conclusion for this observation, so UberBond must not automatically copy that repository's code into core.

| Repository | Observed use | GitHub license metadata | UberBond disposition |
| --- | --- | --- | --- |
| `livekit/agents` | real-time voice agent lifecycle | Apache-2.0 | build a provider-neutral voice/telephony adapter contract; keep live transport gated |
| `pipecat-ai/pipecat` | voice/multimodal pipeline patterns | BSD-2-Clause | co-reference for provider-neutral voice event design |
| `browser-use/browser-use` | AI browser task execution | MIT | later build a consequence-gated browser action boundary separate from evidence-only crawling |
| `chatwoot/chatwoot` | omnichannel inbox/support lifecycle | NOASSERTION | API/reference adapter only until license/terms review |
| `novuhq/novu` | email/SMS/inbox notification routing | NOASSERTION | API/reference adapter only; suppression/consent remains canonical |
| `twentyhq/twenty` | AI-oriented CRM lifecycle | NOASSERTION | external CRM sync adapter only; do not replace UberBond's internal truth store |
| `firecrawl/firecrawl` | web search/crawl/context extraction | AGPL-3.0 | API/process boundary or reference only; no core code copy |
| `n8n-io/n8n` | broad workflow/integration ecosystem | NOASSERTION | reference connector taxonomy only; UberBond already has canonical orchestration |
| `activepieces/activepieces` | AI/MCP workflow integrations | NOASSERTION | reference connector packaging only; no second orchestration plane |
| `windmill-labs/windmill` | scripts/webhooks/workflows/UIs | NOASSERTION | reference runtime/operator patterns only |
| `mautic/mautic` | marketing lifecycle automation | NOASSERTION | reference segmentation/trigger patterns; canonical send safety dominates |
| `PostHog/posthog` | analytics/experiments/replay/observability | NOASSERTION | reference event/experiment patterns; measurements cannot become commercial truth |

## What UberBond is actually lacking

### P0 — provider-neutral real-time voice and telephony lifecycle

Current source has evidence capture and inbound classification but no canonical telephony/voice capability. This blocks a truthful implementation of AI receptionist, missed-call recovery, call qualification, transfer, and voice-originated booking workflows.

Required next increment:

- provider-neutral call event envelope;
- restart-stable call occurrence identity and dedupe;
- minimal durable metadata by default, excluding raw phone/audio/transcript payloads;
- explicit distinction between `CALL_OBSERVED`, `CALL_CONNECTED`, `CALL_MISSED`, `SMS_ELIGIBLE`, `TRANSFER_REQUESTED`, `BOOKING_REQUESTED`, and provider-confirmed consequences;
- all live answer/call/SMS/transfer/booking actions disabled until canonical authority and provider-adapter gates are satisfied;
- provider receipt required for external truth.

### P1 — consequence-gated browser action automation

UberBond can crawl and capture evidence. That is not equivalent to acting inside arbitrary web applications. A browser action runtime could remove founder minutes from repetitive authorized back-office workflows, but it must be isolated from the evidence crawler and fail closed around irreversible or uncertain effects.

### P1 — omnichannel conversation transport

UberBond already has inbound classification, escalation, outbound safety, and support/delivery state. What remains is a provider-neutral transport adapter across chat/SMS/inbox channels with consent, suppression, idempotency, and provider delivery receipts.

### P1 — live calendar/booking execution

The capability registry already marks calendar routing/booking as adapter-gated/research-only. Build the provider adapter; do not invent `BOOKED` from an internal intent or form submission.

### P1 — external CRM synchronization

UberBond already owns its commercial truth. External CRM integration should be a synchronization adapter, never a replacement ledger. External writes need stable object identity, conflict handling, replay safety, and scoped authority.

### P2 — scalable web context extraction, lifecycle marketing, analytics/experiments

These are useful but substantially overlap existing evidence capture, outbound automation, commercial learning, and control-tower functions. Prefer provider/API adapters and reusable patterns rather than importing whole platforms.

## Selection result

The first dated acquisition tournament selects `voice-reception-and-call-lifecycle` as the highest-value uncovered capability family. `livekit/agents` and `pipecat-ai/pipecat` are independent public references for the missing design surface, but neither is automatically vendored. The next engineering loop should implement the smallest canonical voice/telephony contract in UberBond itself and bind any future live provider behind the existing provider-adapter and activation/consequence boundaries.

## Proof requirements

A capability is not merged merely because its external analogue is popular. Each increment requires syntax proof, focused hostile tests, mutation evidence when practical, exact-diff review, and a trustworthy whole-tree gate before merge. Hosted CI infrastructure failures remain infrastructure failures rather than source green evidence.

`lite/` is outside this acquisition loop unless separately justified.
