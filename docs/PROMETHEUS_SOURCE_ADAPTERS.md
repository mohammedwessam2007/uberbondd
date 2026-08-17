# Prometheus Source Adapters

## Status: interface designed, implementation deferred

See `docs/PROMETHEUS_ARCHITECTURE.md` for why this wave stopped short of
building adapter code: the pending V9-vs-Guard architecture decision found
by `docs/PROMETHEUS_BRANCH_RECONCILIATION.md` should settle where ingested
signals ultimately get authorized/stored before a second ingestion pipeline
is built alongside it.

## The contract, when built

Every adapter should return one of these states, matching `src/market-
signal.mjs`'s existing `SOURCE_KINDS` and `EVIDENCE_CLASSES` vocabularies
so a real adapter's output normalizes through `normalizeMarketSignal()`
without translation:

```
AVAILABLE | UNCONFIGURED | UNSUPPORTED | POLICY_BLOCKED | RATE_LIMITED | FAILED
```

An adapter's `fetch()` (or equivalent) should never throw for "no
credentials" — it should return `{ status: 'UNCONFIGURED', signals: [] }`.
Only a genuinely unexpected runtime error should throw.

## What's already real and reusable as the first "adapter" in spirit

`src/browser-crawler.mjs` (Playwright-based, no credentials, respects
`robots.txt`, SSRF-guarded via `src/security.mjs#assertPublicUrl`) already
does credential-free public web-page ingestion for the audit product. A
`WEB_PAGE` MarketSignal adapter, when built, should wrap this existing
crawler rather than write a second HTML fetcher — reuse, not duplication.

## Honest per-source status (no source claimed operational)

| Source | Would-be status | Why |
|---|---|---|
| Generic public web page | `AVAILABLE` (via existing crawler) | Already built, credential-free, already in production use for audits. |
| RSS/news | `UNSUPPORTED` | No RSS parsing dependency currently in this repo. |
| GitHub | `UNCONFIGURED` | GitHub MCP access exists in this *session*, but no adapter code exists to call it as a market-signal source. |
| YouTube / X / TikTok / Instagram | `UNCONFIGURED` | No credentials, no adapter code. Per the mission's own kill list (`docs/PROMETHEUS_SCOPED_VERDICT.md`), not stubbed this wave either — see below. |
| App marketplaces / pricing pages / job boards / procurement / changelogs / review sites / ad libraries | `UNSUPPORTED` | No adapter code for any of these. |

## Why even UNCONFIGURED stub files weren't created this wave

A stub file that always returns `UNCONFIGURED` has near-zero engineering
value on its own — it's a constant. The actual value in "build the socket"
is the *shared contract* (the status enum + signal shape above), which
already exists in `src/market-signal.mjs`. Writing 10 near-identical
one-line stub modules to satisfy a file-count target would be exactly the
decorative-file pattern the mission's own required-artifacts section
explicitly warns against ("Do NOT produce 52 decorative files... prefer
code and tests over prose"). The contract is documented here and typed in
`market-signal.mjs`; a real adapter can be added in under an hour once one
is actually needed, following the `WEB_PAGE`-via-`browser-crawler.mjs`
pattern above.
