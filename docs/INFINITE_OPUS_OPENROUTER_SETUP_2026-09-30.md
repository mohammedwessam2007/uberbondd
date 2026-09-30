# Infinite Opus OpenRouter Setup Receipt — 2026-09-30

Status: owner-only activation guide. No provider call has been made by this package.

## Structural budget design

Create two separate keys so compromise of the interactive cockpit cannot consume the protected runtime reserve:

- `uberbond-runtime-20`: **USD 20/month**, monthly reset, include BYOK usage in limit.
- `uberbond-typingmind-8`: **USD 8/month**, monthly reset, include BYOK usage in limit.
- Keep **USD 2** outside the inference-key envelope as fee/uncertainty buffer. With the current planning fee allowance of 5.5%, a full USD 28 of key-limited inference remains below the USD 30 all-in target.

OpenRouter's current key API exposes `limit`, `limit_remaining`, `limit_reset`, and monthly usage. The generation endpoint exposes provider/model/token/cost metadata for reconciliation.

## Cross-key structural guardrail

Create a guardrail named **`uberbond-global-28`** and assign a **USD 28/month** budget to the founder/member that owns these keys. OpenRouter currently documents member budgets as accumulating across that member's keys, while each key keeps its own limit; the lower applicable limit wins. This prevents the two keys, or an accidentally created extra key under the same member, from jointly exceeding the inference envelope. The management reconciliation still refuses unexpected active keys so account hygiene remains explicit.

## Runtime

Store `OPENROUTER_API_KEY` only in the approved host secret manager. Never in Git, chat, logs or a committed env file.

Before any paid call, the runtime must verify its current key reports the expected USD 20 monthly limit. The first smoke requires an explicit owner authorization receipt and is capped at **USD 0.05**. A key existing is not spend authorization.

## Rollback

Disable/revoke the affected OpenRouter key. The software ledger keeps dispatched uncertain reservations held until provider billing is reconciled. Crown roles are not promoted from a failed smoke.

## Optional machine reconciliation without sharing the TypingMind inference key

Create a dedicated OpenRouter **Management API key** and store it only as `OPENROUTER_MANAGEMENT_KEY` in the approved runtime secret manager. It is administrative-only and is not an inference credential. UberBond can then read both named keys' monthly limits and usage, reconcile the structural $20 + $8 envelope, and emit a non-secret receipt. The management secret itself must never enter Git, chat, receipts, or logs.

## Machine verification

For automated post-setup reconciliation, create a dedicated **Management API key** and store it only as `OPENROUTER_MANAGEMENT_KEY`. OpenRouter documents Management keys as administrative-only and unable to call completion endpoints. Record the founder/member's non-secret member identifier as `OPENROUTER_MEMBER_ID`. Then run:

`node scripts/infinite-opus-openrouter-budget-reconcile.mjs`

The reconciler refuses if either canonical key is missing/mis-capped, an unexpected active inference key is present, or `uberbond-global-28` is not observed at USD 28/month on the expected member.
