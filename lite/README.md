# UberBond Cash Engine Lite

A zero-cost, isolated launch variant of the UberBond Revenue Engine. Same audit
brain, no paid infrastructure.

## What it is

- **Public site** (`public/`) — static HTML/CSS/JS. Visitor submits a website + email.
- **API** (`api/`) — Vercel Node serverless functions. Validates input, rate-limits,
  writes to Postgres, serves report status by secure token. No API keys ever touch the browser.
- **Worker** (`worker/run-audits.mjs`) — runs on a GitHub Actions schedule (not Vercel,
  which has no long-running compute on the free tier). Claims queued audits, runs the
  **same** Playwright crawler and deterministic audit rules as the production engine
  (imported directly from `../src/`), stores the report, and prints/emails any pending
  implementation leads.
- **Database** — Neon serverless Postgres (free tier). Own tables (`lite_*`), does not
  touch or migrate the production schema.

## Why a separate worker from the API

Vercel serverless functions are short-lived and unsuitable for a multi-page Playwright
crawl. GitHub Actions gives free scheduled compute instead — the API only ever reads
and writes rows; it never launches a browser.

## Data flow

```
Visitor → POST /api/request-audit → row queued in Postgres → secure /r/<token> link shown immediately
GitHub Actions (every 30 min) → claims queued rows → crawls with Playwright → scores findings → stores report
Visitor's report page polls /api/report?token=... until status = done
Visitor clicks "Request implementation" → POST /api/interest → lead stored → owner emailed (if configured) or logged in the next Actions run
```

## Security

- SSRF-guarded URL validation (blocks localhost, private/reserved IPs, DNS-rebinding to private IPs, non-http(s) schemes, credentials-in-URL).
- Report links are 256-bit random tokens; only their SHA-256 hash is stored, never the raw token.
- Rate limits per IP and per email (env-overridable), plus a global active-queue cap.
- All API responses are `noindex` and `no-store`.
- Crawled page text is rendered via `textContent` only — never `innerHTML`.

## Local development

There is no local dev server for the API (it's Vercel functions) — the test suite
(`../tests/lite*.test.mjs`) exercises every handler and the full request→worker→report
flow against an in-memory Postgres (PGlite), so `npm test` from the repo root is the
fastest feedback loop.

## Deploying

See `/DEPLOY_CASH_ENGINE_LITE_IPAD.md` (beginner, iPad-friendly) and
`/LITE_ENV_CHECKLIST.md` (exact env var table).
