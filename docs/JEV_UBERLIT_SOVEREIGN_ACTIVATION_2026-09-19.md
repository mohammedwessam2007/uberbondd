# Jev Sovereign Activation on UberCel / UberLit

Date: 2026-09-19  
Status: **source activation complete; live provider proof requires owner-custodied TypeSafe key on an UberLit host**

## Runtime path

```text
UberBond semantic program
        |
        v
System-One provider-neutral adapter
        |
        v
TypeSafe Jev direct HTTPS
        |
        v
UberLit sovereign Linux runtime
        |
        v
shadow observation ledger
        |
        v
real outcome calibration
        |
        v
candidate reflex / deterministic compilation
```

UberCel remains the signed deployment/rollback/health control plane. UberLit remains the resident execution substrate. No Vercel runtime is required for this path.

## Secret custody

The API key is never committed and does not need to live in `/etc/uberlit/uberlit.env`.

Canonical path:

`/var/lib/uberlit/uberbond/secrets/typesafe-api-key`

Properties:

- directory mode 0700;
- key file mode 0600;
- symlink refused;
- loose permissions refused;
- key value never emitted by status or receipts.

Operator:

```bash
# status only
node scripts/uberlit-typesafe-secret.mjs status

# store from stdin on the UberLit host
printf '%s' "$TYPESAFE_API_KEY" | node scripts/uberlit-typesafe-secret.mjs store
```

Do not paste the key into Git, chat, logs, or command-line arguments.

## Non-secret UberLit defaults

The installer idempotently provisions:

```text
TYPESAFE_BASE_URL=https://api.typesafe.ai
TYPESAFE_DEFAULT_MODEL=jev-latest
TYPESAFE_JEV_ENABLED=false
TYPESAFE_INPUT_USD_PER_MILLION=0.042
TYPESAFE_OUTPUT_USD_PER_MILLION=0
TYPESAFE_PRICING_SOURCE=https://typesafe.ai/
TYPESAFE_PRICING_VERIFIED_AT=2026-09-19T00:00:00.000Z
TYPESAFE_MAX_COST_USD_PER_CALL=0.001
```

The price is a dated source configuration, not a permanent assumption. Refresh it from an official TypeSafe source before relying on cost reporting after material time has elapsed.

## Activation ladder

1. `PLAN_ONLY`: compile semantic programs, zero network calls.
2. key stored under UberLit protected runtime secret.
3. set `TYPESAFE_JEV_ENABLED=true` in `/etc/uberlit/uberlit.env`.
4. run `node scripts/uberlit-jev-shadow-canary.mjs --execute`.
5. require observed model, usage, cost, latency and typed answers.
6. run real task classes only in shadow.
7. record real outcomes with evidence.
8. inspect `node scripts/jev-calibration-doctor.mjs`.
9. only after >=100 outcomes, >=0.98 accuracy, <=0.02 calibration error and >=3 stable windows may a task class become a deterministic-compilation candidate.
10. drift promotes the task back to deeper cognition.

No stage grants customer messaging, payment, deployment, DNS, account, security-target or other consequence authority.

## Operator commands

```text
npm run jev:doctor
npm run jev:uberlit:secret
npm run jev:uberlit:canary
npm run jev:shadow:route
npm run jev:calibration
npm run test:jev
```

`jev:uberlit:canary` and `jev:shadow:route` are plan-only by default. Their scripts require an explicit `--execute` flag for a provider call.

## Reality boundary

Source completion is not live callability. Live Jev is proven only by a receipt observed from the UberLit host using an owner-custodied key. Provider confidence does not become authority. Shadow recommendations do not alter canonical routing until task-specific calibration earns promotion.
