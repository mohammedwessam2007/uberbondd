# Astra N26 held-app independent source review: hosted green, protected execution refused pending narrow fixes

Source reviewed: PR #1440, exact HEAD 7ded373a84e0c9bcb17d3596ebfdafe086449e3b. Latest retrieved PR updated 2026-10-15T08:01:53Z. New source supersedes the earlier report's "held-app code missing" condition: code EXISTS; it is not yet safe for the promised zero-effect protected probe.

## Independently verified hosted evidence

Retrieved commit-associated runs and every latest job/step summary:
- CI 38702199729 SUCCESS: deterministic, Chromium browser, real PostgreSQL all SUCCESS.
- Night Verification War 38702199869 SUCCESS: real PostgreSQL, browser and core verification all SUCCESS; core includes deterministic, mutation war, relay safety, dependency audit.
- Postal focused 38702199761 SUCCESS.
- UberOutbound Exact Head 38702199737 SUCCESS.
Vercel statuses separately failed; one explicitly reports build-rate-limit. Those are not the above source CI verdicts. No all-platform deployment claim.

## Blocking source findings before original-key binding

1. **Actual server wrapper still runs unrelated startup work under held probe.** server.mjs around line1046 uses unconditional if(wrapperIsEntryPoint), with no PHOENIX_HELD_RESTORE_PROBE exclusion. First async branch creates a store and calls store.init(); second calls currentInfiniteOpusPublicMarket(), then creates another store and calls store.init(). currentInfiniteOpusPublicMarket() around line380 immediately fetches https://openrouter.ai/api/v1/models. These are concrete source paths, not a simulated failed boot. Thus running the documented actual entrypoint with held probe can attempt migrations and an external provider metadata call. SELECT-only grants could refuse writes, but do not make the source's "no migrations/no provider calls" claim true; HTTP route guards do not cover process startup. No actual provider call was triggered by this review.

2. **Both PostgreSQL client constructors disable server certificate verification.** src/phoenix-held-restore-probe.mjs new Client sets ssl to {rejectUnauthorized:false} when cfg.databaseSsl is true; src/store.mjs around line743 does the same in new Pool. The held config accepts sslmode=require, which does not establish the needed verify-full guarantee. Native Node pg connections for this sensitive isolated probe must verify the Neon certificate/hostname using trusted CA material; no secret handoff should rely on unauthenticated server TLS. The prior encrypted backup helper used PGSSLMODE=verify-full against Neon. No TLS protection changed by this review.

## Exact engineering corrections requested from High

- Exclude unrelated wrapper startup diagnostics, migration initialization and market/canary/reconciliation tasks whenever held mode is active, before they can run. Keep only actual app read-only admission, loopback server and same-runtime smoke.
- Prove actual entrypoint boot performs ZERO store.init/migration calls and ZERO external fetch/provider calls, including when no provider keys are present. A focused adversarial entrypoint test should detect these current unconditional branches rather than test only helper functions.
- Require validated TLS in both held admission Client and actual app Pool, with strict target identity and CA verification; reject invalid/untrusted certificate conditions. Keep changes scoped so normal production behavior is not silently altered by this probe work.
- Provide one exact deploy/run command or transient runtime contract for loopback app + HTTP smoke, exact SHA, SELECT-only role and native production-key binding, no unrelated env keys. Do not expose the app publicly to satisfy Render health or start a worker.
- Re-run appropriate exact-source checks and post reviewed protected binding request to #1188. Full-app smoke and post-snapshot writer assessment remain unexecuted.

## Operation state

No new role, credential, service, secret grant, app deploy, source write, cutover, send or spend during this review. Existing successful 57-table/1270-row archive/restore/key receipt remains valid within its Oct15 06:23:09Z snapshot boundary. No replay into nonempty target. This is a precise source admission blocker, not missing founder approval, and not a claim that source CI failed.
