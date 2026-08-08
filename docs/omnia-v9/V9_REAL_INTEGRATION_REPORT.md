# OMNIA V9 Real Integration Report

**Result: V9_INTEGRATION_SHADOW_READY**

Machine-readable evidence: [`artifacts/omnia-v9/integration-report.json`](../../artifacts/omnia-v9/integration-report.json). Branch: `product/omnia-v9-real-integration`, forked from the second closure mission's final verified state (`claude/omnia-v9-closure-verify-1iuar2` @ `5dc1b082a3f8b8a9d437680021e87bb115673913` — see [`OMNIA_V9_FROZEN_BASELINE.md`](./OMNIA_V9_FROZEN_BASELINE.md)).

## What this mission did

Took a verified-but-unused kernel and connected it to one real UberBond decision point — the outbound email send path — without changing what UberBond actually does. `OMNIA_V9_MODE` (`off`/`shadow`/`compare`, default `off`, unknown values fail to `off`) controls whether V9 observes at all. In every mode, legacy send-safety, reservation, and Gmail dispatch logic run exactly as they did before this mission.

## V9 Frozen Identity

- Baseline SHA: `4e256c91de5d21f2f69027534ef45cd9876fdf2b` (tested), `5dc1b082a3f8b8a9d437680021e87bb115673913` (report commit, fork point for this branch)
- Constitution digest: `e0a38ea42ce17ed6f18f1e465c4465fc47cf9183396e008838414e5e473508bd`
- Policy digest: `9ccecfff9cae4b82b7a896495a434100752201597c80cd85cb691c50401cb98b`
- Cedar: `@cedar-policy/cedar-wasm` 4.12.0
- Migrations: 001–008

## Integration

- **Files changed**: 4 modified additively (`final-admission-shadow.mjs` +1 optional parameter, `pipeline.mjs` +1 line, `worker.mjs`/`server.mjs` +3 lines each for mode wiring), 7 added (`src/omnia-v9/integrations/{config,outbound-admission,compare,metrics,replay-scenarios,replay}.mjs`, `scripts/omnia-v9-replay.mjs`).
- **Frozen core files modified: zero.**
- **Integration point**: the pre-existing P4 shadow hook seam in `Pipeline.maybeSend()`, which already existed (defaulting to a harmless `NO_HOOK` no-op) before this mission.
- **Modes**: `off`, `shadow`, `compare`. No `canary` or `enforce` value exists anywhere in the code.
- **Legacy behavior preservation**: verified by test, not assumed — identical send outcome and count across all three modes; a V9 `DENY` never blocks a legacy-eligible send; a crashing V9 hook never blocks or duplicates a send; duplicate-send idempotency is unchanged under compare mode.

## Replay (synthetic, offline — not production data)

188 scenarios across the 21 mandated failure classes:

| Category | Count |
|---|---|
| BOTH_ALLOW | 54 |
| BOTH_DENY | 5 |
| LEGACY_ALLOW_V9_DENY | 69 |
| **LEGACY_DENY_V9_ALLOW** | **0** |
| V9_INCOMPLETE | 54 |
| V9_ERROR | 6 |

Zero critical disagreements. Full breakdown and per-scenario results: [`V9_REPLAY_REPORT.md`](./V9_REPLAY_REPORT.md).

## Performance

Pure in-memory decision computation (no live database or Cedar call per decision in this integration slice): P50 ≈ 0.36ms, P95 ≈ 0.82ms, P99 ≈ 1.2ms across the 188-scenario replay batch. Storage overhead per decision: one `store.log()` call to the existing `audit_log` table in shadow mode, two in compare mode — zero new tables, zero new migrations. These are replay/synthetic measurements of the decision logic in isolation, not measured production overhead (no live traffic has been run through this integration).

## Founder Burden (estimated from replay, NOT measured in production)

Applying `buildFounderBurdenEstimate()` to the replay confusion matrix: 129 of 188 replayed scenarios would require some form of review (`LEGACY_ALLOW_V9_DENY` + `V9_INCOMPLETE` + `V9_ERROR`). This number is dominated by a single, honestly-stated fact: **no real owner-issued approval or live Cedar policy exists in production yet**, and most replay scenarios deliberately probe exactly that gap. It is not a forecast of real-world review burden — it is a measurement of how strict V9 is when it has no real authority to check against, which is the correct and safe default, not a defect. Real founder-burden numbers require real shadow-mode data against real traffic, which this mission does not have and does not fabricate.

## Safety

- False-allow candidates observed this mission: **0** (zero `LEGACY_DENY_V9_ALLOW` across 188 replay scenarios).
- False-deny candidates (V9 stricter than legacy): 69 in replay, expected and desired — these are adversarial/malformed/tampered scenarios deliberately labeled `legacyEligible: true` to prove V9 catches what a non-cryptographic eligibility check cannot.
- Unresolved proof cases: 54 `V9_INCOMPLETE`, all attributable to the no-real-approval gap, not to a defect.
- Failures: 6 simulated `unavailable-database` scenarios threw as expected; verified (by test) that the real pipeline's pre-existing exception wrapper converts this into a safe `SHADOW_ERROR`/`REVIEW` observation, never a crash or a blocked send.

## Regression

- V9 closure gate (`node scripts/verify-v9-closure.mjs`) re-run against a freshly created disposable PostgreSQL 16 database after all integration changes: **green**, unchanged from the frozen baseline (174/174 V9 tests, 0 fail, 0 skipped).
- Full deterministic regression (`npm run test:deterministic`): **311/311** (267 baseline + 44 new integration tests), 0 fail, 0 skipped.
- Browser tests: `FAILED_ENVIRONMENT` — the same pre-existing Playwright browser-revision mismatch documented in both closure missions, unrelated to this integration. Not silently omitted, not misreported as passing.
- `lite/`: confirmed unmodified (`git diff --stat origin/main -- lite/` and `git status --short lite/` both empty).

## What was deliberately not built

No enforcement, no canary activation, no real Cedar policy wired into live decisions, no owner-approval issuance flow, no payment integration, no new database migrations, no dashboard, no V10. See [`V9_COMPLEXITY_AUDIT.md`](./V9_COMPLEXITY_AUDIT.md) for the full classification of what's required now versus later, and [`V9_CANARY_CONTRACT.md`](./V9_CANARY_CONTRACT.md) / [`V9_PAYMENT_ADAPTER_SPEC.md`](./V9_PAYMENT_ADAPTER_SPEC.md) for what's designed-but-not-activated.

## Promotion

**V9_INTEGRATION_SHADOW_READY.**

Not `PRODUCTION_READY`. Not `AUTONOMOUS`. No enforcement exists, no canary has run, and this mission does not claim any of those. What exists: a real, tested, non-authoritative observation layer sitting in front of UberBond's real outbound send path, that can be turned on with one environment variable and turned off with the same variable, that has never once been shown — in 188 adversarial synthetic scenarios or in the integration test suite — to be more permissive than the legacy check it observes.
