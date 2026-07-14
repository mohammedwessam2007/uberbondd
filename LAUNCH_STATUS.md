# UberBond Launch Status

> Assessment date: 2026-07-15  
> Baseline: attached `UberBond LaunchReady.zip` only  
> Status: **CODE READY FOR OWNER DEPLOYMENT — DEPLOYMENT NOT EXECUTED**

## Confirmed application repository

The extracted repository root contains all required application paths:

| Required path | Result |
|---|---|
| `package.json` | Present |
| `server.mjs` | Present |
| `worker.mjs` | Present |
| `src/` | Present |
| `lite/` | Present |
| `migrations/` | Present |
| `.github/workflows/` | Present |

This is the application repository, not the earlier documentation-only workspace.

## Zero-cost Cash Engine Lite path

| Component | Exact deployment role | Verification |
|---|---|---|
| Vercel | Root Directory `lite`; **Other** preset; static `public/`; Node functions in `api/` | `lite/vercel.json`, `lite/package.json`, static assets and four handlers reviewed; configuration assertions pass |
| Neon PostgreSQL | Pooled `DATABASE_URL`; tables `lite_audit_requests`, `lite_reports`, `lite_leads` | Migration and embedded schema are byte-identical; PGlite end-to-end flow passes |
| GitHub Actions | `.github/workflows/lite-audits.yml`; schedule every 30 minutes plus manual trigger | Root install is reproducible; queue claim/retry/report/lead paths pass; workflow not executed against GitHub in this environment |

## Verified launch surfaces

| Surface | Status | Evidence |
|---|---|---|
| Vercel routing and headers | Ready in code | `/r/:token` rewrite, no-store/noindex, no-referrer, CSP, anti-frame and MIME protections tested |
| Lite APIs | Ready in code | Health, request-audit, report and interest handlers syntax-check and have deterministic tests |
| Database migrations | Ready in code | Lite SQL equals embedded schema; production migration tests pass |
| Queue processing | Ready in code | Atomic `SKIP LOCKED` claim, retry ceiling, stale sweep and no-double-claim paths pass |
| GitHub worker | Ready in code | Uses root Playwright crawler and deterministic rules; Chromium install remains in the worker workflow only |
| Secure report tokens | Ready in code | 256-bit URL-safe token generated; only SHA-256 stored; shape, hashing and unknown-token behavior pass |
| URL validation and SSRF | Ready in code | HTTP(S)-only, no credentials, DNS/private checks, zero-address range and IPv4-embedded IPv6 blocking pass |
| Implementation-request storage | Ready in code | `lite_leads` persistence and full request → report → lead flow pass |
| Owner notification | Ready with optional provider | Resend path tested; fallback retains lead in Neon and logs no email, name or message |
| Environment requirements | Documented | Vercel and GitHub variable names and exact iPad setup are in `START_HERE_ZERO_CASH_IPAD.md` |
| Constitutional specifications | Included, not implemented | Four v1 documents are under `docs/constitution/` |

## Confirmed blockers fixed

1. Regenerated the out-of-sync root lockfile that made `npm ci` fail in both GitHub workflows.
2. Added `lite/package-lock.json` for reproducible Vercel function installs.
3. Separated deterministic tests from the Chromium test; CI now installs Chromium once in its own job.
4. Removed a hard-coded `/usr/bin/chromium` assumption from the browser test.
5. Blocked the `0.0.0.0/8` range and IPv4-embedded IPv6 forms in both SSRF guards.
6. Enforced the 8 KiB body limit even when Vercel supplies an already-parsed JSON body.
7. Changed health from a misleading unconditional 200 to a fail-closed database configuration/connectivity check.
8. Removed lead email, name and message from GitHub Actions fallback logs.
9. Added report capability-token cache, indexing, referrer and browser security protections.

## Tests

| Command/check | Result |
|---|---|
| `npm run check` | PASS |
| Syntax checks | PASS |
| Deterministic tests | 71 passed, 0 failed, 0 skipped, 0 todo |
| Deterministic duration | 8,911.265758 ms |
| `npm audit --omit=dev` | PASS — 0 vulnerabilities |
| Root `npm ci` with regenerated lock | PASS — 20 packages installed |
| Lite `npm ci --omit=dev` | PASS — 14 packages installed |

## Environment-blocked validation

- The Chromium-dependent browser test was not run locally because browser binaries were intentionally not installed. It is isolated as `npm run test:browser` and CI installs Playwright Chromium once before running it.
- No Vercel project, deployment URL or Vercel function runtime was available.
- No Neon credentials or live database were available; no real migration was applied to Neon.
- No GitHub repository secrets or hosted Actions run were available.
- No real public audit, secure report, Resend delivery or implementation request was executed across hosted services.
- Therefore deployment and live launch are not claimed.

## Launch readiness

The code baseline is ready for the owner to execute the zero-cash deployment guide. Launch remains **HOLD** until the owner completes one hosted Vercel + Neon + GitHub Actions end-to-end audit and implementation-request verification.

## Single next owner action

Follow `START_HERE_ZERO_CASH_IPAD.md` from Step 1 through Step 14 and record the first successful hosted audit/report/implementation-request result.
