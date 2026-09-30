# Infinite Opus Production Activation Package — 2026-09-30

This package prepares deployment; it does not purchase or deploy a host.

Exact source is the merge commit produced from `infinite-opus/live-gap-closure-20260930` after source validation.

Required production substrate:
- existing approved durable Linux/container host;
- PostgreSQL durable store;
- web process: existing `server.mjs`;
- worker process: existing `worker.mjs`;
- scheduler/event wake path already present in UberBond;
- protected `OPENROUTER_API_KEY` secret;
- admin authentication for operator endpoints.

Operator surfaces:
- `GET /api/admin/infinite-opus/health`
- `GET /api/admin/infinite-opus/budget`
- `GET /api/admin/infinite-opus/queue`
- existing `GET /api/health` for web/worker/store health.

Boot verification sequence:
1. exact release commit/tree bound;
2. PostgreSQL reachable and migrations complete;
3. web healthy;
4. worker heartbeat/queue healthy;
5. Infinite Opus health says source-ready/pre-live;
6. budget endpoint shows no ungoverned cash route and no paid connection before authorization;
7. idle interval observes zero inference dispatches;
8. restart web/worker and confirm durable queue/ledger recovery;
9. only then, if owner authorization exists, run the USD 0.05 canary;
10. reconcile provider generation receipt and key usage before any tournament.

Rollback: revoke/disable runtime key, stop the Infinite Opus paid executor, restore previous exact release, preserve DB/ledger for reconciliation. Never release a dispatched-uncertain reservation merely to make the dashboard green.


## TypingMind UberMind gateway addition

The approved web host now also exposes a dedicated OpenAI-compatible cockpit boundary:

- `GET /api/typingmind/infinite-opus/v1/models`
- `POST /api/typingmind/infinite-opus/v1/chat/completions`
- logical model: `ubermind/auto`

Required protected host inputs:
- `OPENROUTER_API_KEY` = dedicated runtime key, provider-side monthly limit USD 20;
- `UBERMIND_TYPINGMIND_GATEWAY_TOKEN` = independent random cockpit bearer, >=32 chars, not an inference/admin/management key.

Required current non-secret authority receipts:
- `INFINITE_OPUS_PAID_AUTHORIZATION_JSON`;
- `INFINITE_OPUS_CROWN_ADMISSION_JSON`.

Default allowed browser origins are the TypingMind production origins and can be narrowed through `UBERMIND_TYPINGMIND_ALLOWED_ORIGINS`.

The browser preflight performs zero inference. A chat request is refused before paid cognition unless the dedicated bearer, current public price records, bounded monthly authorization and exact Crown admission all pass.

Gateway v1 raw-chat quality law:
`GPT-6.1 Sol proposal -> admitted Claude Opus 5.5 General-Crown ACCEPT/REWRITE`.

This does not hard-code Opus as permanent Crown. The endpoint refuses service when the stored admission expires or no longer matches the current route/provider. Crown succession must replace the receipt before the role moves.

Rollback addition: remove/revoke `UBERMIND_TYPINGMIND_GATEWAY_TOKEN` to cut cockpit ingress immediately without deleting ledgers or provider receipts. Revoking the runtime OpenRouter key remains the spend kill-switch.
