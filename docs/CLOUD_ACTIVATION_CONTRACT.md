# Cloud activation and reconciliation contract

What it takes to move UberBond's mesh liveness from "correct in this
repository" to "running from the current source on a cloud clock nobody has to
start".

This contract was reconciled against the authenticated Vercel control plane on
2026-08-28 after current `main` incorrectly recorded that no Vercel project
existed. The earlier observation is preserved as superseded history; it is not
current deployment truth.

## Observed deployment truth

The Vercel team `team_A9LnjIuS5PU0rNetsHMu1N0r` has two GitHub-linked
projects for this repository:

| Surface | Current evidence | What it does not prove |
|---|---|---|
| Full project | `uberbondd` / `prj_RWUPf14w1xIz9NK92AbNW5z7qDCg` exists and is linked to `mohammedwessam2007/uberbondd` | That current `main` is deployed or healthy |
| Full production | A READY production deployment exists for source `7e20cec9b4399e73b7f13fa7999dbc05a2f38221` | It predates current `main` `2d11d10af3889d65d1a660c4cd611ab2f875c059` and is not current-source proof |
| Full exact-head preview | The PR #180 attempt was blocked by Vercel's deployment-rate limit | Build or runtime success for PR #180 on the full project |
| Private-lite project | `uberbondd-lite-private` / `prj_ZMfDCuUva2kdMv6HnqGvIE5vihTz` exists | Full application or cron behavior |
| Private-lite exact-head preview | PR #180 source `5aa936bc475a62d44cda3eac0e4f4a8db1b94c9b` produced READY preview `dpl_4vgwAbEsRYkQ6mSH91DsXcg3EGqK` | Production promotion, full application behavior, or cron liveness |
| Environment variables | Not exposed by the available read-only connector in this audit | Presence or correctness of `CRON_SECRET`, `DATABASE_URL`, or `ENCRYPTION_KEY` |
| Cron registration | Not observed | That Vercel registered or fired `/api/agent-mesh-cron` |
| Current production source | No current-main production receipt was observed | Deployment, health, or rollback readiness for current `main` |

The correct status is therefore:

**Projects and older deployments exist. Current-source full deployment,
environment readiness, scheduler registration, and live cron delivery remain
unproven.**

## Supersession record

Commit `2d11d10af3889d65d1a660c4cd611ab2f875c059` stated that the account had
zero projects. An authenticated project listing performed after that commit
returned both `uberbondd` and `uberbondd-lite-private`, and deployment
history showed READY preview and production records. This document supersedes
only the project-existence claim. It does not convert those deployments into
current-source or cron proof.

## Why no activation mutation was performed

No project needed to be created. No deployment, environment-variable, domain,
DNS, or credential mutation was authorized or performed by this research lane.

Promoting now would also be unjustified:

- the full exact-head preview is provider-rate-limited;
- production points to an older source SHA;
- required environment-variable presence was not observable;
- a current-source cron invocation receipt does not exist; and
- secret values must remain in the provider control plane, not chat or the
  repository.

## What is already proven in the repository

Current `main` records verification against real PostgreSQL 18 through the
actual handler, not a fixture:

```
first authorized firing    -> 200, durable cycle receipt, zero business effects
replay, separate process   -> 200, duplicateDelivery: true, same cycleId
replay, different commit   -> 409 scheduler-occurrence-identity-conflict
next UTC day               -> new occurrence key, runs
wrong secret               -> 401, nothing written
missing schedule header    -> 403, nothing written
POST instead of GET        -> 405, nothing written
```

That is source/runtime evidence. It is not a Vercel delivery receipt.

## Environment-variable contract

| Variable | Required by | Consequence if missing |
|---|---|---|
| `CRON_SECRET` | `api/agent-mesh-cron.mjs` | `503 cron-secret-not-configured` — fails closed |
| `VERCEL_GIT_COMMIT_SHA` | same | `503 vercel-source-commit-not-configured` — normally injected by Vercel |
| `DATABASE_URL` | `createStore` | `503 store-runtime-not-configured` |
| `ENCRYPTION_KEY` | `src/config.mjs` startup validation | startup refuses |

Do not export secret values into chat or the repository. Verify only names,
targets, and presence in the Vercel control plane.

## Reconciliation and activation sequence

1. Open the existing `uberbondd` project; do not create a duplicate.
2. Verify that `CRON_SECRET`, `DATABASE_URL`, and `ENCRYPTION_KEY` exist
   for production. Add or rotate them only with explicit credential authority.
3. After the provider rate-limit window clears, require a READY full-project
   deployment whose source SHA equals the authorized current `main`.
4. Promote that exact deployment only with deployment authority.
5. Verify the registered cron path and schedule from the provider control
   plane.
6. Capture the first real firing and one same-occurrence replay as durable
   provider receipts.

## Expected proof after activation

- The full production deployment reports the exact authorized source SHA.
- The build is READY and the route does not fail environment startup.
- The provider lists `/api/agent-mesh-cron` at `17 12 * * *`.
- The first firing returns 200 with a `cycleId` and
  `permittedMode: "ZERO_EXTERNAL_IO_CANARY"`.
- A same-UTC-day replay returns `duplicateDelivery: true` with the same
  `cycleId`.
- Every returned business `externalEffectLedger` field remains zero.

Until all six exist together, label cloud liveness **UNPROVEN**.

## Kill conditions

Stop and investigate if any of these appear:

- production source differs from the authorized SHA;
- two different `cycleId` values appear for one occurrence key;
- any non-zero business-effect ledger field appears;
- `businessEffectAuthority` is anything other than `NONE`;
- a 200 response carries a conflict reason code;
- repeated 403 `vercel-cron-schedule-mismatch`; or
- the full deployment is promoted while required environment presence is
  unknown.

## Rollback

Before promotion, record the currently active production deployment and its
source SHA. If the current-source canary violates a kill condition, restore that
known deployment through Vercel and disable the cron until the discrepancy is
adjudicated. Do not delete the project or expose secrets as a rollback method.

Removing the `crons` array from `vercel.json` and redeploying is the
source-controlled scheduler rollback. The route remains secret-gated and inert
without a scheduler call.

## Schedule constraint

`17 12 * * *` is once daily. The occurrence key has day granularity, and the
boundary refuses any schedule finer than that rather than silently folding
multiple firings into one. A wider cadence requires a corresponding occurrence
identity change and new hostile verification.

Hobby-plan cron limits were not re-verified in this audit and are not asserted
here.
