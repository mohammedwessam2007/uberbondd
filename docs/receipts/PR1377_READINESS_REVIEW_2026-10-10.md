# PR #1377 independent readiness review | 2026-10-10 (Africa/Cairo)

**Truth class:** VERIFIED_SOURCE_REVIEW + ONE SOURCE FIX. Zero external effects: no merge, deploy, send, spend, visibility change, credential or production write.

**Reviewed:** head `27218f3` (branch `ubermind/lead-path-freshness-gate-20261010`) against base `cda13c6`. Current `main` is `b3a2680`, which adds only the `mind activation/` docs, so there is no code drift. GitHub reports the PR as `mergeable: true`.

## Verdict

**SOURCE: CORRECT AFTER ONE FIX. RELEASE: NOT READY.** The release blockers are all external or owner gates. None of them is a code defect.

## Does the PR close the stale-evidence defect at source? Yes, on every path that can reach a send.

| Path | Evidence | Stale Oct-2 claim result |
|---|---|---|
| Intake | `src/prospect-verification-intake.mjs` lead-path branch → `inc('lead-path-observation-stale-recheck-required')` | `INCOMPLETE` |
| Preflight | `src/prospect-preflight.mjs:156` calls intake with the caller's `now` | `BLOCKED_EXTERNAL_FACT` (regression test) |
| Tournament | `src/prospect-message-tournament.mjs:234` requires `VERIFIED_CANDIDATE`, so no winner | no message |
| G-SPOT cockpit readout | `src/revenue-singularity-service.mjs:382-407` (`safeGspotEvidenceFor`) recomputes intake, tournament and preflight on every snapshot with `s.now`. No readiness value is cached | `preflightState` is blocked live |
| Frozen effect at send time | `src/frozen-prospect-effect.mjs:24-41` re-runs preflight with the current `now`, requires `READY_FOR_AUTHORIZATION` and an identical digest. The effect expires within 30 minutes | an effect frozen while fresh cannot be sent after the claim goes stale |
| Handoff | `src/prospect-preflight-handoff.mjs:79` passes `now` | gated |

There is no widening path: `evidenceMaxAgeMs` can only tighten the window (tested with `Infinity`, `MAX_SAFE_INTEGER`, garbage values). No HTTP caller supplies it.

## Defect found and fixed in this review

**MEDIUM: the new gate failed open on an invalid evaluation clock.** When `now` was unparseable (`new Date('garbage')`, `'garbage'`, `NaN`), `nowMs` became `NaN`. Every age comparison then evaluated false, so a 48-hour-old claim passed intake with `recheckRequired:false`, `freshness:NaN` and tournament `sourceFreshness:1`. This was measured, not inferred.

It could not reach a send: end-to-end preflight throws `RangeError` on the same input, so the gate fails closed by crash. It was still a fail-open contract defect in a safety gate.

- **Fix:** `clockValid = Number.isFinite(nowMs)`. An invalid clock now produces `rej('evaluation-clock-invalid')`, `freshness 0` and `recheckRequired true`.
- **Test:** a new case in `tests/prospect-evidence-freshness.test.mjs` (now 11/11). Mutation check: disabling the guard fails exactly that test.

## Residual findings (not fixed, by design)

- **LOW:** `src/proof-factory.mjs:25` still labels evidence `FRESH` for up to 30 days, which diverges from the 24-hour claim law. It is not decision-relevant: a stale intake yields no tournament winner, so `messageValidated` stays false and preflight stays blocked. Its other caller (Money Queue proof, line 372) may legitimately want 30 days. Aligning it is a policy choice, not a safety fix.
- **INHERENT:** `observedAt` is an assertion supplied by an owner-authenticated record. The gate enforces recency of the *claimed* time and does not prove the fetch happened. Before any send, a raw same-day capture is still required, as the 2026-10-10 re-observation receipt states.
- **LOW:** `Date.parse` accepts loose formats (`'2026'`, locale dates). This only matters for malformed operator input.

## Tests (this session, on the fixed head)

- 36 focused files (prospect*, frozen*, gspot*, proof-factory, revenue-singularity*, green-lane*, contact-source*): **370/372**.
- The 2 failures are `revenue-singularity-evidence-bridge.test.mjs:115` and `:141` (payment/collection routing). Without this change, the same file shows the same 2 failures (6/8). **0 new failures.**
- The full 9,902-test suite was not re-run, because the prior run is still valid for this diff. The pre-existing failures are 58 plus a syntax error in `tests/infinite-opus-haiku55-live-canary.test.mjs:37`, which belong to `main`, not this PR.

## Exact release blockers (verified 2026-10-10T01:04Z)

1. **CI never ran.** For head `27218f3`, GitHub check-runs show `deterministic`, `core-verification`, `postgres*` and `browser*` as `failure`, and `verify`, `merge` and `admission` as `skipped`. The runner log reports "account is locked due to a billing issue", which is user-reported and not read from the billing settings. This is infrastructure non-evidence, not a source failure.
2. **Egypt sender-side legal hold.** `BLOCKED_LEGAL_AUTHORITY` (`sender-side-legal-authority-hold-unresolved`) is unchanged. Merging does not clear it.
3. **No merge and no deploy authority.** Production G-SPOT still runs pre-PR code, so it lacks the freshness gate. Do not rely on any production READY readout for a lead-path claim older than 24h until this PR is merged and deployed.
4. **Evidence expiry.** The Powerhouse/Sylvester re-observation is valid until **2026-10-11T00:38Z**. After that, the gate itself blocks reuse.
5. **Owner privacy decision.** The repository is `private: false`. The full 890 transcript is public on `main` and in history since `1380ae9`.

## 890 crossover

The fix strengthens `founder-moonshot-0483` THE TRUST GRADIENT (recency dimension). `founder-moonshot-0449` THE REALITY TYPE SYSTEM supports the residual note that a claimed observation time is an assertion, not a verified fact. Neither idea is claimed realized. The corpus was not touched: manifest and shards are unchanged, 890/890.

## PHOENIX

`UBERBOND-PR1377-READINESS-REVIEW-20261010`: the PR closes the stale-claim defect on all send-reachable paths, and the invalid-clock fail-open is fixed and mutation-tested. Release is blocked only by the CI billing lock, the Egypt sender-side legal hold, owner merge/deploy authority and the transcript-visibility decision. Claude Pro usage: UNKNOWN (not measured).

## PHOENIX FOLLOW-UP: rejected-future freshness metadata (2026-10-10 Cairo)

**New actual source defect independently reproduced:** On PR head `17033ddd7957e9241fd9477cd3e9320a2f584f86`, `compileProspectVerification` correctly marked an observation >5 minutes in the future `REJECTED`, but the returned `evidenceFreshness` falsely advertised `freshness: 1`, `recheckRequired: false`, `leadPathObservationAgeMs: 0`. This is a metadata fail-open/contradiction, **not** proof that an outbound send was possible.

**Narrow correction on the existing draft branch, without touching sender authority:** The age computation now treats observations beyond the allowed future-skew threshold as invalid for freshness accounting. They return `leadPathObservationAgeMs: null`, `freshness: 0`, `recheckRequired: true`; `REJECTED` is preserved. Observations exactly 5 minutes ahead remain within the pre-existing skew allowance; >5min by 1ms rejects. Stale >24h and invalid-clock behavior are unchanged.

**Committed evidence:** `e4a16f629218d39e3c89fa8afc681252f2dff7e2` code fix; `3d9edca7f39a7fde685f205b32f0fb77cbd715c9` adversarial test augmentation. Source blob `13773a527fb5a8d880b5cd2f0fcf345eac0f79a6`, test blob `42f2e536261dd586936d620e98e58d03ab8cdb0e`.

**Verification honesty:** Independent exact-source extracted V8 function execution under clearly *stubbed imports*, **6/6** checks PASS: rejected +2h future, rejected +5min+1ms, allowed exactly +5min, allowed age 1h, blocked age 24h+1ms, invalid clock. This is **not native Node module execution and not a substitute for the registered test file or CI**. Existing `tests/prospect-evidence-freshness.test.mjs` now has one additional test and stronger future-rejection assertions (12 defined tests total); actual native run on this new head remains **UNEXECUTED** due GitHub Actions runner startup failures.

**Remaining unchanged:** Public repo privacy decision, GitHub Actions zero-step billing restriction, Egypt `BLOCKED_LEGAL_AUTHORITY`, production running older `24854739d70617d57807cde5407a84266cca477c`, no merge/deploy/paid provider dispatch/customer outreach, and actual Claude Pro allowance savings UNKNOWN. This addendum supersedes the older phrase "no more source defects" for this one newly discovered metadata inconsistency; earlier results retain their proper historical source-head scope.

**Next:** Run native `node --test tests/prospect-evidence-freshness.test.mjs` plus preflight, tournament, frozen-effect and G-SPOT suites on the exact new head when a compatible zero-spend runner is available; verify any new failures against current `main` before release. Do not merge or deploy solely on source-contract checks.
