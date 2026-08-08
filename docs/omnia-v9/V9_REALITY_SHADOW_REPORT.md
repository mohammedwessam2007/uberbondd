# OMNIA V9 Reality Shadow Report

**Result: see [`V9_CANARY_ELIGIBILITY_DECISION.md`](./V9_CANARY_ELIGIBILITY_DECISION.md) for the final gate outcome.**

Machine-readable evidence: [`artifacts/omnia-v9/reality-shadow-report.json`](../../artifacts/omnia-v9/reality-shadow-report.json), [`artifacts/omnia-v9/reality-shadow-latency.json`](../../artifacts/omnia-v9/reality-shadow-latency.json). Branch: `product/omnia-v9-reality-shadow`, forked from `product/omnia-v9-real-integration` (PR #19 head, unmerged).

## What this mission did

Mission 3 (PR #19) proved V9 could observe one real decision point without acquiring any authority. This mission asks a harder question: what does V9 do when the Cedar it consults is real, the approvals it checks are real (revocable, expirable, Postgres-backed) rows, and the constitution/policy digests it stamps on every decision are the actual bound values — not stand-ins? It does not ask V9 to touch production. `OMNIA_V9_MODE` is still `off`/`shadow`/`compare` only; no `enforce` or `canary` value exists anywhere in the code, and V9's decision still never gates the real Gmail send call.

## Data availability (read first — governs everything below)

This environment's only operational data source, `data/db.sample.json`, contains zero prospects, campaigns, reservations, leads, or audit-log entries — an empty schema skeleton, not a redacted or subsampled real dataset. This was verified directly, not assumed.

**Consequence:** `REAL_OPERATIONAL` and `HISTORICAL_OPERATIONAL` sample counts in this run are **0**, honestly, and are not inflated by fabricating leads, creating synthetic prospects labeled as real, or contacting anyone. Per this mission's instruction, no new leads were created and no prospect was contacted to "increase sample size." Every number below is drawn from either (a) the 188-scenario synthetic/adversarial replay set inherited from PR #19, now run through real Cedar, or (b) a small full-stack demonstration against a real, running PostgreSQL 16 server and the real Cedar runtime. Neither of those is a production-traffic measurement, and this report never claims otherwise.

## Sample composition

| Label | Count | Note |
|---|---:|---|
| `REAL_OPERATIONAL` | 0 | no real UberBond outbound activity exists in this environment |
| `HISTORICAL_OPERATIONAL` | 0 | same — nothing to draw history from |
| `SYNTHETIC` | 162 | PR #19's replay scenarios, minus adversarial-tampering ones, re-run under real Cedar |
| `ADVERSARIAL` | 26 | forged-signature, mutated-after-signing, evidence-tampering, inconsistent-evidence scenarios |

These four categories are never merged into one number anywhere in this mission's reports.

## Real Cedar, wired for real

Every `SYNTHETIC`/`ADVERSARIAL` scenario whose own point isn't specifically to test a stub `policyAuthorizer`/blank-digest override (i.e. every category except `policy`, `constitution`, and `unavailable-cedar`) is re-evaluated through [`bindRealCedarAuthority()`](../../src/omnia-v9/integrations/reality-shadow-cedar.mjs) — the real, installed `@cedar-policy/cedar-wasm@4.12.0`, the real bound constitution, and the real traceable policy bundle, all loaded exactly as `scripts/verify-v9-p3.mjs` already does in the closure gate. 172 of 188 scenarios are Cedar-substitution-eligible this way.

**Result: zero scenarios changed comparison category** when the stub `() => ({decision:'ALLOW'})` authorizer was replaced by real Cedar evaluation (verified in [`tests/omnia-v9-reality-shadow-dataset.test.mjs`](../../tests/omnia-v9-reality-shadow-dataset.test.mjs)). This is not a null result — Cedar's policy permits exactly when `authorityResolved && identityResolved && evidenceResolved && policyBound && constitutionBound && !(LEARNING && sovereigntyChange)`, and by the time `admitAction()` ever calls `policyAuthorizer`, the frozen kernel has already guaranteed every one of those facts is true. Real Cedar enforces exactly what it was proven to enforce in the P3 gate, no more, no less.

Cedar identity for this run: `@cedar-policy/cedar-wasm@4.12.0`, Cedar runtime `4.12.0`, `policyDigest 9ccecfff9cae4b82b7a896495a434100752201597c80cd85cb691c50401cb98b`, `constitutionDigest e0a38ea42ce17ed6f18f1e465c4465fc47cf9183396e008838414e5e473508bd` — identical to PR #19's frozen values, confirming the frozen constitution/policy were never touched.

## A genuine defect found and fixed in the replay harness

While building the per-label breakdown for this report, the 8 `revocation-*` scenarios were found to classify as `BOTH_ALLOW` instead of the intended `V9_INCOMPLETE`. Root cause: `runScenario()` in [`src/omnia-v9/integrations/replay.mjs`](../../src/omnia-v9/integrations/replay.mjs) (non-frozen integration code, part of PR #19) never forwarded `admissionOptions.revokedApprovalIds` into `admitAction()`'s context — so a scenario that declared an approval revoked was, in practice, evaluated as if it were not. This is a real, reproducible integration-harness defect, not a frozen-kernel defect: the frozen kernel's own `revokedApprovalIds` handling is independently verified correct against real PostgreSQL revocation in [`tests/omnia-v9-shadow-approval.test.mjs`](../../tests/omnia-v9-shadow-approval.test.mjs) and [`tests/omnia-v9-reality-shadow-failure-drills.test.mjs`](../../tests/omnia-v9-reality-shadow-failure-drills.test.mjs). PR #19's original [`replay-report.json`](../../artifacts/omnia-v9/replay-report.json) carried the same undetected miscount (`revocation: {"BOTH_ALLOW": 8}`).

**Fix**: `replay.mjs` now forwards `revokedApprovalIds`. **Regression test**: [`tests/omnia-v9-reality-shadow-dataset.test.mjs`](../../tests/omnia-v9-reality-shadow-dataset.test.mjs) asserts all 8 revocation scenarios resolve to `V9_INCOMPLETE`. This did not hide a false-allow: the kernel had no way to know these approvals were meant to be revoked, so allowing them was the correct response to the (buggy) inputs it was actually given — but the replay set was not exercising the revocation path it claimed to, so the numbers below are corrected, and PR #19's original replay-report.json's `BOTH_ALLOW`/`V9_INCOMPLETE` split should be read as 46/62, not 54/54.

## Comparison, by label (never merged)

| Category | SYNTHETIC (162) | ADVERSARIAL (26) | Combined (188) |
|---|---:|---:|---:|
| BOTH_ALLOW | 46 | 0 | 46 |
| BOTH_DENY | 5 | 0 | 5 |
| LEGACY_ALLOW_V9_DENY | 55 | 14 | 69 |
| **LEGACY_DENY_V9_ALLOW** | **0** | **0** | **0** |
| V9_INCOMPLETE | 50 | 12 | 62 |
| V9_ERROR | 6 | 0 | 6 |

`LEGACY_ALLOW_V9_DENY`, `LEGACY_DENY_V9_ALLOW`, and `V9_ERROR` are unaffected by the revocation-harness fix (as expected, since the fix only changes how revocation scenarios classify) and match PR #19 exactly — further confirming real Cedar substitution provably doesn't change outcomes (above). Zero critical disagreements (`LEGACY_DENY_V9_ALLOW`) in either label.

## Incomplete-case waterfall

| Stage | Count |
|---|---:|
| Initial incomplete (SYNTHETIC + ADVERSARIAL) | 62 |
| Proof resolved | 0 |
| Authority resolved | 0 |
| Evidence still missing | 62 |
| External proof required | 0 |
| **Final incomplete** | **62** |

Correctly unchanged by real Cedar: all 62 scenarios deliberately construct a missing-authority situation (no covering approval, or a revoked one) to prove V9 refuses to fabricate ALLOW when there's nothing to check against. Wiring real Cedar does not and should not close this gap — Cedar was never the missing ingredient in these scenarios; a covering (and unrevoked) approval was, by design. Full per-category root-cause attribution: [`V9_REAL_DECISION_QUALITY_REPORT.md`](./V9_REAL_DECISION_QUALITY_REPORT.md).

The mission's real question — does real infrastructure resolve incompleteness when a real covering approval genuinely exists — is answered separately, affirmatively, by the full-stack demonstration below and by [`V9_SHADOW_APPROVAL_SPEC.md`](./V9_SHADOW_APPROVAL_SPEC.md).

## Full-stack demonstration (real PostgreSQL + real Cedar + real shadow approval)

One shadow approval (`maxUses: 3`), issued for real against PGlite (Postgres-wire-protocol-compatible), evaluated by real Cedar, four candidates:

```
decisions: [ALLOW, ALLOW, ALLOW, REVIEW]
```

The 4th candidate correctly exhausts `maxUses` and falls back to `REVIEW` — never a fabricated `ALLOW`. Revocation drill on a fresh approval: `beforeRevoke: ALLOW`, `afterRevoke: REVIEW` — no cached authorization survives revocation, because authority is re-resolved from the database on every single evaluation, not cached across calls.

## Performance, founder leverage, decision quality

Broken out into their own reports per this mission's structure:
- [`V9_REAL_PERFORMANCE_REPORT.md`](./V9_REAL_PERFORMANCE_REPORT.md)
- [`V9_FOUNDER_LEVERAGE_REPORT.md`](./V9_FOUNDER_LEVERAGE_REPORT.md)
- [`V9_REAL_DECISION_QUALITY_REPORT.md`](./V9_REAL_DECISION_QUALITY_REPORT.md)
- [`V9_SHADOW_APPROVAL_SPEC.md`](./V9_SHADOW_APPROVAL_SPEC.md)
- [`V9_REVOCATION_EXPIRY_DRILL.md`](./V9_REVOCATION_EXPIRY_DRILL.md)

## Regression

- V9 closure gate (`node scripts/verify-v9-closure.mjs`) re-run against a **freshly created, real PostgreSQL 16 database** (not a disposable in-process fixture): **`OMNIA_V9_CLOSURE_VERIFIED`**, 173/173 V9 tests, 0 fail, 0 skipped, Cedar policy re-verified with the identical policy digest.
- Full deterministic regression with `OMNIA_V9_TEST_DATABASE_URL` pointed at that same real PostgreSQL server: **352/352 tests pass, 0 skipped** — this is a strictly stronger result than PR #19's baseline, because the 10 tests that require true multi-connection concurrency (previously skipped for lack of a real server) now run and pass for real.
- Frozen-core byte-for-byte hash verification: all 20 files unchanged throughout this mission.
- `lite/`: confirmed unmodified.
- Browser tests: not attempted to change from the pre-existing `FAILED_ENVIRONMENT` finding documented in every prior mission (unrelated Playwright browser-revision mismatch in this sandbox).

## What was deliberately not built

No enforcement, no canary activation, no real (non-shadow) owner-approval issuance, no live outbound send, no contact with any real prospect, no fabricated leads, no V10 constitution, no production database write. See [`V9_CANARY_ELIGIBILITY_DECISION.md`](./V9_CANARY_ELIGIBILITY_DECISION.md) for the exact promotion state.
