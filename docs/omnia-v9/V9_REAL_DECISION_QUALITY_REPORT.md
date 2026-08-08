# OMNIA V9 Real Decision Quality Report

Machine-readable evidence: [`artifacts/omnia-v9/reality-shadow-report.json`](../../artifacts/omnia-v9/reality-shadow-report.json) (`results`, `comparisonByLabel`). Every count in this report was recomputed directly from that file's per-scenario `results` array, not estimated.

This mission's explicit instruction: *"Excessive denial is not intelligence. A system that denies everything is very safe and completely useless."* This report classifies every disagreement honestly against that standard — it does not treat a `LEGACY_ALLOW_V9_DENY` count as automatically good, and it corrects a defect found while producing these numbers rather than reporting the defect's output as if it were correct (see below).

## A defect found while building this report

The 8 `revocation-*` scenarios initially classified as `BOTH_ALLOW` instead of `V9_INCOMPLETE`, because [`src/omnia-v9/integrations/replay.mjs`](../../src/omnia-v9/integrations/replay.mjs) never forwarded `revokedApprovalIds` to `admitAction()` — a non-frozen integration-harness defect present since PR #19, not a frozen-kernel defect (the kernel's own revocation handling is independently verified correct against real PostgreSQL). Fixed, with a regression test (`tests/omnia-v9-reality-shadow-dataset.test.mjs`). Full detail: [`V9_REALITY_SHADOW_REPORT.md`](./V9_REALITY_SHADOW_REPORT.md). All numbers below reflect the corrected replay.

## LEGACY_DENY_V9_ALLOW — the blocking safety category

**Count: 0, in both SYNTHETIC and ADVERSARIAL.** Zero false-allow candidates across all 188 scenarios and across the full-stack real-Postgres/real-Cedar demonstration. This is the one number that would have blocked `V9_CANARY_ELIGIBLE` outright if nonzero — it is not.

## LEGACY_ALLOW_V9_DENY — 69 total (55 SYNTHETIC, 14 ADVERSARIAL)

V9 is stricter than legacy in these cases. Per this mission's explicit rule, each subclass is classified individually, not assumed to be "V9 is smarter":

| Scenario group | Count | Classification | Root cause |
|---|---:|---|---|
| `evidence-missing-url-*` (even-indexed, SYNTHETIC) | 5 | `V9_CORRECTLY_STRICTER` | legacy allows an internal-only signal; V9's evidence-requirement gate correctly requires external evidence for a `COMMUNICATE_EXTERNAL` effect class |
| `constitution-missing-*` (SYNTHETIC) | 6 | `V9_CORRECTLY_STRICTER` | blank `constitutionDigest` before a consequential effect — exactly the fail-closed gate this architecture exists to enforce |
| `policy-deny-*` (SYNTHETIC) | 8 | `V9_CORRECTLY_STRICTER` | policy authorizer explicitly denies despite valid authority — the policy layer doing its job |
| `policy-digest-missing-*` (SYNTHETIC) | 6 | `V9_CORRECTLY_STRICTER` | blank `policyDigest` before a consequential effect |
| `kill-state-*` (SYNTHETIC) | 6 | `V9_CORRECTLY_STRICTER` | global kill switch active — the kill switch working |
| `malformed-*` (NaN/Infinity numeric fields, SYNTHETIC) | 6 | `V9_CORRECTLY_STRICTER` | frozen intent verification correctly rejects non-finite `blastRadius`/`maxCostUsd` |
| `missing-evidence-*` (SYNTHETIC) | 6 | `V9_CORRECTLY_STRICTER` | evidence record cannot be resolved by ID at all |
| `stale-evidence-*` (SYNTHETIC) | 6 | `V9_CORRECTLY_STRICTER` | evidence lifecycle flagged `STALE` — correctly treated as inactive |
| `cedar-unavailable-*` (SYNTHETIC) | 6 | `V9_CORRECTLY_STRICTER` | policy authorizer throws (simulated Cedar outage); frozen kernel fail-closes to `DENY` |
| `evidence-tamper-*` (ADVERSARIAL) | 8 | `V9_CORRECTLY_STRICTER` | forged external-source reference correctly rejected |
| `inconsistent-evidence-*` (ADVERSARIAL) | 6 | `V9_CORRECTLY_STRICTER` | evidence content mutated after its digest was computed — digest mismatch correctly detected |

**Summary: 0 of the 69 are classified `V9_FALSE_DENY` or `DATA_QUALITY_FAILURE`.** Every stricter-than-legacy case traces to a real, intentional gate (evidence requirement, policy authorizer, digest binding, numeric validity, evidence integrity, kill switch, or Cedar-outage fail-closing, or forgery detection) — not an artifact of missing data or an overzealous heuristic. This mission does not conclude "V9 is better" from this alone; it concludes each group individually, per the instruction above, and none of the 69 individual conclusions is "V9 is guessing wrong."

Separately, `policy-review-*` (4 scenarios, SYNTHETIC) returns `REVIEW` rather than `DENY` and is classified `INSUFFICIENT_EVIDENCE` — counted under `V9_INCOMPLETE` below, not here, since V9 declined to decide in either direction.

## V9_INCOMPLETE — 62 total (50 SYNTHETIC, 12 ADVERSARIAL)

| Scenario group | Count | Authority or evidence gap | Root cause |
|---|---:|---|---|
| `expiry-*` (SYNTHETIC) | 10 | approval-shaped | approval's own `expiresAt` has passed |
| `revocation-*` (SYNTHETIC) | 8 | approval-shaped | approval explicitly revoked (post-fix, see above) |
| `tenant-mismatch-*` (SYNTHETIC) | 8 | approval-shaped | approval's tenant does not match the intent's tenant |
| `wrong-recipient-*` (SYNTHETIC) | 8 | approval-shaped | approval's resource prefix does not cover the intent's recipient |
| `excessive-blast-radius-*` (SYNTHETIC) | 6 | approval-shaped | approval's `maxBlastRadius` (0) does not cover the intent |
| `excessive-cost-*` (SYNTHETIC) | 6 | approval-shaped | approval's `maxCostUsd` does not cover the intent |
| `policy-review-*` (SYNTHETIC) | 4 | neither | policy authorizer returns `REVIEW` (ambiguous match) — correctly declines to guess |
| `forged-signature-*` (ADVERSARIAL) | 6 | approval-shaped | approval signed by an untrusted key — signature verification fails, so no covering approval resolves |
| `mutated-after-signing-*` (ADVERSARIAL) | 6 | approval-shaped | approval content mutated post-signature — digest mismatch, no covering approval resolves |

All 62 trace to the same root cause family: **no covering, unrevoked, in-scope approval exists to check against**, or (4 cases) an explicit policy ambiguity. This is the honest gap this mission's own frozen-baseline document already named: *no real owner-issued approval exists yet in production*. Wiring real Cedar cannot close this gap, because Cedar was never the blocker — see [`V9_REALITY_SHADOW_REPORT.md`](./V9_REALITY_SHADOW_REPORT.md)'s incomplete-case waterfall.

**Evidence gaps vs. approval gaps, separated:** none of the 62 are evidence-shaped (evidence-shaped gaps — `missing-proof-*`, `inconsistent-proof-*`, `stale-proof-*` — all resolve to `DENY`, not `REVIEW`, since the frozen evidence-verification gate runs and fails before the approval-covering check would even matter; they are counted under `LEGACY_ALLOW_V9_DENY` above, not here). 58 of the 62 are approval-shaped; 4 are a policy ambiguity. **Integration failures: 0** — no `V9_INCOMPLETE` in this set traces to a real Cedar or Postgres wiring defect; every instance is the correct response to a genuinely absent or out-of-scope authority, or an ambiguous policy match.

## V9_ERROR — 6 total (all SYNTHETIC, 0 ADVERSARIAL)

All 6 are `db-unavailable-*` scenarios, where `usageResolver` throws to simulate a database outage. `admitAction()` (frozen kernel) does not internally catch this (unlike `policyAuthorizer` exceptions, which it fail-closes to `DENY`), so the exception propagates and is caught by the frozen `observeOutboundFinalAdmission()` wrapper as `SHADOW_ERROR`/`REVIEW` — verified never to crash or block the legacy send path (`tests/omnia-v9-integration-outbound.test.mjs`, re-confirmed this mission in `tests/omnia-v9-reality-shadow-failure-drills.test.mjs` against a real database connection failure, a real read-timeout simulation, and a missing proof object). **Zero unresolved `V9_ERROR` cases** — every one has a known, tested, safe cause.

## BOTH_ALLOW / BOTH_DENY (agreement, no review needed)

46 `BOTH_ALLOW` + 5 `BOTH_DENY` = 51 of 162 SYNTHETIC candidates require no owner attention at all:

| Scenario group | Count |
|---|---:|
| `authority-valid-*` | 10 |
| `idempotency-consistent-*` / `idempotency-key-mismatch-*` | 18 |
| `concurrency-determinism-*` | 6 |
| `provider-uncertain-*` | 6 |
| `malformed-timestamp-*` | 4 |
| `expiry-intent-window` | 1 |
| `tenant-cross-campaign-evidence` | 1 |
| `evidence-missing-url-*` (odd-indexed, `BOTH_DENY`) | 5 |

One data-quality note, not a defect: the four `malformed-timestamp-*` scenarios are named for testing a malformed `observedAt`, but their `build()` does not actually corrupt the timestamp — they resolve `BOTH_ALLOW` because nothing was actually malformed. This is a scenario-naming/coverage gap inherited from PR #19 (the scenario doesn't test what its name claims), not a V9 behavioral defect, and is noted here for completeness rather than silently left unexplained.

## Unresolved cases

**None.** Every one of the 188 candidates classifies into exactly one of the six mandated categories with a traced root cause; none required manual reclassification or was left ambiguous.
