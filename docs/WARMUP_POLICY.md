# Warm-up Policy

Implementation: `src/warmup-orchestrator.mjs`, `src/domain-mailbox-circuit-breaker.mjs`,
`src/live-activation-gate.mjs`.

## Policy defaults

- Minimum warm-up period before any dry-run eligibility: **14 days**
  (`cfg.domainMailbox.minWarmupDays`, env `WARMUP_MIN_DAYS`).
- Recommended new-domain period: **21-28 days**
  (`recommendedWarmupDaysLow`/`recommendedWarmupDaysHigh`, env
  `WARMUP_RECOMMENDED_DAYS_LOW`/`_HIGH`) — informational; the *enforced*
  floor is the 14-day minimum.
- Ramp schedule (`plannedWarmupCapForDay`): starts at 2/day, +2/day,
  capped at 40/day by default — structurally incapable of reaching a large
  volume on day one or day thirty. This is a planning function only; the
  cap actually enforced always comes from the provider's own reported
  value when available (`reportedDailyCap`), never this schedule alone.
- A provider claiming `WARMUP_COMPLETE` before the configured minimum
  period has elapsed is **not trusted** — reconciliation fails closed to
  `WARMUP_ACTIVE` instead (tested: `tests/domain-mailbox-readiness.test.mjs`,
  "provider claims WARMUP_COMPLETE before the minimum period elapsed").

## Cap separation (this mission's explicit requirement)

Opportunity-generation cap, verified-contact cap, draft cap, warm-up cap,
and cold-send cap are five different numbers in five different systems in
this codebase — none of them derive from another:

| Cap | Where it lives |
|---|---|
| Opportunity generation | `src/opportunity-registry.mjs` / `src/task-universe.mjs` — unrelated to sending |
| Verified contact | `src/contacts.mjs#verifyEmail` result count |
| Draft | Existing pipeline draft-preparation step, unrelated to warm-up |
| Warm-up | `plannedWarmupCapForDay()` / provider-reported `currentDailyCap`/`currentHourlyCap` |
| Cold-send | The existing `src/send-safety.mjs` volume-quota logic + `src/domain-mailbox-gate.mjs`'s `volumeCeiling` check — **only reachable once a domain reaches `READY_FOR_LIMITED_OUTREACH` with `OUTREACH_AUTHORIZED`**, a state warm-up completion alone can never produce (see `recordOutreachAuthorized`, the only event kind that sets it) |

No code path anywhere lets a large opportunity-generation number leak into
the cold-send cap.

## Provider-native only

`requestMailboxWarmupStart()` only ever calls a real provider adapter's
`warmupCapable()`/`startWarmup()` capabilities. With the only wired
adapter being the unconfigured fixture, every call deterministically
returns `WARMUP_BLOCKED`/`PROVIDER_AUTH_REQUIRED` — proven by test, not
asserted. There is no code path anywhere in this module that sends a
message to a third party, fabricates engagement, or simulates a
conversation.

## Circuit breakers (unchanged from two waves ago, re-verified)

`evaluateCircuitBreaker()` covers every trigger this mission lists: SPF/
DKIM/DMARC/alignment failure, DNS evidence expiry, lost mailbox
authentication, unknown provider health, bounce/complaint rate thresholds,
provider rate limit, duplicate reservation, uncertain provider outcome,
secret-in-log, provider contract change, and V9-bypass attempts. Every
trigger produces reasonCode + timestamp + scope + evidenceRefs +
safeRecoveryAction + ownerRequired.
