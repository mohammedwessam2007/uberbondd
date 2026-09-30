# Infinite Opus One-Command Owner Gate

This is the final machine launcher after private OpenRouter setup. It performs no setup on the founder's behalf and never prints secrets.

Required private environment variables:
- `OPENROUTER_API_KEY`
- `OPENROUTER_MANAGEMENT_KEY`
- `OPENROUTER_MEMBER_ID`

Required private authorization file: a completed copy of `config/infinite-opus-canary-authorization.template.json`, with explicit owner approval, unexpired authorization, maximum spend <= USD 0.05, fixed MiMo smoke model, and zero external effects.

Run:

`node scripts/infinite-opus-owner-gate-launcher.mjs --execute --authorization /private/canary.json --canary-output /private/canary-receipt.json`

Sequence:

PREOWNER SOURCE DOCTOR
→ LIVE TWO-KEY + MEMBER-GUARDRAIL RECONCILIATION
→ <= USD 0.05 NO-EFFECT CANARY
→ PROVIDER GENERATION/BILL RECEIPT
→ STOP

It deliberately stops before the paid sealed Crown tournament. A successful transport canary is not permission to spend more, and it is not Crown authority.

After a separately bounded tournament authorization, UberBond continues through the existing sealed tournament, Crown Admission, first real provider-screening workload, automatic E0-E4 execution receipts, and provable reference economics.
