# UberBond Relay Adapter

This directory is the smallest Vercel-compatible relay surface. It exposes a
read-only health contract and explicitly fails closed for task queue, lease,
and result routes. It is not the full durable `server.mjs`/`worker.mjs` relay:
there is no database, queue, worker, provider credential, outbound action, or
production mutation in this adapter.
