# Infinite Opus Work / Astra terminal activation handoff — 2026-09-30

## Authority

This handoff starts only after current main is refreshed. It may configure private credentials and browser-local cockpit settings, but it must not invent Crown evidence, expose secrets, weaken quality gates, or spend beyond an explicit founder authorization.

## Canonical architecture

The active cockpit is now:

`TypingMind -> UberBond OpenAI-compatible gateway -> ubermind/auto -> governed OpenRouter runtime key -> Frontier VM/JEV -> task-class Crown -> proof ledger`.

TypingMind does **not** need a direct OpenRouter inference key in the canonical architecture. The older `uberbond-typingmind-8` route is preserved as an archived fallback and should be disabled/not created unless a future explicit instruction reactivates it.

Canonical provider exposure is one inference key:

- `uberbond-runtime-20`: USD 20/month hard key limit, monthly reset, BYOK counted.
- protected runtime Crown reserve: at least USD 15.
- member guardrail `uberbond-global-28` remains a cross-key catastrophe backstop.
- expected canonical key-limited inference exposure: USD 20, not USD 28.

## Work / Astra execution order

1. Refresh main and read this file plus `config/infinite-opus-work-astra-activation-v1.json`.
2. In OpenRouter, create or verify `uberbond-runtime-20` with exact USD 20 monthly limit. Do not create a new direct TypingMind inference key. If an old UberBond `uberbond-typingmind-8` exists, leave it disabled/revoked after preserving its non-secret receipt.
3. If automated management reconciliation is desired, create/use a Management API key privately and obtain the non-secret member ID. Verify `uberbond-global-28` at USD 28/month and verify there are no unexpected active UberBond inference keys.
4. Store the runtime inference secret only in Render as `OPENROUTER_API_KEY`. Never paste it into Git, committed files, receipts, or normal chat.
5. Rotate the cockpit bearer atomically because the current Render bearer is present but not recoverable here: generate a fresh random >=48-character token, set it in Render as `UBERMIND_TYPINGMIND_GATEWAY_TOKEN`, and use the same secret only in the TypingMind custom model Authorization header.
6. Configure TypingMind custom model:
   - name: UberMind Auto
   - model ID: `ubermind/auto`
   - endpoint: `https://uberbond-control-plane.onrender.com/api/typingmind/infinite-opus/v1/chat/completions`
   - header: `Authorization: Bearer <private gateway token>`
   - context length: 64,000 tokens as the cockpit hint; UberBond's 300,000-byte request cap remains authoritative.
   - maximum output: 8,192 tokens. This is only a ceiling; routing/budget logic still reserves the requested amount and queues rather than silently downgrading quality.
   - support system role: on.
   - streaming output: on. UberBond emits delayed-final streaming only, so unreviewed Builder tokens never leak.
   - plugins/tools: off.
   - image input: off.
   - thinking/reasoning UI toggle: off; UberBond controls reasoning/routing behind the gateway.
   Do not import/directly select Opus/Sol/MiMo as the canonical cockpit route.
7. Restart/deploy Render after secret changes and verify `/api/typingmind/infinite-opus/v1/models` accepts the bearer and still reports live-not-ready until paid authorization and Crown admission exist. This is expected and performs zero inference.
8. Ask the founder for the one required paid consent before the first provider call: maximum USD 0.05 transport/billing canary. Do not infer consent from setup authority.
9. Mint the bounded monthly runtime authorization only after explicit owner approval, using `config/infinite-opus-runtime-authorization.template.json` and `scripts/infinite-opus-runtime-authorization-mint.mjs`. The receipt itself performs no spend.
10. Run the existing MiMo canary with maximum USD 0.05 and reconcile the observed OpenRouter generation/bill/key usage. Canary success grants **zero semantic Crown authority**.
11. Run a fresh sealed GENERAL_CROWN tournament under an independent Work/Astra custodian. Keep raw hidden prompts/answers outside Git. At least two hidden GENERAL_CROWN tasks must be run for both Opus 5.5 and the admitted challenger, with provider billing/model identity observed and zero required regressions. Produce the private evidence JSON expected by `scripts/infinite-opus-crown-tournament-adjudicate.mjs`.
12. If and only if the adjudicator reports Opus 5.5 as the supported GENERAL_CROWN candidate, bind a real Opus tournament call's provider/billing/model evidence into `config/infinite-opus-crown-call-evidence.template.json` and run `scripts/infinite-opus-crown-admission-mint.mjs`.
13. Set the resulting non-secret Crown receipt as `INFINITE_OPUS_CROWN_ADMISSION_JSON` and the owner-approved runtime receipt as `INFINITE_OPUS_PAID_AUTHORIZATION_JSON` on Render.
14. Deploy/restart Render. Verify the models endpoint reports live readiness. Then make one bounded `ubermind/auto` cockpit request, reconcile all provider calls and costs, and preserve the first real workload receipt.
15. Feed repeated real task-class observations into the durable context/franchise graduation path. Do not claim 33,333x production compression until real matched reference + observed all-in receipts settle it.

## Hard stop conditions

Stop without workaround on secret leakage, unexpected active inference keys, model/provider identity drift, uncertain charge, bill mismatch, failed sealed evidence, Crown admission refusal, quality regression, or Render/TypingMind bearer mismatch.

## Current truth at handoff

Before this handoff, the production runtime and worker are live and the gateway bearer is present, but the runtime OpenRouter inference key, paid-authorization receipt and Crown-admission receipt are absent. The source has already executed the 2,352,942-consumer zero-provider-call E3 benchmark, but its 33,333.345x economics remain a benchmark/counterfactual capacity result rather than production-observed compression.


## Receipt-grade economics continuation added after live v23b

Current live source before the private Work/Astra phase: `fe54841b7933b03c7edf6d55efe8a742316f8d62`.

After Crown admission and before claiming any production multiplier:

16. Open a Cognitive Capital campaign through the admin surface with every applicable all-in cost class declared up front. Missing required classes must block closure.
17. For each real recurring task that can become E0–E4, compile and admit an exact task-bound direct-frontier reference contract. The contract must use verified tokenization and the cheapest legitimate current direct route, crediting batch, prompt cache, response cache and retry economics where applicable.
18. Let the production E3/E0–E4 hot path execute. The runtime appends provable execution receipts only when the exact reference contract matches the task and current quality contract.
19. Reconcile provider bills and add any other observed runtime/platform costs. Never use the USD 30 envelope itself as observed spend. Evidenced zero-cost receipts are allowed only for cost classes that are genuinely zero.
20. Close the Cognitive Capital campaign. If any receipt, proof, cost class or denominator is missing, the audit must remain blocked and the campaign must stay open. Only a successful finite audit may populate the production realized multiplier.

Admin surfaces now available:
- `GET /api/admin/infinite-opus/activation` — redacted activation state, zero inference.
- `GET|POST /api/admin/infinite-opus/references` — exact task-bound reference contracts.
- `GET|POST /api/admin/infinite-opus/capital-campaigns` — campaign state.
- `POST /api/admin/infinite-opus/capital-campaigns/cost` — observed all-in cost receipts.
- `POST /api/admin/infinite-opus/capital-campaigns/asset` — additional certified capital assets.
- `POST /api/admin/infinite-opus/capital-campaigns/close` — receipt-grade audit and closure.

Current economic truth:
- executed benchmark-capacity multiplier: **33,333.345×**;
- production realized multiplier: **UNKNOWN**;
- do not promote benchmark/counterfactual capacity into a production savings claim.
