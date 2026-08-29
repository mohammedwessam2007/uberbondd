# Cloud activation contract

What it takes to move UberBond's mesh liveness from repository-proven behavior to a current production deployment that is actually reached by the cloud scheduler.

The cron route, boundary and zero-external-IO canary are already on `main` and were previously verified against real PostgreSQL. This file now separates those code/runtime proofs from the connected platform state observed on 2026-08-29.

## Observed deployment truth

The previous version of this contract said no Vercel project existed. That is stale and contradicted by connected Vercel inspection.

Observed team: `team_A9LnjIuS5PU0rNetsHMu1N0r`.

Observed Git-linked UberBond projects:

- `prj_RWUPf14w1xIz9NK92AbNW5z7qDCg` — `uberbondd` — linked to `mohammedwessam2007/uberbondd`;
- `prj_ZMfDCuUva2kdMv6HnqGvIE5vihTz` — `uberbondd-lite-private` — linked to the same repository.

`lite/` remains protected. The deployment target for the main system is `uberbondd`.

Connected Vercel also shows READY deployments for `uberbondd`:

| Observation | Evidence |
|---|---|
| Project exists | `prj_RWUPf14w1xIz9NK92AbNW5z7qDCg` |
| Latest observed deployment | `dpl_GxiZJqNGzFctaAjxtcXkAn1EkWda`, READY, preview target, source `59a413da9cd0dde1ca10aabbca79733583c01b36` |
| Latest observed production deployment in the returned window | `dpl_7JcNGnb3yQecemXo6ncxckNyEfCR`, READY, source main SHA `7e20cec9b4399e73b7f13fa7999dbc05a2f38221` |
| Production domains | `uberbondd.vercel.app`, project aliases |
| Runtime errors observed in last 24h | none |
| Current main exact production SHA proven | **NO** |
| Current zero-I/O cron liveness proven | **NO** |

The machine-readable observation is `artifacts/live-infrastructure-observation-20260829.json`.

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

The project already exists. Do **not** create another project.

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
