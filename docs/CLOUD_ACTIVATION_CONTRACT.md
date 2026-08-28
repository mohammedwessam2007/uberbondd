# Cloud activation contract

What it takes to move UberBond's mesh liveness from "correct in this repository"
to "running in the cloud on a clock nobody has to start".

Written after the cron route, boundary and zero-external-IO canary landed on
`main` and were verified against real PostgreSQL.

## Observed deployment truth

**There is no Vercel project.** The account
(`mohammedwessam2007's projects`, `team_A9LnjIuS5PU0rNetsHMu1N0r`, Hobby plan)
has zero projects. `vercel.json` declares a cron; nothing is hosting it.

So the honest status of every §016/§017 deployment check is the same:

| Check | Status |
|---|---|
| Current Vercel project resolved | **NONE EXISTS** |
| Build config verified | n/a — `vercel.json` is correct in-repo, never built |
| Environment variable contract | declared below, **not set anywhere** |
| Database connectivity from production | n/a |
| Health endpoint reachable | n/a |
| Scheduler configured | declared in `vercel.json`, **not registered with any platform** |
| Production deployment source SHA | **none** |
| Rollback path | n/a — nothing to roll back |

This is not a failure of the code. It is the absence of a deployment target.

## Why this was not created automatically

Creating the project is free and takes minutes, and it was deliberately not
done, for one reason: the two secrets the route requires cannot be supplied from
inside this repository.

Without `DATABASE_URL` the route returns `503 store-runtime-not-configured`.
Without `CRON_SECRET` it returns `503 cron-secret-not-configured`. A project
deployed now would present a production surface whose daily cron fails every
time — which is worse than no project, because it *looks* deployed.

A generated `CRON_SECRET` would also have to be handed over in chat to be
useful, which is the wrong place for a credential.

## What is already proven

Verified against real PostgreSQL 18 through the actual handler, not a fixture:

```
first authorized firing    -> 200, cycle receipt meshcycle_9d53d3f7…, zero effects, authority NONE
replay, same occurrence    -> 200, duplicateDelivery: true, SAME cycleId
replay, different commit   -> 409 scheduler-occurrence-identity-conflict
next UTC day               -> new occurrence key, runs
wrong secret               -> 401, nothing written
missing schedule header    -> 403, nothing written
POST instead of GET        -> 405, nothing written
```

The replay result is worth reading twice: a **separate process** replaying the
same occurrence key received the same `cycleId`. Idempotency is durable in the
database, not in memory.

## Environment variable contract

| Variable | Required by | Consequence if missing |
|---|---|---|
| `CRON_SECRET` | `api/agent-mesh-cron.mjs` | `503 cron-secret-not-configured` — fails closed, never runs |
| `VERCEL_GIT_COMMIT_SHA` | same | `503 vercel-source-commit-not-configured` — set automatically by Vercel |
| `DATABASE_URL` | `createStore` | `503 store-runtime-not-configured` |
| `ENCRYPTION_KEY` | `src/config.mjs` startup validation | startup refuses |

`VERCEL_GIT_COMMIT_SHA` is injected by the platform. The other three are the
owner's to set.

## Activation sequence

1. `vercel link` (or create the project in the dashboard from this repository).
2. Set `CRON_SECRET` to a fresh random value, `DATABASE_URL` to a real
   PostgreSQL connection string, and `ENCRYPTION_KEY`, as production
   environment variables.
3. Deploy. Vercel registers the cron from `vercel.json` automatically.

## Expected proof after activation

- `vercel crons ls` lists `/api/agent-mesh-cron` at `17 12 * * *`.
- The first firing returns 200 with a `cycleId` and
  `permittedMode: "ZERO_EXTERNAL_IO_CANARY"`.
- `vercel crons run /api/agent-mesh-cron` on the same UTC day returns
  `duplicateDelivery: true` with the same `cycleId`.
- The response's `externalEffectLedger` is all zeros on every firing.

That last one is the point of the canary: it proves the clock reaches the code
and the code writes a durable receipt, while proving that nothing external
happened.

## Kill conditions

Stop and investigate if any of these appear:

- Two different `cycleId` values for one occurrence key.
- Any non-zero field in a returned `externalEffectLedger`.
- `businessEffectAuthority` anything other than `NONE`.
- A 200 response carrying a `reasonCodes` array that includes a conflict code.
- Repeated 403 `vercel-cron-schedule-mismatch` — that means `vercel.json` and
  `VERCEL_AGENT_MESH_CRON_SCHEDULE` have drifted, and the cron is not running at
  all despite appearing configured. A test binds them precisely to prevent this.

## Rollback

Remove the `crons` array from `vercel.json` and redeploy, or delete the cron in
the dashboard. The route stays deployed and inert: with no scheduler calling it
and a secret required on every request, it has no self-starting path.

## Schedule constraint

`17 12 * * *` is once daily. The occurrence key has day granularity, and the
boundary now refuses any schedule finer than that rather than silently folding
288 firings into one — so widening the cadence is a deliberate change that
requires widening the occurrence identity with it.

Hobby-plan cron limits were not verified from documentation and are not asserted
here. A once-daily schedule is the conservative choice under any of them.
