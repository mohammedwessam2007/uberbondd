# UberBond Project State

> Snapshot date: 2026-07-15  
> Source of truth for this recovery: attached `UberBond LaunchReady.zip`  
> Product scope preserved: Cash Engine Lite launch recovery only; constitutional architecture not implemented

## Repository proof

The ZIP extracted to an application root containing:

```text
.github/
data/
docs/
fixtures/
lite/
migrations/
public/
scripts/
src/
tests/
.env.example
.gitignore
Dockerfile
package-lock.json
package.json
server.mjs
worker.mjs
```

The complete root contains additional existing operational and deployment Markdown files. The required application proof paths—`package.json`, `server.mjs`, `worker.mjs`, `src/`, `lite/`, `migrations/`, and `.github/workflows/`—are all present.

## Current Cash Engine Lite architecture

```text
Browser
  → Vercel static site in lite/public
  → Vercel Node APIs in lite/api
  → Neon PostgreSQL lite_* tables
  → GitHub Actions lite-audits workflow
  → lite/worker/run-audits.mjs
  → shared src/browser-crawler.mjs + deterministic audit rules
  → report stored in Neon
  → capability-token report API
  → implementation request stored in lite_leads
  → optional Resend owner notification
```

Vercel must use Root Directory `lite`. GitHub Actions must run from the repository root because the Lite worker intentionally imports the shared crawler and audit rules from `src/`.

## Changed-files list

### Deployment, dependencies and CI

- `.github/workflows/ci.yml`
- `package.json`
- `package-lock.json`
- `lite/package-lock.json` — new

### Confirmed launch/security fixes

- `src/security.mjs`
- `lite/lib/security.mjs`
- `lite/lib/http.mjs`
- `lite/lib/email.mjs`
- `lite/api/health.mjs`
- `lite/worker/run-audits.mjs`
- `lite/vercel.json`
- `lite/public/report.html`
- `lite/public/report.js`

### Tests

- `tests/browser.test.mjs`
- `tests/core.test.mjs`
- `tests/lite.test.mjs`

### Corrected launch documentation

- `DEPLOY_CASH_ENGINE_LITE_IPAD.md`
- `LITE_ENV_CHECKLIST.md`
- `START_HERE_ZERO_CASH_IPAD.md` — new
- `LAUNCH_STATUS.md` — new
- `PROJECT_STATE.md` — new

### Constitutional specifications added without runtime implementation

- `docs/constitution/knowledge-graph-v1.md` — new
- `docs/constitution/decision-engine-v1.md` — new
- `docs/constitution/learning-engine-v1.md` — new
- `docs/constitution/core-data-model-v1.md` — new

No other product behavior or architecture was intentionally changed.

## Exact deterministic test result

Final command: `npm run check`

```text
tests 71
suites 0
pass 71
fail 0
cancelled 0
skipped 0
todo 0
duration_ms 8911.265758
```

The command first completed syntax checks for the main server, worker, operational modules, Lite security/API/worker modules, scripts and admin browser JavaScript. It then ran all non-Chromium test files.

Dependency result:

```text
npm audit --omit=dev
found 0 vulnerabilities
```

Install results:

```text
root npm ci: PASS — added 20 packages
lite npm ci --omit=dev: PASS — added 14 packages
```

## Environment-blocked tests and validations

| Test or validation | Reason blocked | Required execution environment |
|---|---|---|
| `npm run test:browser` | Playwright Chromium intentionally not downloaded locally | GitHub CI browser job or a machine with `npx playwright install --with-deps chromium` completed once |
| Hosted Vercel build and API probes | No Vercel account/project or deployment authorization | Owner's Vercel project with Root Directory `lite` |
| Live Neon migration/connectivity | No database credentials | Owner's Neon pooled `DATABASE_URL` |
| Scheduled/manual audit workflow | No GitHub repository/secrets execution context | GitHub Actions with `LITE_DATABASE_URL` |
| Real browser audit/report | Requires deployed API, database and worker | Completed Vercel + Neon + Actions path |
| Resend owner delivery | No provider key or verified sender | Optional Resend configuration |
| Real implementation-request notification | Requires hosted report and owner channel | First owner launch verification |

## Required environment variables

### Vercel production

| Name | Requirement |
|---|---|
| `DATABASE_URL` | Required; Neon pooled connection string |
| `LITE_HASH_SALT` | Required for launch; private random value of at least 32 characters |
| `OWNER_EMAIL` | Optional; required for owner email delivery |
| `RESEND_API_KEY` | Optional; required with `OWNER_EMAIL` for owner email delivery |
| `LITE_EMAIL_FROM` | Optional; sender authorized by Resend |
| `LITE_MAX_PER_IP_HOUR` | Optional; default 3 |
| `LITE_MAX_PER_EMAIL_DAY` | Optional; default 3 |
| `LITE_MAX_ACTIVE_QUEUE` | Optional; default 25 |
| `LITE_MAX_LEADS_PER_IP_HOUR` | Optional; default 5 |

### GitHub Actions repository secrets

| Name | Requirement |
|---|---|
| `LITE_DATABASE_URL` | Required; same Neon pooled URL |
| `LITE_RESEND_API_KEY` | Optional; maps to worker `RESEND_API_KEY` |
| `LITE_OWNER_EMAIL` | Optional; maps to worker `OWNER_EMAIL` |

## Preserved security and operational decisions

- Audit targets are limited to HTTP(S) public addresses and revalidated in the worker.
- Private, reserved, zero-range and IPv4-embedded IPv6 targets are blocked.
- Report links use high-entropy capability tokens; raw tokens are not stored.
- Report pages are no-store, noindex and no-referrer.
- Queue claims use PostgreSQL row locking and retry ceilings.
- Implementation requests are stored before optional email notification.
- Actions logs do not contain lead email, name or message.
- Vercel never runs Chromium; GitHub Actions owns browser execution.
- The four constitutional documents are reference specifications only.

## Launch state

**Ready for owner deployment, not deployed.** The package contains the full application and a tested code path, but no hosted provider action was performed from this environment.

## Single next owner action

Follow `START_HERE_ZERO_CASH_IPAD.md` from Step 1 through Step 14 and record the first successful hosted audit/report/implementation-request result.
