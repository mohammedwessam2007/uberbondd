# Claude Independent Review — Mission 1 (v1.1 Discovery)

Reviewed as an independent senior engineer per CLAUDE_REVIEW_MISSION_1.md.
Scope: inspect, verify the 10 claims, patch only confirmed defects. No redesign.

## Verdict: PASS WITH FIXES

## Confirmed defects patched

| # | Defect | Severity | File(s) |
|---|--------|----------|---------|
| D1 | `package-lock.json` pinned every tarball to a private build-sandbox registry (`packages.applied-caas-gateway1.internal…`). `npm ci` — which the shipped Dockerfile runs — failed with 403 anywhere outside that sandbox, making the ZIP undeployable as-is. | Deploy-blocking | package-lock.json (regenerated against registry.npmjs.org, playwright pinned 1.61.1 to match the Docker base image) |
| D2 | Website gate leak: OSM tags like `website=ftp://files.example` (→ `https://ftp//files.example`, domain `ftp`) and `website=intranet` (single-label hostname) passed the "public website required" gate and entered the prospect queue. | Data-integrity | src/discovery.mjs (`normalizeWebsite`: reject non-http(s) schemes; require dotted hostname) |
| D3 | Daily cap bypass under concurrency: two overlapping live runs (double-tap on iPad, or manual run colliding with the scheduled run) each read the day's imported count before either wrote, importing 2× the cap (probe: 6 imported with cap 3). | Cap-integrity | server.mjs (module-level in-flight lock; second concurrent run is refused with a clear message — also prevents duplicate simultaneous Overpass queries) |
| D4 | Non-numeric `limit` (e.g. `"abc"`) propagated NaN through cap math and produced the false error "Daily discovery import cap reached" on a fresh cap. | Misleading error | server.mjs (finite/positive limit parsing with fallback to the configured cap) |

## Verification of the 10 claims (patched build)

1. **Overpass QL injection** — PASS. 13/13 hostile bbox/category payloads rejected before query build; generated query grammar-checked against a strict pattern; rejected API inputs never reach the Overpass endpoint.
2. **Website-required gate** — PASS after D2 fix (regression test added).
3. **Global domain dedup** — PASS. Rediscovery skipped; manual import of `WWW./path/case` variants of a discovered domain skipped; in-run dedup intact.
4. **Dry-run imports nothing** — PASS. Vault untouched; string `"false"` fails safe to preview; dry runs don't consume the cap.
5. **Daily caps** — PASS after D3 fix. Sequential rerun refused; two overlapping live runs import exactly cap (3/3); dry runs still allowed after exhaustion.
6. **Campaign gating** — PASS. Missing/unknown/unapproved campaigns rejected with clear messages; failed attempts logged to the discovery run history.
7. **No silent email enablement** — PASS. Discovered prospects researched under autopilot reach ready/research-complete only; `sent` stays 0 with `autoSend:false` and no connected inbox; no code path mutates `autoSend`.
8. **Attribution retained** — PASS. `source`, `sourceUrl`, `sourceRecordId`, license, OSM id/type and website tag present on records and in JSON export.
9. **Understandable errors** — PASS after D4 fix. Bbox/category/campaign/cap errors are plain English surfaced by the admin panel; discovery endpoints require the admin token.
10. **No regressions** — PASS. 19/19 unit tests, revenue smoke (lead → report → payment unlock → $49 recorded), discovery smoke, visual QA + overflow check all green after patches on a clean `npm ci`.

Full adversarial evidence: `npm run probes` (scripts/review-probes.mjs) — 33/33 passing.

## Not verified live

The review sandbox's egress proxy also blocks `overpass-api.de` (HTTP 403, host not in allowlist). One real request was attempted and refused. **No live Overpass verification is claimed.** First deployment must run a dry-run preview against the public endpoint before any import, exactly as MISSION_1_REPORT.md already instructs.

## Remaining risks (not patched — outside confirmed-defect scope)

- Validation failures return HTTP 500 (message body is clear); 4xx codes would be more correct API hygiene.
- `Store.tx` chains on a shared promise; a failed disk write would reject all subsequent writes until restart. Pre-existing v1.0 infrastructure; superseded by the planned PostgreSQL migration.
- The daily-cap window is UTC-day based (consistent, but not local-midnight).
- Campaign creation via raw API coerces truthy strings (`approved:"false"` → true). The admin UI sends real booleans; pre-existing pattern.
- Overpass fair-use: default 24h interval + serialized runs are polite, but sustained multi-city use should move to a self-hosted Overpass or add jittered backoff on 429/504.
