# UberBond Full-Automation Configuration Reference

This covers only the **new** `automation.*`/`apify.*` configuration this session added to
`src/config.mjs`. The pre-existing `outbound.*`, `inbound.*`, `discovery.*`, and `revenue.*`
configuration (already extensive and already documented in `ENVIRONMENT_VARIABLES.md`) is
untouched and not repeated here.

## Automation mode (spec section O)

| Env var | Default | Meaning |
|---|---|---|
| `AUTOMATION_MODE` | `shadow` | One of `shadow` \| `approval` \| `autonomous`. Invalid values fail closed to `shadow`, and `validateStartupConfig` rejects any other string outright. |
| `AUTOMATION_ENABLED` | `false` | Master switch. Canonical boolean parsing — only the exact string `true` enables it; anything else (including `TRUE`, `1`, `yes`) is `false`. |
| `CAMPAIGN_POLICY_REQUIRED` | `true` | When true (the default), `approval`/`autonomous` modes require an active signed campaign policy (`isCampaignPolicyActive`) before automated advancement is allowed for that campaign. |
| `AUTOMATION_AUTONOMOUS_CONFIRMED` | `false` | Additional explicit confirmation required only for `autonomous` mode. `validateStartupConfig` refuses to start with this set to `true` under `NODE_ENV=test`. |
| `CAMPAIGN_POLICY_SECRET` | falls back to `TOKEN_ENCRYPTION_KEY`, then empty | HMAC-SHA256 key used to sign/verify campaign policies. Signing fails closed (`policy-secret-not-configured`) if this and `TOKEN_ENCRYPTION_KEY` are both unset or shorter than 16 characters. |
| `FULFILLMENT_AUTOMATION_ENABLED` | `false` | Gate for scheduling `fulfillment.process` automatically (lane assignment + SLA creation). Manual invocation of the job handler is still possible for testing; this flag is for the scheduler wiring, not a hard code gate inside `fulfillment.mjs` itself (lane selection/task creation are pure and always available to a caller who explicitly invokes them, same posture as the rest of this codebase's stage functions). |
| `MONITORING_ENABLED` | `false` | Gate for scheduling `monitoring.enroll`/monitoring-related workers automatically. Consent (`assertMonitoringConsent`) is enforced unconditionally regardless of this flag. |
| `MAX_DAILY_SENDS` | `0` | A global overlay cap on top of the existing per-campaign `dailySendCap`/`hourlySendCap` and per-inbox `OUTBOUND_HOURLY_CAP_*`. `0` means "not raised above the existing per-campaign caps" — this field does not itself grant sends; it can only further restrict. |
| `MAX_TOTAL_CAMPAIGN_SENDS` | `0` | Same posture as above, for the campaign's lifetime total rather than a daily figure. |

## Apify prospect ingestion (spec section A)

| Env var | Default | Meaning |
|---|---|---|
| `APIFY_ENABLED` | `false` | Must be `true` (canonical boolean) for `pollApifyTask` to run at all; static export import (`importApifyExport`) does not require this, since it performs no network I/O. |
| `APIFY_TOKEN` | empty | Apify API token. Required (non-empty) for polling. |
| `APIFY_TASK_ID` | empty | Apify actor task ID to poll. Required (non-empty) for polling. |
| `APIFY_POLL_MINUTES` | `60` | Minimum polling interval if wired into a scheduled worker (not currently scheduled by anything in this repository — see the readiness doc). Clamped to a minimum of 5. |

## Validation additions

`validateStartupConfig` (in `src/config.mjs`) now additionally rejects:
- An `AUTOMATION_MODE` outside `shadow`/`approval`/`autonomous`.
- `AUTOMATION_MODE=autonomous` with `AUTOMATION_AUTONOMOUS_CONFIRMED=true` under `NODE_ENV=test`.

No existing validation rule was removed, relaxed, or reordered.

## Complete safe-defaults set (spec section O, verbatim)

```
AUTOMATION_MODE=shadow
AUTOMATION_ENABLED=false
CAMPAIGN_POLICY_REQUIRED=true
OUTBOUND_PROVIDER=test          # pre-existing default, unchanged
OUTBOUND_ENABLED=false          # pre-existing default, unchanged
OUTBOUND_DRY_RUN=true           # pre-existing default, unchanged
LIVE_SEND_APPROVAL=false        # pre-existing: OUTBOUND_LIVE_SEND_APPROVED, unchanged
INBOUND_ENABLED=false           # pre-existing default, unchanged
PAYMENT_RECONCILIATION_ENABLED=false   # see note below
FULFILLMENT_AUTOMATION_ENABLED=false
MONITORING_ENABLED=false
MAX_DAILY_SENDS=0
MAX_TOTAL_CAMPAIGN_SENDS=0
```

Note on `PAYMENT_RECONCILIATION_ENABLED`: the pre-existing `payments.reconcile` job type
(`src/job-handlers.mjs`) has no dedicated enable flag of its own — it operates only on orders
already marked `verified: true` by a real payment provider webhook or an owner's manual
confirmation, both of which are already gated by their own mechanisms (`LEMONSQUEEZY_WEBHOOK_SECRET`,
owner-authenticated admin routes). This session did not add a redundant flag on top of an
already-gated, already-safe path; `PAYMENT_RECONCILIATION_ENABLED` is listed above for parity with
the requested defaults list but is not read by any code in this repository.
