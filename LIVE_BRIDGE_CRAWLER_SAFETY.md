# Live Bridge Patch 2 -- Real Crawler Safety

Documents `revenue-os/src/providers/real-crawler.mjs` and `revenue-os/scripts/crawl.mjs` (commit
15): every safety property, how each is enforced in code (not just described), and the one bug this
patch's own testing found and fixed before it ever shipped.

## Disabled by default, structurally

`createRealCrawlerProvider()` with no arguments produces a provider whose `fetchPage` always throws
`crawler-disabled`. To get a working instance, the caller must pass `enabled: true` **together
with** a non-empty `allowlist` array **and** an `ownerApproval` object containing `approvedBy` and
`approvedAt` -- omitting either throws at construction time (`missing-allowlist` /
`missing-owner-approval`). There is no code path that produces an enabled, unguarded instance.

## Allowlist gates before any network access -- including DNS

`fetchPage` parses the candidate URL with zero network activity (a plain `new URL(...)`, no
resolution) and checks it against the allowlist **before** calling the shared
`../../../src/security.mjs#assertPublicUrl` guard, which is what performs the DNS lookup. A
non-allowlisted host therefore never causes so much as a DNS query.

**This ordering was not correct on the first pass.** During this patch's own ad-hoc verification, an
earlier version checked the allowlist *after* `assertPublicUrl` had already resolved DNS -- which
meant a non-allowlisted hostname still triggered a real DNS lookup before being rejected. That
lookup actually happened once, against a syntactically-real but non-target domain, during this
patch's own interactive testing in this session. It touched no site content (DNS resolution only,
no HTTP request), but it was still a real network transaction this session's standing rule ("real
crawling only ever touches a local controlled test server") requires never happening. Caught
immediately via the very next test run, fixed by moving the allowlist check before
`assertPublicUrl`, and reverified with a dedicated test
(`tests/revenue-os/real-crawler.test.mjs`: "a URL not on the allowlist is rejected before any
network access, even for an otherwise-valid host"). Disclosed here rather than omitted, per this
session's standing practice of naming bugs found during its own work rather than hiding them.

## Scheme, private-network, and SSRF protection

Reused unmodified from `../../../src/security.mjs`: `assertPublicUrl` (rejects any scheme other
than `http:`/`https:`, rejects embedded credentials, rejects `localhost`/`.local`, rejects
literal-IP private/reserved ranges) and `isPrivateIp` (the CIDR-range check, including IPv4-mapped
and unique-local IPv6 forms). No SSRF logic is reimplemented here. Verified in tests: a private IP
is blocked even when the literal address is itself present in the allowlist -- the allowlist can
say "you may request this identifier," never "bypass the safety guard."

## DNS-rebinding protection

DNS is resolved exactly once per fetch (after the allowlist and `assertPublicUrl` checks pass). The
resolved address is then pinned for the rest of that fetch two ways:

1. **The real navigation**: Chromium is launched with
   `--host-resolver-rules=MAP <host> <pinned-ip>`, so nothing that happens inside that browser
   instance's single navigation can be redirected to a different address by an answer that changes
   between the check and the fetch. A fresh Chromium process is launched per fetch specifically so
   this per-host pin never leaks across requests to different hosts.
2. **The robots.txt fetch**: done over a raw Node `http`/`https` request connected directly to the
   pinned IP, with the real hostname sent as the `Host` header and as the TLS `servername` (so
   certificate hostname verification is still checked against the real name, not bypassed).

## robots.txt: fetched and enforced, not just described

`isPathAllowedByRobots` implements the standard longest-matching-rule algorithm (`Disallow`/`Allow`,
`*` and named user-agent groups, narrower rules override broader ones). Fetched before every
navigation, fail-closed: a 404 means unrestricted (the standard convention), anything else
unreachable or erroring blocks the fetch (`blocked-by-robots-txt` / `robots-txt-unreachable`) rather
than assuming permission.

## Structurally GET/navigation-only

The only Playwright call this module ever makes against a `page` object is `page.goto(url)`. There
is no code path anywhere in this file that calls `page.fill`, `page.click`, `page.type`, or anything
credential- or form-shaped. No vulnerability-scanning or load-testing behavior exists either -- each
fetch is exactly one navigation to exactly the one URL the caller passed in.

## Bounded concurrency, rate limits, and evidence limitations

- A counting semaphore (`maxConcurrency`, default 2) bounds simultaneous in-flight fetches.
- A per-host last-request timestamp map (`perHostRateLimitMs`, default 2000ms) enforces a minimum
  gap between requests to the same host. Verified in tests with a real measured delay, not just
  code inspection.
- Navigation timeout, response-size cap, and a redirect-count cap (computed independently of
  Chromium's own internal redirect limit, by walking `request.redirectedFrom()` after navigation
  completes) all produce `{ok:false, limitation:{code,message}}` when exceeded.
- Every Playwright/browser error (launch failure, navigation error, anything) is caught and returned
  the same way -- never thrown past `fetchPage`, never silently turned into a fabricated "passed"
  result.

## Chromium binary discovery without `playwright install`

This environment's system prompt forbids running `playwright install`. `resolveChromiumExecutable`
tries the plain `<PLAYWRIGHT_BROWSERS_PATH>/chromium` path this environment happens to symlink
directly to the real binary, and falls back to globbing `chromium-<revision>/chrome-linux/chrome`
under the same directory so a different pre-installed revision number in another environment
wouldn't silently break it.

## Replay adapter

`generateReplayAdapter()` converts whatever real pages were actually captured into the exact
scripted-page shape `providers/crawler.mjs#createReplayCrawlerProvider` already consumes, so a real
capture batch can be reviewed or regression-tested later with zero further network access.

## CLI and signed evidence packs

`revenue-os/scripts/crawl.mjs` takes a project file naming up to 3 owner-approved sites (matching
`SERVICE_CATALOG.FOUNDING_AGENCY_REVENUE_LEAK_DIAGNOSTIC`'s `siteCount: 3`), each with an explicit
`allowlist` and `ownerApproval` object required in the file itself -- the CLI does not add its own
bypass. For each site it calls the real crawler, runs the existing 18-check engine
(`checks.mjs#runChecksForPage`) and defect-card builder (`defects.mjs#buildDefectCards`) against
what was captured, and writes a JSON evidence pack signed with HMAC-SHA256 via `report.mjs`'s
existing `signReportManifest` (reused, not reimplemented). The signing secret must come from an
environment variable named on the command line (`--secret-env`, default
`REVENUE_OS_EVIDENCE_SIGNING_SECRET`) -- the CLI refuses to run if that variable is unset, and never
accepts a secret as a literal command-line argument.

The signed pack stores hashes of captured HTML/screenshots, not the full HTML body, keeping the
signed artifact compact; per-site `checkResults` and `defectCards` are included in full since those
are the diagnostic factory's actual required input.

## Test coverage

`revenue-os/fixtures/local-test-server.mjs` is a loopback-only (127.0.0.1) HTTP server -- the "local
controlled test server" this patch's tests use instead of the real internet; no test file in this
patch references a real external hostname (verified by a repo-wide grep as part of this patch's own
clean-room check, see `LIVE_BRIDGE_TEST_EVIDENCE.md`).
`tests/revenue-os/real-crawler.test.mjs` (19 tests) covers disabled-by-default, the construction
guards, the robots.txt parser and its enforcement, the allowlist-before-DNS ordering, SSRF blocking
even against an allowlisted private IP, non-HTTP(S) scheme blocking, excessive-redirect/timeout/
oversized-response limitation handling, per-host rate limiting, and the replay-adapter round trip.
`tests/revenue-os/crawl-cli.test.mjs` (4 tests) covers the CLI end to end, including manifest
signature verification and tamper detection.

## What this patch does not claim

No real external site was ever fetched by this crawler in this session -- every real-navigation test
and every demonstration in this patch's own verification used the local controlled test server only.
Enabling this provider against a real website requires the owner to supply a real allowlist and a
real approval record; nothing in this patch does that on its own, and nothing in this patch claims a
real capture batch, a real defect finding, or a real diagnostic delivery ever happened.
