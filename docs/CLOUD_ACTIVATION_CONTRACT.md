# Cloud activation contract

What it takes to move UberBond's mesh liveness from repository-proven behavior to a current production deployment that is actually reached by the cloud scheduler.

The cron route, boundary and zero-external-IO canary are already source-present on `main` and were previously verified against real PostgreSQL. Provider reachability, exact production source identity, scheduler registration and scheduler delivery are separate evidence classes and must never be inferred from source presence.

## Observed provider state — 2026-09-09

A fresh read through the currently connected Vercel account resolves the historical provider-scope contradiction. The account exposes team `team_A9LnjIuS5PU0rNetsHMu1N0r` and both Git-linked UberBond projects:

| Project | Vercel project id | Connected source |
|---|---|---|
| `uberbondd` | `prj_RWUPf14w1xIz9NK92AbNW5z7qDCg` | `mohammedwessam2007/uberbondd` |
| `uberbondd-lite-private` | `prj_ZMfDCuUva2kdMv6HnqGvIE5vihTz` | `mohammedwessam2007/uberbondd` |

The full `uberbondd` project is the canonical heavyweight proof surface. `uberbondd-lite-private` is not a substitute for the full root build and remains protected from accidental mission widening.

Fresh provider inspection also observed full-project preview deployment `dpl_2PhVeSieAtWWADw4pdxavwd1ULZR` for PR #598 / commit `08be0cd10a6e8e35d5c5dfa608ec0f7ad5583c2e`. That deployment genuinely executed `node scripts/vercel-command-center-build.mjs` and ended `ERROR` after the deterministic suite exposed stale Nightfall cloud-schema assertions and stale self-maintainer hourly-loop assertions. This is useful executed evidence. It is not production liveness and it is not an exact-current-main pass.

### Historical connector-scope contradiction

On 2026-08-28 and 2026-08-29 an earlier connected lane reported `list_projects(...) == []` and 404 responses for the full-project id, while another lane had recorded the two projects as existing. Those observations remain historical provenance because they documented the connection scope available to those sessions. They no longer define current provider reachability: the 2026-09-09 connected provider read directly lists both project ids and deployments.

Fresh evidence resolves only **project reachability through the current connection**. It does not retroactively convert any old deployment into current production proof and does not prove cron registration or delivery.

### Current liveness truth

| Claim | Proven |
|---|---|
| Connected Vercel account currently exposes both UberBond projects | **YES — observed 2026-09-09** |
| Full project can execute the heavyweight repository build | **YES — preview execution observed on PR #598** |
| Current main exact production SHA proven | **NO** |
| Current zero-I/O cron registration proven | **NO** |
| Current zero-I/O cron delivery proven | **NO** |
| Production deployments authorized or performed by this repair lane | **NONE** |

Project existence and preview execution therefore cannot be used as shortcuts around the remaining production and scheduler gates.

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
| `DATABASE_URL` | `createStore` | presence/connectivity for a current production candidate unknown |
| `ENCRYPTION_KEY` | `src/config.mjs` startup validation | presence unknown |

Secrets must never be copied into repository artifacts or chat receipts.

## Correct activation sequence from the observed state

1. Obtain trustworthy exact-head build/test proof for the candidate being promoted. The full-project Vercel root build is an acceptable source-proof executor when it actually executes the required gates.
2. Require `scripts/current-truth-regeneration.mjs` and `scripts/terminal-realization.mjs` on the exact candidate. Finite engineering closure cannot promote runtime, provider, commercial, personal-reality or ASI facets.
3. Verify the existing `uberbondd` project's required production environment contract without exposing or rotating secret values.
4. Deploy or promote only the exact verified candidate to the existing `uberbondd` project.
5. Verify the production deployment's exact source SHA, READY state, health/runtime errors and registered cron schedule.
6. Capture one real authorized scheduler invocation of `/api/agent-mesh-cron` in `ZERO_EXTERNAL_IO_CANARY` mode.
7. Replay the same occurrence and confirm `duplicateDelivery: true` with the same `cycleId`.
8. Confirm the returned external-effect ledger remains all zero and `businessEffectAuthority` remains `NONE`.

## Promotion gates

Do not claim `DEPLOYED_HEALTHY` unless the exact candidate SHA is the production source and health/runtime checks support it.

Do not claim `ZERO_IO_LIVENESS` until a real Vercel scheduler invocation produces the expected durable receipt.

Do not claim provider/live-commercial readiness from this canary. It deliberately proves no provider/model/customer/business effects.

A preview build that executes deeply and fails is evidence about the tested source. It is not evidence that production is broken, and it must not be relabelled as a pass.

## Kill conditions

Stop and investigate if any of these appear:

- Two different `cycleId` values for one occurrence key.
- Any non-zero field in the returned `externalEffectLedger`.
- `businessEffectAuthority` anything other than `NONE`.
- A 200 response carrying a conflict reason code.
- Repeated `vercel-cron-schedule-mismatch` responses.
- Production source SHA different from the candidate that passed promotion gates.
- Any unexpected provider/model/customer effect during the zero-I/O canary.
- A source gate weakened merely to make a cloud build turn green.

## Rollback

Use the existing Vercel project's previous known-good production deployment as the rollback target if a promoted candidate fails its production verification. If scheduler activation itself is the fault, remove or correct the scheduler configuration through a separately authorized exact-source change and redeploy. The route remains fail-closed behind the cron secret.

## Schedule constraint

`17 12 * * *` is once daily in the current `vercel.json` scheduler declaration. The occurrence identity has day granularity, and the boundary refuses finer schedules rather than silently folding multiple firings into one occurrence. Source declaration is not provider-registration proof.

This contract records observed truth, not credentials. Future sessions must refresh connected Vercel state before making present-tense provider claims.
