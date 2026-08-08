# OMNIA V9 Metrics Spec

All aggregation functions live in `src/omnia-v9/integrations/metrics.mjs` and are pure: they take arrays of already-fetched audit records and return numbers. They never query the store themselves, so they cannot accidentally scope a query wrong, and they're trivially unit-testable without a database.

## Safety metrics

Computed by `buildConfusionMatrix(compareRecords)`:
- `counts` — one integer per comparison category (see `V9_COMPARE_MODE_SPEC.md`).
- `disagreementRate` — `(LEGACY_ALLOW_V9_DENY + LEGACY_DENY_V9_ALLOW) / total`.
- `criticalDisagreementCount` / `criticalCases` — every `LEGACY_DENY_V9_ALLOW` instance, promotion-blocking until each is investigated.

Computed by `buildShadowReliabilityMetrics(shadowRecords)`:
- `byStatus` — counts of `OBSERVED` / `NO_HOOK` / `SHADOW_ERROR`.
- `errorRate` — V9 reliability problem rate.
- `noHookRate` — how often the integration wasn't even wired in (should be ~0 once mode is shadow/compare).
- `proofResolutionFailureRate` — fraction of observed decisions that resolved to `REVIEW` (proof/authority incomplete), the leading indicator for "V9 needs real approvals before it can say more than REVIEW."

Additional safety signals to derive from the same record set when analyzing (not yet separately aggregated, since they're direct filters on `v9Reasons`):
- stale-evidence rate: reason `evidence:inactive`.
- revoked-authority rejection rate: reason containing `revoked`.
- duplicate-action prevention: cross-reference `intentDigest`/`reservationId` — the durable reservation layer (frozen, pre-V9) already guarantees this; V9 does not duplicate that guarantee, it observes on top of it.

## Reliability metrics

- **Latency**: `summarizeLatencyMs(latenciesMs)` → P50/P95/P99/count. In production, latency should be measured as wall-clock time around the `hook(context)` call inside `observeOutboundFinalAdmission` (not yet separately instrumented with a timer in this mission — the replay harness measures pure decision-computation time as a lower bound; see `V9_REPLAY_REPORT.md`).
- **Error rate**: `buildShadowReliabilityMetrics(...).errorRate`.
- **Database failure rate**: any `SHADOW_ERROR` whose logged `error` field matches a database-driver error class — filter on the raw records; not separately bucketed to avoid coupling this module to a specific database driver's error shapes.
- **Cedar evaluation failure rate**: N/A for this integration slice — no live Cedar evaluation is wired into the outbound hook yet (see `V9_REAL_INTEGRATION_ARCHITECTURE.md`). Once it is, failures surface as `policy:error:...` reasons on a `DENY` decision (the kernel already fail-closes `policyAuthorizer` exceptions into `DENY`, per the replay report's `unavailable-cedar` findings) and should be counted from there.

## Founder burden metrics

Computed by `buildFounderBurdenEstimate({ confusionMatrix, avoidableReviewMinutes })`:

- `founder_minutes_per_100_governed_actions` — the mission's core metric. Modeled as: only genuine ambiguity requires a human (disagreements in either direction, plus anything V9 could not resolve or errored on); agreements never do. `avoidableReviewMinutes` defaults to 3 and should be replaced with a real measured average once shadow mode has run against live traffic.
- `owner_exceptions_per_100_governed_actions` — scoped specifically to `criticalDisagreementCount` (the one category that must never be silently absorbed into routine review).
- `reviewsPer100GovernedActions` — the denominator for both, useful on its own as "how often does this system produce something ambiguous."

These are estimates from a formula, not measurements, until real shadow-mode data exists. `docs/omnia-v9/V9_REAL_INTEGRATION_REPORT.md` labels every number by its actual source (replay/synthetic vs. real) — never presents a replay number as a production fact.

## Cost metrics

Not separately instrumented this mission (no live traffic to measure against). Structurally, the integration's incremental cost per candidate is:
- one `admitAction()` call: pure CPU, no I/O (see replay latency numbers — sub-millisecond to low-single-digit-millisecond).
- one `store.log()` call in shadow mode, two in compare mode: existing `audit_log` table, no new schema, no new indexes added.
- zero additional Gmail API calls, zero additional external network calls.

This should stay true as long as no live Cedar/database round trip is added to the hook — flagged explicitly as a promotion-blocking cost regression to watch for if/when live Cedar evaluation is wired in later.

## Idempotent-replay dedup

Both `buildConfusionMatrix` and `buildShadowReliabilityMetrics` deduplicate by `reservationId`, keeping the earliest observation per reservation. A retried send (same reservation, re-evaluated) cannot inflate any count in this spec. Covered by `tests/omnia-v9-integration-metrics.test.mjs`.
