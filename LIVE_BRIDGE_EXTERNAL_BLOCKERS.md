# Live Bridge Patch -- External Blockers (update)

Supersedes items 1 and 4 of `UBERBOND_FIRST_PAYMENT_REVENUE_OS_EXTERNAL_BLOCKERS.md`, which this
patch closes. All other items from that file are unchanged and still apply -- not repeated in full
here, only cross-referenced.

## Closed by this patch

| # | Blocker | Resolution |
|---|---|---|
| 1 | XLSX pack import | **Closed, commit 14.** `exceljs@4.4.0` added as a pinned dependency; `revenue-os/src/xlsx-import.mjs` implements full secure ingestion. See `LIVE_BRIDGE_XLSX_SCHEMA_MAP.md`. |
| 4 | Real website crawling/browser automation | **Closed for the manually-controlled, owner-approved case, commit 15.** `revenue-os/src/providers/real-crawler.mjs` implements a real, safety-gated Playwright crawler, disabled by default, requiring an explicit allowlist and owner approval. See `LIVE_BRIDGE_CRAWLER_SAFETY.md`. This closes the blocker's "no headless-browser dependency wired for real use" gap; it does not change the mission's standing "never crawl a real site without genuine, specific owner instruction" boundary -- this session itself never enabled the real crawler against any real external target, only against a local controlled test server (see `LIVE_BRIDGE_TEST_EVIDENCE.md`).

Blocker 8 (`tests/browser.test.mjs`'s pre-existing Chromium-path mismatch) is **not** closed by this
patch, but this patch's own work independently confirms the underlying cause and a working fix
shape: `real-crawler.mjs#resolveChromiumExecutable` locates this environment's pre-installed
Chromium and launches it successfully (proven in `real-crawler.test.mjs`). The pre-existing
`tests/browser.test.mjs` failure lives in root `src/browser-crawler.mjs`, outside `revenue-os/` --
fixing it would mean modifying a root-level file this patch's own scope (a narrow patch on top of
the existing revenue-os worktree) does not include. Left as-is, still disclosed, exact same
reasoning as the original blocker entry.

## Still open (unchanged from the original list)

- #2 Live PostgresStore
- #3 Real payment-provider verification (Stripe/PayPal/Payoneer live API)
- #5 Real outbound email sending
- #6 Real statistical significance testing for experiments
- #7 Live web server / CSRF protection
- #8 `tests/browser.test.mjs` pre-existing environmental failure (see note above)

## New disclosure from this patch's own work

- **Real-crawler DNS-rebinding pinning is per-fetch, not persistent.** Each `fetchPage` call
  launches a fresh Chromium process with a `--host-resolver-rules` pin scoped to that one fetch.
  This is deliberate (avoids a pin for host A leaking into a later fetch of host B on a shared
  browser instance) but means there is a real DNS lookup, and a real fresh browser launch, on every
  single fetch -- there is no persistent-browser-instance performance path in this module. For a
  manually-controlled, owner-approved, low-volume three-site-at-a-time pilot use case (the only use
  case this patch targets), this is an acceptable, disclosed tradeoff of safety over throughput, not
  an oversight.
- **robots.txt fetch has its own small, separate timeout** (`robotsTimeoutMs`, default 5000ms),
  independent of the main navigation timeout. A robots.txt fetch that fails or times out blocks the
  page fetch entirely (fail-closed) -- this is a deliberate safety choice, not a bug, but it does
  mean a slow-but-otherwise-fine target site's robots.txt endpoint being briefly unreachable will
  produce a `robots-txt-unreachable` limitation rather than a captured page, on that one attempt.
- **No persistent cross-run rate-limit state.** `perHostRateLimitMs` is tracked in memory for the
  lifetime of one `createRealCrawlerProvider()` instance (e.g., one CLI invocation). Two separate
  CLI invocations against the same host in quick succession are not rate-limited against each
  other. Acceptable for the CLI's own three-site-at-a-time, owner-approved, manually-invoked usage
  pattern; would need addressing before any higher-volume or automated use.
