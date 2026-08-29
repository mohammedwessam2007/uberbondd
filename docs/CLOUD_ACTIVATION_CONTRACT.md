# Cloud activation contract

What it takes to move UberBond's mesh liveness from repository-proven behavior to a current production deployment that is actually reached by the cloud scheduler.

The cron route, boundary and zero-external-IO canary are already on `main` and were previously verified against real PostgreSQL. This file now separates those code/runtime proofs from the connected platform state observed on 2026-08-29.

## Observed deployment truth — a contradiction, preserved

Two lanes inspected the same connected Vercel account and disagree about whether
an UberBond project exists. Neither observation is deleted here. The truth
hierarchy puts durable provider evidence above internal claims, but both of these
claim to be provider evidence, and no lane inside this repository can settle it —
only the owner's Vercel dashboard can.

Observed team, agreed by both lanes: `team_A9LnjIuS5PU0rNetsHMu1N0r`, plan `hobby`.

| Observation | Made via | When | What it said |
|---|---|---|---|
| Two Git-linked projects exist: `prj_RWUPf14w1xIz9NK92AbNW5z7qDCg` (`uberbondd`) and `prj_ZMfDCuUva2kdMv6HnqGvIE5vihTz` (`uberbondd-lite-private`), both linked to `mohammedwessam2007/uberbondd`, with READY deployments including production `dpl_7JcNGnb3yQecemXo6ncxckNyEfCR` at main SHA `7e20cec9b4399e73b7f13fa7999dbc05a2f38221` | connected Vercel inspection, recorded in `artifacts/live-infrastructure-observation-20260829.json` | 2026-08-29 | projects exist |
| `list_projects(team_A9LnjIuS5PU0rNetsHMu1N0r)` returned `[]` | connected Vercel MCP | 2026-08-28 | no project reachable |
| `list_projects` returned `[]` again; `get_project` returned **404 Not Found** for both `prj_RWUPf14w1xIz9NK92AbNW5z7qDCg` and the slug `uberbondd` on the same team | connected Vercel MCP | 2026-08-29 | no project reachable |

The second and third observations are the ones this lane made itself and can
re-run. The first is recorded as another lane stated it. A 404 on a specific
project id is stronger than an empty list — an empty list can be a scope or
pagination artifact, a 404 on an exact id is a direct answer — but it still only
proves the project is not reachable through *this* connection, not that it does
not exist in the account.

Do not resolve this by editing one row out. Resolve it by looking at
https://vercel.com/mohammedwessam2007s-projects and reporting what is there.

### Not in dispute

Whatever the project situation is, no lane here has produced these, and the
repository must not imply otherwise:

| Claim | Proven |
|---|---|
| Current main exact production SHA proven | **NO** |
| Current zero-I/O cron registration proven | **NO** |
| Current zero-I/O cron delivery proven | **NO** |
| Production deployments authorized or performed by this lane | **NONE** |

`lite/` remains protected. If a project does exist, the deployment target for the
main system is `uberbondd`, never the lite project.

## What is already proven in repository/runtime tests

Verified previously against real PostgreSQL through the actual handler, not a fixture:

```
first authorized firing    -> 200, durable cycle receipt, zero effects, authority NONE
replay, same occurrence    -> 200, duplicateDelivery: true, SAME cycleId
replay, different commit   -> 409 scheduler-occurrence-identity-conflict
next UTC day               -> new occurrence key, runs
wrong secret               -> 401, nothing written
missing schedule header    -> 403, nothing written
POST instead of GET        -> 405, nothing written
```

The replay result proves durable database idempotency. It does not prove that Vercel's scheduler has executed the current production route.

## Environment variable contract

| Variable | Required by | Current connected-platform truth |
|---|---|---|
| `CRON_SECRET` | `api/agent-mesh-cron.mjs` | presence unknown; do not infer absence |
| `VERCEL_GIT_COMMIT_SHA` | same | injected by Vercel on deployments |
| `DATABASE_URL` | `createStore` | presence/connectivity for the current production candidate unknown |
| `ENCRYPTION_KEY` | `src/config.mjs` startup validation | presence unknown |

Secrets must never be copied into repository artifacts or chat receipts.

## Correct activation sequence from the observed state

Step 0 is the contradiction above. Everything below assumes a project is
found; if the dashboard shows none, the first step is the owner creating it
once, and this section is then a create-and-link sequence rather than a
promotion one. Either way: **exactly one project**. Do not create a second
one because deployment turned out to be inconvenient.

1. Obtain trustworthy exact-head build/test proof for the candidate being promoted.
2. Verify the existing `uberbondd` project's required production environment contract without exposing or rotating secret values.
3. Deploy/promote the verified exact candidate to the existing `uberbondd` project.
4. Verify the production deployment's exact source SHA, READY state, health/runtime errors and registered cron schedule.
5. Capture one real authorized scheduler invocation of `/api/agent-mesh-cron` in `ZERO_EXTERNAL_IO_CANARY` mode.
6. Replay the same occurrence and confirm `duplicateDelivery: true` with the same `cycleId`.
7. Confirm the returned external-effect ledger remains all zero and `businessEffectAuthority` remains `NONE`.

## Promotion gates

Do not claim `DEPLOYED_HEALTHY` unless the exact candidate SHA is the production source and health/runtime checks support it.

Do not claim `ZERO_IO_LIVENESS` until a real Vercel scheduler invocation produces the expected durable receipt.

Do not claim provider/live-commercial readiness from this canary. It deliberately proves no provider/model/customer/business effects.

## Kill conditions

Stop and investigate if any of these appear:

- Two different `cycleId` values for one occurrence key.
- Any non-zero field in the returned `externalEffectLedger`.
- `businessEffectAuthority` anything other than `NONE`.
- A 200 response carrying a conflict reason code.
- Repeated `vercel-cron-schedule-mismatch` responses.
- Production source SHA different from the candidate that passed promotion gates.
- Any unexpected provider/model/customer effect during the zero-I/O canary.

## Rollback

Use the existing Vercel project's previous known-good production deployment as the rollback target, or remove the `crons` array and redeploy if scheduler activation itself is the fault. The route remains fail-closed behind the cron secret.

## Schedule constraint

`17 12 * * *` is once daily. The occurrence identity has day granularity, and the boundary refuses finer schedules rather than silently folding multiple firings into one occurrence.

This contract records observed truth, not credentials. Future sessions must refresh connected Vercel state before changing this file again.
