# UberBond Autonomous Agent Mesh V1

This package adds four bounded primitives aimed directly at the founder-absence goal:

1. `agent-autonomy-loop.mjs` — a finite GPT ↔ UberBond ↔ Claude work graph. Either model may request a typed follow-up from the other. Every session has hard round/task/token limits, duplicate-loop detection, founder-action caps, and a strict business-effect zero ledger.
2. `ai-compute-budget.mjs` — separates **AI compute budget** from **business-world spend authority**. Paid model usage can be bounded and provider-allowlisted without granting authority to send, deploy, buy, change DNS, mutate production, or spend commercial capital.
3. `agent-model-router.mjs` — evidence-weighted model routing by task class, quality, reliability, latency, economic impact, cost efficiency, and benchmark confidence, with a bounded exploration rate for new models.
4. `founder-absence-readiness.mjs` — an explicit architecture/live/evidence gate for overnight, multi-day, and "Kilimanjaro" owner absence.

## Why this exists

The existing relay proved a persisted task can be claimed and completed unattended. The next architecture requirement is not another one-shot bridge; it is a finite autonomous work conversation:

`GPT research → Claude engineering → GPT review → Claude repair → GPT re-review → DONE / dispute / owner boundary`

Claude may also originate `RESEARCH_REQUIRED`; GPT may originate `ENGINEERING_REQUIRED` or `REPAIR_REQUIRED`. UberBond remains the state machine and applies loop/budget/authority limits.

## Typed coordination actions

Safe autonomous follow-ups:

- `RESEARCH_REQUIRED` → ChatGPT
- `ENGINEERING_REQUIRED` → Claude Code
- `REVIEW_REQUIRED` → ChatGPT
- `REPAIR_REQUIRED` → Claude Code

Bounded stop states:

- `DONE`
- `DISPUTE_REQUIRED`
- `SHADOW_REQUIRED`
- `CANARY_REQUIRED`
- `ECONOMIC_TEST_REQUIRED`
- `OWNER_REVIEW_REQUIRED`
- `BLOCKED_EXTERNAL`

The second group never silently becomes an external action.

## Important truth boundary

This does **not** claim a live OpenAI worker exists today, a scheduler is firing, customer acquisition is autonomous, or revenue is autonomous. It builds and tests the orchestration socket that can connect those workers when credentials/provider adapters/authority are available.

No synthetic agent result may imply real revenue. The morning summary explicitly labels commercial revenue, customer acquisition, and production promotion as `NOT_INFERRED`.

## Compute versus business spend

The old zero-effect relay is intentionally conservative. A future always-on GPT worker, however, may need paid inference. `ai-compute-budget.mjs` creates a separate bounded ledger for model compute while keeping `businessEffectAuthority: NONE`.

This is a capability separation, not an authorization bypass. A provider adapter must still be explicitly authorized and must report actual compute usage before paid inference can be promoted.

## Kilimanjaro gate

`founder-absence-readiness.mjs` checks:

- durable state
- scheduler
- agent relay
- agent workers
- bounded budgets
- stale recovery
- truth receipts
- kill switch
- payment observation
- delivery observation
- owner escalation queue

`KILIMANJARO_READY` requires every capability to be `VERIFIED_LIVE`, evidence-backed, and externally verified where live-world proof is relevant.

That status cannot be earned from tests alone.
