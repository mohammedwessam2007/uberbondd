# Infinite Opus OpenRouter Setup Receipt — 2026-09-30

Status: owner-only activation guide. No provider call has been made by this package.

## Structural budget design

Create two separate keys so compromise of the interactive cockpit cannot consume the protected runtime reserve:

- `uberbond-runtime`: **USD 20/month**, monthly reset, include BYOK usage in limit.
- `uberbond-typingmind`: **USD 8/month**, monthly reset, include BYOK usage in limit.
- Keep **USD 2** outside the inference-key envelope as fee/uncertainty buffer. With the current planning fee allowance of 5.5%, a full USD 28 of key-limited inference remains below the USD 30 all-in target.

OpenRouter's current key API exposes `limit`, `limit_remaining`, `limit_reset`, and monthly usage. The generation endpoint exposes provider/model/token/cost metadata for reconciliation.

## Runtime

Store `OPENROUTER_API_KEY` only in the approved host secret manager. Never in Git, chat, logs or a committed env file.

Before any paid call, the runtime must verify its current key reports the expected USD 20 monthly limit. The first smoke requires an explicit owner authorization receipt and is capped at **USD 0.05**. A key existing is not spend authorization.

## Rollback

Disable/revoke the affected OpenRouter key. The software ledger keeps dispatched uncertain reservations held until provider billing is reconciled. Crown roles are not promoted from a failed smoke.
