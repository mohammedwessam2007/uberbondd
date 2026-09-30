> **SUPERSEDED FOR CANONICAL UBERMIND ON 2026-09-30:** The direct TypingMind OpenRouter-key path below is preserved as historical/fallback lineage only. Current authority is `docs/INFINITE_OPUS_WORK_ASTRA_HANDOFF_2026-09-30.md`: TypingMind uses the UberBond `ubermind/auto` gateway and has no direct provider inference key. Do not delete this document; it remains recoverable fallback/provenance.

# Infinite Opus terminal activation handoff — 2026-09-30

## Truth boundary

This checkpoint closes the technically implementable pre-credential layer. It does **not** claim live provider callability, a promoted Crown, paid spend, production deployment, cache savings, 24/7 endurance, matched frontier equivalence, or 33,333x compression. Those require owner-held provider credentials, explicit paid authorization, provider receipts, hidden-task tournament evidence, deployment evidence, and matched real workloads.

## Economic perimeter

Primary configuration:

- OpenRouter runtime key: **USD 20 monthly hard key limit**.
- OpenRouter TypingMind key: **USD 8 monthly hard key limit**.
- Inference-key aggregate: **USD 28/month**.
- Planning fee allowance: **USD 2/month**. At a 5.5% OpenRouter credit-purchase fee, USD 28 of inference credits corresponds to USD 29.54 before taxes/other payment-provider charges.
- UberMind runtime continues to reserve **at least USD 15** of its USD 20 key for Crown work.
- Host cash mode: `INFINITE_OPUS_CASH_ROUTE_MODE=OPENROUTER_ONLY`.
- Direct OpenAI, Anthropic and Vercel AI Gateway cash paths fail closed in this mode. Zero-cash open-model compute and plan-included sandbox cognition remain separate accounting classes.
- If other paid OpenRouter keys exist, disable them or reduce their limits so the total maximum of all active cash-metered keys remains <= USD 28.
- Require the `uberbond-global-28` member-wide monthly guardrail for the live $30 claim. The two per-key hard limits remain independent lower ceilings; if the account cannot expose and verify the member-wide guardrail, live activation stays blocked.

OpenRouter supports per-key `limit` and `limit_reset`, including monthly reset, and exposes per-key usage/remaining balance. Current guardrails can also enforce budgets, ZDR, and model/provider restrictions. Provider privacy should require ZDR and deny data collection; the governed runtime also sets those request controls.

## Owner action 1 — OpenRouter private configuration

**SCREEN:** OpenRouter dashboard → API Keys.

**ACTION:** Create two inference keys privately.

**KEY 1 NAME:** `uberbond-runtime-20`  
**LIMIT:** USD 20  
**RESET:** monthly  
**BYOK IN LIMIT:** on if BYOK is used  
**DESTINATION:** approved host secret manager as `OPENROUTER_API_KEY`  
**DO NOT RETURN:** the key itself.

**KEY 2 NAME:** `uberbond-typingmind-8`  
**LIMIT:** USD 8  
**RESET:** monthly  
**BYOK IN LIMIT:** on if BYOK is used  
**DESTINATION:** TypingMind only  
**DO NOT RETURN:** the key itself.

Create a guardrail named `uberbond-global-28`, set its budget to USD 28 with a monthly reset, and assign it to the founder/member that owns both inference keys. Require Zero Data Retention and deny data-collecting routes for sensitive groups as appropriate. The member guardrail caps combined spend across that member's keys while the two key limits remain independent lower ceilings.

**RETURN ONLY:** key labels, displayed limits/reset periods, remaining balances, the non-secret OpenRouter member identifier for `OPENROUTER_MEMBER_ID`, and whether `uberbond-global-28`/ZDR enforcement is enabled. Screenshots are fine only after hiding secret values.

## Owner action 2 — TypingMind cockpit + tiny canary authorization

### TypingMind

**SCREEN:** TypingMind → Settings → Manage Models → Add Custom Model → Import OpenRouter.

**FIELD:** OpenRouter API key.

**VALUE:** the private `uberbond-typingmind-8` key.

**ACTION:** Check API Key → import only the candidate models you actually want visible.

Initial presets are aliases, not permanent winners:

- GENERAL CROWN → `anthropic/claude-opus-5.5` candidate only until the sealed tournament.
- GENERAL CHALLENGER → `openai/gpt-6.1-sol-pro` candidate.
- STRONG WORKER → `anthropic/claude-sonnet-5.5` candidate.
- BATCH STRONG → `openai/gpt-6.1-sol:batch` candidate for eligible deferred workloads.
- ULTRA CHEAP → `xiaomi/mimo-v2.6-flash` candidate.
- CHEAP DIVERSE → `deepseek/deepseek-v4.1-flash` or current GLM Flash candidate from the live registry.
- DIVERSE CHALLENGER → current Qwen candidate from the live registry.

TypingMind supports custom profiles with distinct API keys. Keep the Infinite Opus profile on the capped TypingMind key. Do not install arbitrary TypingMind extensions: extensions can access TypingMind application data.

### Canary authorization

Edit a private copy of `config/infinite-opus-canary-authorization.template.json` outside Git:
- set `ownerApproved: true`;
- give it a unique non-secret authorization ID;
- set an expiry;
- keep maximum spend <= **USD 0.05**;
- keep model exactly `xiaomi/mimo-v2.6-flash`;
- keep `externalEffects: []`.

Run:
`node scripts/infinite-opus-openrouter-canary.mjs --execute --authorization /private/path/canary.json --output /private/path/canary-receipt.json`

The key must arrive only through the host secret manager/environment as `OPENROUTER_API_KEY`. Do not place it in the authorization file.

**RETURN ONLY:** the non-secret canary receipt with provider request/generation ID, served model, provider identity, token usage, actual billed cost, key limit/remaining balance, and success/refusal status.

**DO NOT RETURN:** API key, management key, password, cookie, Authorization header, or secret-manager value.

## What happens immediately after the canary

1. Reconcile the provider bill against the durable reservation.
2. Admit no semantic Crown authority from the canary.
3. Refresh the live model registry and exact route pricing.
4. Use the existing APEX sealed fresh-task campaign to run independently held hidden tasks.
5. Promote task-class Crowns only from valid tournament evidence.
6. Issue Crown Admission Receipts for durable semantic capital.
7. Activate the first recurring workload and start the real fanout/compression ledger.

## Existing external blockers preserved

- GitHub Actions account billing lock can prevent hosted jobs from starting. Zero-step CI is non-evidence, not a source-code failure.
- Vercel lite previews currently report the inherited build-gate exit `BUILD_UTILS_SPAWN_2`; deployment is not READY.
- Historical founder transcript bytes remain an integrity debt and must not be regenerated.
