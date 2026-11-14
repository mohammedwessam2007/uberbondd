# UberBond P0.1 Acceptance Repair Report

> Completed: 2026-07-15  
> Sole code baseline: attached `UberBond_LaunchReady_P0_Updated.zip`  
> Baseline SHA-256: `6ff470b19f7a1771e5dcd9c43b58177e407f2381c8f7c6dfd02ae50f4a02463b`  
> Package version: `1.4.0`  
> Scope: local Cash Engine Lite acceptance repair only  
> Deployment: not attempted

## Outcome

All four confirmed P0.1 blockers are resolved at the Cash Engine Lite report boundary. The existing full-engine audit rules remain available, while customer-facing Lite reports now enforce a deterministic eligibility gate before findings can influence report content, priorities, Quick Wins, implementation options, or score.

The customer CTA also names the actual ranked priority titles using `textContent`. No product, architecture, migration, workflow, provider integration, screenshot storage, payment, subscription, monitoring, outreach, or external deployment change was made.

## Actual-state reconciliation

The attached Claude packet reviewed an older baseline. The supplied P0 ZIP already contained the P0 launch loop, typed evidence validation, truthful processing stages, structured implementation requests, broad-SMB copy, retry behavior, secure report tokens, and SSRF controls. The remaining defects were limited to the following current-code behaviors.

| Acceptance item | Current P0 state before repair | P0.1 result |
|---|---|---|
| Customer-safe finding filter | `sanitizeFinding` removed `safeForOutreach` before eligibility was checked; confidence was used for ranking but not public finding admission | Resolved: eligibility is enforced after evidence normalization and before all public projections; the internal flag is removed before report JSON |
| Broad-SMB vertical contamination | Full-engine `medical-trust` and `arabic-opportunity` rules could enter a Lite report from website text alone | Resolved: Lite suppresses both unless an explicit verified structured industry or Gulf market context is supplied; the full-engine rules were not deleted |
| Degraded-crawl absence claims | A partial crawl could turn missing observations into high-confidence absence defects | Resolved: any non-empty `crawl.errors` suppresses the required observation-completeness-dependent codes; independently valid positive measurements remain eligible |
| Score calibration | Every finding applied `severity × confidence × 4`, allowing one issue to over-punish and overlapping issues to multiply deductions | Resolved: scoring starts at 96 and applies one maximum confidence-weighted severity penalty per distinct problem family |
| CTA continuity | Implementation CTA remained generic despite ranked priorities being available | Resolved: supporting copy names up to three actual ranked titles using `textContent`; selectable options come from the already-filtered report projection |

## Blocker resolution details

### 1. Customer-safe finding filter

The report builder now follows this deterministic admission sequence:

1. Normalize customer-safe fields.
2. Validate typed evidence and its public HTTP(S) URL.
3. Preserve `safeForOutreach` internally.
4. Require `safeForOutreach !== false`.
5. Require confidence greater than or equal to `0.72`.
6. Apply verified vertical-context and degraded-crawl rules.
7. Strip the internal eligibility flag.
8. Build findings, priorities, Quick Wins, implementation options, and score only from the resulting public set.

`safeForOutreach` is absent from the returned report, nested priorities, nested Quick Wins, and implementation options. Invalid evidence still suppresses the finding before admission.

Regression coverage proves that `thin-discovery` at confidence `0.60` with `safeForOutreach=false` reaches none of:

- `report.findings`;
- report priorities;
- Quick Wins;
- structured implementation-request options;
- score deductions.

Separate unsafe high-confidence and safe low-confidence cases are also rejected.

### 2. Broad-SMB vertical isolation

Cash Engine Lite continues to call `deterministicAudit` without prospect industry or market metadata. The Lite report boundary now rejects:

- `medical-trust` unless `verifiedMetadata.industry.verified` is true and its structured industry code is in the medical allowlist;
- `arabic-opportunity` unless `verifiedMetadata.market.verified` is true and its structured country code is one of `AE`, `SA`, `QA`, `KW`, `BH`, or `OM`.

No current Lite submission supplies that metadata, so both rules are suppressed from customer reports. The rules remain unchanged in `src/audit-rules.mjs` for future workflows that can provide verified context.

Regression coverage deliberately demonstrates the former false-positive path first, then proves suppression:

- a gym containing “healthy products” triggers the broad full-engine keyword rule but receives no Lite `medical-trust` finding;
- a French multilingual business mentioning one Dubai client triggers the broad full-engine market keyword rule but receives no Lite `arabic-opportunity` finding;
- vertical-only findings produce no public findings or implementation options and no clinic-, medical-, Gulf-, or Arabic-specific customer report content.

### 3. Degraded-crawl absence suppression

When `crawl.errors` is non-empty, Lite suppresses these observation-completeness-dependent findings:

- `no-cta`;
- `weak-contact-path`;
- `missing-h1`;
- `missing-title`;
- `missing-description`;
- `thin-discovery`;
- `mobile-primary-action-hidden`.

The stored public summary records only the error count and the policy `absence_findings_suppressed`; raw crawl errors are not copied into report JSON. Positive findings may remain only when their own typed evidence validates.

Regression cases cover navigation timeout, page HTTP error, and incomplete/blocked crawl. In each case all required absence claims are removed while a valid laboratory `PerformanceNavigationTiming.domContentLoadedEventEnd` measurement survives. The report contains no timeout message, crawl error identifier, status detail, stack information, or internal path.

### 4. Score calibration

The deterministic score is:

```text
base score = 96
finding penalty = severity^1.5 × 1.1 × confidence
family penalty = maximum eligible finding penalty within that problem family
score = round(base score − sum of family penalties), bounded to 15–94 when findings exist
```

Only public, safe, confidence-qualified, context-qualified, evidence-validated findings enter this calculation. Findings in the same defined family, such as `no-cta` and `cta-below-fold`, share one maximum penalty. The report records the formula, total deduction, and number of scored problem families for auditability.

Deterministic acceptance values are:

| Supported findings | Score | Band |
|---|---:|---|
| None | 96 | Excellent |
| One distinct severity-5 finding at `0.99` confidence | 84 | Good |
| Three distinct severity-5 findings at `0.94` confidence | 61 | Needs work |
| Seven distinct severity-5 findings at `0.94` confidence | 15 | Critical gaps |

An overlapping second conversion finding leaves the score unchanged. A set containing only unsafe, low-confidence, and invalid-evidence findings remains at 96.

### 5. CTA continuity

The report summary now contains implementation options projected only from eligible public findings. The viewer consumes that projection rather than recombining arbitrary data. Supporting CTA copy names up to three actual `topFixes`; if no ranked priority exists, it uses the broad-SMB generic fallback. Every dynamic title and option is assigned through `textContent`.

## Changed files

Relative to the supplied ZIP baseline:

1. `lite/lib/report.mjs`
2. `lite/public/report.html`
3. `lite/public/report.js`
4. `tests/lite-p0.test.mjs`
5. `tests/lite.test.mjs`
6. `P0_1_ACCEPTANCE_REPAIR_REPORT.md` — new

No other baseline file was changed. Dependency installation created local `node_modules`, which is excluded from the repository package.

## Exact test commands and results

### Pre-edit baseline

```text
Command: npm run check
tests 84
pass 84
fail 0
cancelled 0
skipped 0
todo 0
duration_ms 10806.64879
Result: PASS
```

### Focused P0.1 regression run

```text
Command: node --test tests/lite-p0.test.mjs tests/lite.test.mjs
tests 36
pass 36
fail 0
cancelled 0
skipped 0
todo 0
duration_ms 1612.537181
Result: PASS
```

### Required dependency install

```text
Command: npm ci
Result: ENVIRONMENT-BLOCKED
Exit code: 254
Reason: npm attempted to create its cache at /root/.npm, which is unavailable in this sandbox.
```

The same lockfile install was then completed without altering dependencies:

```text
Command: npm ci --cache /tmp/uberbond-p0-1-npm-cache
added 20 packages in 1s
Exit code: 0
Result: PASS
```

The literal attempt also emitted temporary tar-cache retry warnings before failing at the unavailable cache directory. The writable-cache install completed cleanly; neither package file nor lockfile changed.

### Final syntax and deterministic check

```text
Command: npm run check
tests 91
pass 91
fail 0
cancelled 0
skipped 0
todo 0
duration_ms 9229.930766
Exit code: 0
Result: PASS
```

The command first passed every configured `node --check` syntax target, including the changed report builder and browser report script, then passed the complete deterministic suite.

### Dependency audit

```text
Command: npm audit --cache /tmp/uberbond-p0-1-npm-cache
found 0 vulnerabilities
Exit code: 0
Result: PASS
```

## Environment-blocked tests and external validation

| Validation | Result | Reason |
|---|---|---|
| `npm run test:browser` | Not run; environment-blocked | Playwright expected `/root/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome`, which is not installed |
| Chromium installation | Not attempted | The mission prohibited repeated installation attempts; availability was checked once |
| Hosted Vercel application | Not run | External accounts and deployment were prohibited |
| Live Neon migration/database | Not run | External accounts and credentials were prohibited |
| GitHub Actions worker | Not run | GitHub access was prohibited |
| Resend delivery | Not run | Provider access was prohibited |
| Real public website audit | Not run | Requires the hosted application, database, and worker loop |

## Unchanged capabilities

- Secure, hashed capability report tokens and no-store/noindex/no-referrer handling.
- URL normalization, DNS resolution checks, private/reserved-address rejection, redirect validation, and SSRF protection.
- Neon-backed queue storage, atomic worker claims, retry ceiling, stale-run recovery, and truthful durable processing stages.
- Typed evidence validation, safe URL enforcement, internal-detail rejection, and `textContent` rendering.
- Structured implementation-request storage before optional notification, exact duplicate protection, and safe notification fallback.
- Temporary screenshot capture and guaranteed cleanup; no persistent screenshot claim.
- Existing Vercel configuration, Lite migration, GitHub Actions workflow, constitutional documents, and launch instructions.

## Intentionally deferred

- Persistent screenshot storage.
- Payment, subscriptions, recurring monitoring, and outreach automation.
- Multi-pillar scoring, revenue estimates, traffic-dependent prioritization, and new vertical modules.
- Retroactive reprocessing of any report data created by an older deployment; an existing report should be rerun after upgrade if applicable.
- Any external deployment or account action.

## Known limitations

1. The performance observation is laboratory navigation timing, not field Core Web Vitals.
2. Any non-empty crawl error causes conservative absence suppression, which can reduce report breadth even when the successfully loaded homepage was complete.
3. Vertical rules remain unavailable in Lite until a future authorized workflow supplies verified structured context; website copy alone is intentionally insufficient.
4. The score is calibrated for deterministic issue families, not a comprehensive measure of business quality.
5. Screenshots remain temporary and are not available in the customer report.
6. Capability report URLs must remain private because possession grants access.
7. No hosted runtime, live database, workflow runner, notification provider, or real website was validated locally.

## Deployment prerequisites

- Complete repository imported into GitHub.
- Neon pooled `DATABASE_URL` with `lite/migrations/lite_001.sql` applied.
- Vercel project using Root Directory `lite`, Framework **Other**, and output directory `public`.
- Vercel environment values `DATABASE_URL` and `LITE_HASH_SALT`.
- GitHub Actions secret `LITE_DATABASE_URL`.
- Optional owner-notification secrets only if email delivery is desired.
- One public website the owner controls or is authorized to audit.

## First live validation procedure

1. Deploy the updated repository using the existing `START_HERE_ZERO_CASH_IPAD.md` instructions.
2. Submit one authorized broad-SMB website and save its private report URL.
3. Trigger **Cash Engine Lite Audits** once through GitHub Actions.
4. Confirm the report completes and contains only typed-evidence-backed findings.
5. Confirm no unsafe, low-confidence, contextless medical/Gulf, or crawler-failure absence finding appears.
6. Confirm the score and CTA priority titles match the eligible findings.
7. Select one implementation option and submit the request twice.
8. Confirm one structured `lite_leads` row exists and the second submission is acknowledged as a duplicate.

## Launch readiness verdict

**P0.1 CODE READY FOR OWNER-CONTROLLED HOSTED VALIDATION; NOT DEPLOYED.** All confirmed local acceptance blockers are resolved and deterministic tests pass. Launch is not proven until the external submission → worker → secure report → implementation-request loop succeeds once.

## Single next owner action

Deploy this exact P0.1 repository through the existing `START_HERE_ZERO_CASH_IPAD.md` path and complete one authorized end-to-end hosted audit validation.
