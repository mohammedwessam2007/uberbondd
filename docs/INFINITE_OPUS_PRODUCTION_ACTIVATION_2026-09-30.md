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
