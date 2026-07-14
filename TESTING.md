# Testing

## Running the suite

```bash
npm test                 # runs node --test tests/*.test.mjs (68 tests)
npm run check            # syntax-checks every source file, then runs the full suite
```

In a sandbox without a Chromium binary, skip the browser download and expect one
environment-only failure (see below):

```bash
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm test
```

## What is covered (68 tests)

| File | Tests | Area |
|---|---|---|
| `core.test.mjs` | 10 | robots parsing, deterministic audit rules, scoring, message copy, crypto round-trip, CSV parsing, **SSRF guard (`assertPublicUrl`) rejection paths** |
| `send-safety.test.mjs` | 9 | send-gate enforcement, country/timezone rules, unsubscribe token signing, bounce/complaint handling, sender-health pauses |
| `postgres-schema.test.mjs` | 7 | migration integrity, unique constraints, `SKIP LOCKED` claim semantics, dead-letter columns (runs against PGlite) |
| `queue.test.mjs` | 6 | durable dedupe/claim/complete, retry→dead-letter, stale-job recovery, pause/resume, singleton jobs, non-retryable errors |
| `discovery.test.mjs` | 6 | bbox validation, category whitelist, Overpass query generation, website gating, result limits |
| `lite.test.mjs` | 12 | Cash Engine Lite: schema/migration sync, tokens, email + SSRF validation, rate-limit branches, report shaping, owner-email no-op/post, all three API handlers with a stubbed DB |
| `lite-flow.test.mjs` | 4 | Lite end-to-end against PGlite: request→claim→report→lead, retry→failure, stale sweep, per-email daily limit |
| `store.test.mjs` | 4 | JSON store idempotency/caps/cadence, transaction rollback, uniqueness |
| `input-config.test.mjs` | 4 | strict boolean parsing, production fail-closed config, live-outbound preconditions |
| `revenue.test.mjs` | 3 | free-snapshot→full-report unlock, checkout link encoding, Lemon Squeezy webhook signature |
| `json-import.test.mjs` | 2 | JSON import validation + idempotent rerun, dry-run no-writes |
| `browser.test.mjs` | 1 | live Playwright crawl of a local fixture site (**needs a Chromium binary**) |

## The one expected failure without a browser

`browser.test.mjs` launches real Chromium against an in-process fixture server.
In any environment where the Playwright browser binary is not installed (e.g. a
network-restricted CI sandbox), it fails with:

```
browserType.launch: Executable doesn't exist at .../chrome-headless-shell
```

This is an **environment limitation, not a code defect**. It passes wherever
Chromium is available. The production Docker image
(`mcr.microsoft.com/playwright:v1.61.1-noble`) ships the matching browser, and the
`playwright` dependency is pinned to exactly `1.61.1` so the library can never
drift ahead of the image's bundled binaries. GitHub Actions installs it via
`npx playwright install --with-deps chromium`.

To run it locally, install the browser once: `npx playwright install chromium`.

## Integration smoke scripts (require a Postgres and/or browser)

These are not part of `npm test`; run them manually against a real environment:

```bash
npm run smoke              # end-to-end public audit → report flow
npm run smoke:postgres     # Postgres store behaviors
npm run smoke:postgres-app # app wired to Postgres
npm run smoke:queue        # durable queue under load
npm run smoke:services     # separate web/worker roles
npm run smoke:outbound     # outbound safety gate
npm run probes             # review probes against a running server
npm run smoke:discovery    # discovery pipeline
npm run visual             # visual QA capture
```

## Test design notes

- Database-touching unit tests use **PGlite** (`@electric-sql/pglite`, a dev
  dependency) to exercise real SQL — including `FOR UPDATE SKIP LOCKED`, `jsonb`,
  and constraint behavior — with no external Postgres. The lite code reads the
  affected-row count under both `rowCount` (node-postgres) and `affectedRows`
  (PGlite) so the same code path is correct in production and tests.
- API handlers are written with injectable dependencies (`createHandler(deps)`),
  so request validation, rate limiting, status codes, and error handling are
  tested without booting an HTTP server.
- The SSRF guard is tested only on branches that reject **before** any DNS lookup,
  so those tests are deterministic offline.

## Adding tests

Drop a `*.test.mjs` file in `tests/`; the `npm test` glob picks it up
automatically. Keep DB-backed tests on PGlite so they run in CI without external
services.
