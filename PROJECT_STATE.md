# UberBond Project State

> Snapshot date: 2026-07-15  
> Sole baseline: attached `UberBond_LaunchReady_Updated.zip`  
> Scope: Cash Engine Lite P0 launch quality only  
> External deployment state: not attempted

## Canonical local architecture

```text
Customer browser
  → lite/public landing page
  → POST lite/api/request-audit
  → Neon lite_audit_requests
  → GitHub Actions lite-audits workflow
  → lite/worker/run-audits.mjs
  → src/browser-crawler.mjs
  → src/audit-rules.mjs
  → lite/lib/report.mjs evidence validation and ranking
  → Neon lite_reports
  → capability-token report API and report viewer
  → POST lite/api/interest
  → Neon lite_leads
  → optional owner notification or safe stored fallback
```

Vercel must use Root Directory `lite`. The browser worker must run from the complete repository root because it imports shared code from `src/`.

## Current P0 behavior

### Submission and report access

- Website input remains HTTP(S)-only and passes syntax, credential, DNS, private/reserved address, zero-range, and IPv4-embedded IPv6 checks.
- The browser generates a 256-bit report capability token when Web Crypto is available; the API supplies the same-strength fallback.
- Safe browser retries reuse the token, so the same submission does not enqueue duplicate work.
- PostgreSQL stores only the token's SHA-256 hash.

### Truthful processing

The request row persists one of these real stages:

```text
waiting_for_audit_worker
loading_website
testing_desktop_experience
testing_mobile_experience
checking_links_and_conversion_paths
generating_findings
preparing_report
completed
failed_after_retries
```

The private page polls the API and narrates only the stored stage. It displays no percentages or simulated progress and does not expose `last_error`.

### Findings and evidence

- SEO: title, meta description, H1 structure, and explicit noindex.
- Performance: conservative laboratory `domContentLoadedEventEnd` observation only when at least 3,000 ms.
- Trust: HTTP remaining after navigation and absence of a discoverable contact path.
- Mobile: overflow, clearly small controls, and a desktop-visible primary action absent from the initial mobile viewport.
- Every stored finding must pass typed evidence validation.
- Evidence URLs must be public HTTP(S), credential-free, and not literal private/reserved destinations.
- Internal paths, stack detail, provider detail, private addresses, and secret-like values are suppressed.
- Customer content is rendered with `textContent`; raw HTML is not injected.

### Prioritization

- Up to three high-confidence priorities are selected deterministically.
- Ranking uses business impact, confidence, reach, and estimated effort.
- Findings sharing one problem family are consolidated rather than padded.
- Quick Wins use only existing evidence and require high confidence, meaningful impact/reach, and low estimated effort.

### Implementation requests

`lite_leads` now records:

- associated audit request;
- selected issue code;
- service interest;
- optional customer name and note;
- `new` status;
- `private_report` source page;
- requester hash and timestamp;
- owner-notification state;
- a server-derived dedupe key.

The database insert occurs before notification. Exact repeated requests return a stored confirmation without another row or another immediate notification. Notification exceptions and unconfigured email both return a successful stored-request result.

### Screenshot lifecycle

The Lite worker captures desktop and mobile screenshots into a temporary runner directory for crawl-time analysis. `buildReport` removes screenshot references, the worker deletes the directory in `finally`, and no persistent screenshot is promised. Persistent screenshot storage is deferred rather than misrepresented.

## Changed files relative to the attached baseline

### Runtime and data model

- `src/browser-crawler.mjs`
- `src/audit-rules.mjs`
- `lite/lib/db.mjs`
- `lite/lib/report.mjs`
- `lite/lib/schema.mjs`
- `lite/migrations/lite_001.sql`
- `lite/api/request-audit.mjs`
- `lite/api/report.mjs`
- `lite/api/interest.mjs`
- `lite/worker/run-audits.mjs`

### Customer-facing Lite surface

- `lite/public/index.html`
- `lite/public/site.js`
- `lite/public/report.html`
- `lite/public/report.js`
- `lite/public/styles.css`

### Tests and commands

- `package.json`
- `tests/browser.test.mjs`
- `tests/lite.test.mjs`
- `tests/lite-p0.test.mjs` — new

### Required documentation

- `START_HERE_ZERO_CASH_IPAD.md`
- `LAUNCH_STATUS.md`
- `PROJECT_STATE.md`
- `P0_IMPLEMENTATION_REPORT.md` — new

No constitutional specification, full-engine product module, workflow, root lockfile, Lite lockfile, payment behavior, subscription behavior, or external integration configuration was changed.

## Exact test state

| Command | Result |
|---|---|
| Baseline `npm run test:deterministic` | 71 passed, 0 failed; 9,957.520921 ms |
| Final `npm ci --cache /tmp/uberbond-p0-npm-cache` | PASS; 20 packages installed |
| Final `npm run check` | PASS; syntax checks plus 84 passed, 0 failed; 9,352.805108 ms |
| `npm audit --cache /tmp/uberbond-p0-npm-cache` | PASS; 0 vulnerabilities |
| `cd lite && npm ci --omit=dev --cache /tmp/uberbond-p0-lite-npm-cache` | PASS; 14 packages installed |
| `node --check tests/browser.test.mjs` | PASS; browser test source is syntactically valid |
| `npm run test:browser` | Not run; Chromium executable not installed |

The initial plain `npm ci` attempt failed only because `/root/.npm` was unavailable in the container. Repeating with a writable cache succeeded; this is recorded as an environment constraint, not a repository failure.

## Deployment prerequisites

### Vercel

- Root Directory: `lite`
- Framework preset: **Other**
- Output directory: `public`
- Required environment: `DATABASE_URL`, `LITE_HASH_SALT`
- Optional notification environment: `OWNER_EMAIL`, `RESEND_API_KEY`, `LITE_EMAIL_FROM`

### Neon

- Pooled PostgreSQL URL
- Full `lite/migrations/lite_001.sql` applied
- Tables: `lite_audit_requests`, `lite_reports`, `lite_leads`

### GitHub Actions

- Required secret: `LITE_DATABASE_URL`
- Optional secrets: `LITE_RESEND_API_KEY`, `LITE_OWNER_EMAIL`
- Workflow: `.github/workflows/lite-audits.yml`

## Environment-blocked validations

- Chromium/browser regression suite
- hosted Vercel build and functions
- live Neon migration/connectivity
- hosted GitHub Actions execution
- real public target audit
- real Resend delivery
- first hosted implementation-request storage

## Launch state

**Locally ready for owner deployment validation; not deployed.** The external launch gate remains one successful authorized hosted loop.

## Single next owner action

Execute `START_HERE_ZERO_CASH_IPAD.md` Steps 1–14 and record the first successful hosted loop.
