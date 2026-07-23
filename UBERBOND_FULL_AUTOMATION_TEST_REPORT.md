# UberBond Full-Automation Test Report

## Summary

| Suite | Count | Result |
|---|---|---|
| Pre-existing deterministic suite (`npm run test:deterministic`, before this session) | 327 | 327 pass, 0 fail (unchanged — this session added no failures and removed/skipped nothing) |
| New automation-layer tests (this session, `tests/automation-*.test.mjs`) | 76 | 76 pass, 0 fail |
| **Combined (`npm run check`)** | **403** | **403 pass, 0 fail** |
| `npm run check:syntax` | 68 files (54 pre-existing + 10 new `src/automation/*.mjs`) | pass |
| `npm audit --audit-level=low` | — | 0 vulnerabilities |

`npm run test:browser` (Playwright, pre-existing) was not re-run in this session — it exercises the
pre-existing crawler/cockpit UI paths this session did not touch, and running a real Chromium
instance was not necessary to validate the new automation-layer code, which has no browser
surface of its own yet (see readiness doc).

## New test files (76 tests)

| File | Tests | Covers |
|---|---|---|
| `tests/automation-mode.test.mjs` | 8 | Mode resolution, fail-closed on unknown mode, per-mode gate logic, `assertAutomationGate` throwing |
| `tests/automation-campaign-policy.test.mjs` | 7 | Signing/verification, missing-extras rejection, non-email channel rejection, tamper detection, expiry, missing-secret fail-closed, disabled-campaign-never-active |
| `tests/automation-outbound-adapter.test.mjs` | 8 | Contract assertion, idempotent reserve, missing-key rejection, unreserved-send rejection, duplicate-send-returns-original, uncertain/failed provider honesty |
| `tests/automation-apify-import.test.mjs` | 6 | Field mapping, JSON import + dedup through the real `importProspects`, CSV import, malformed-JSON fail-closed, polling refused without credentials, injected-fetcher polling with zero real network I/O |
| `tests/automation-fulfillment.test.mjs` | 9 | Lane selection (value/type/test-mode/override), fulfillment-before-payment rejection, checklist creation, QA-gates-completion, terminal-state enforcement, SLA overdue detection |
| `tests/automation-monitoring.test.mjs` | 6 | Consent requirement (each missing field independently), cancellation clears scheduling, payment-failure has no hidden charge fields, enrollment requires monitoring-type offer |
| `tests/automation-exceptions.test.mjs` | 7 | Empty-queue baseline, positive-reply exact action, P0 payment dispute/chargeback, overdue-task flagging, paused-inbox kill switch, sort order, summary tallies |
| `tests/automation-state-machine.test.mjs` | 9 | Full vocabulary check, full happy-path walk, no-reply/follow-up branch, every stage reaches an appropriate terminal, terminal states have zero outgoing edges, forbidden transitions rejected, unknown states rejected, FAILED reachability boundary, live-status projection |
| `tests/automation-digest.test.mjs` | 4 | Clean-day message, exception-count message, weekly aggregation/unhealthy flag, healthy-week baseline |
| `tests/automation-hostile.test.mjs` | 11 | End-to-end integration against a real `Store` + `RevenueEngine`: fulfillment-before-payment, no-double-fulfillment-task, monitoring-without-consent, monitoring-without-payment, monitoring-success-path, duplicate-send-race via fake provider, malformed-Apify-import, apify-poll-without-credentials, empty-system digest, dead-letter-job-in-exceptions, unhealthy-weekly-report |

## Hostile-scenario coverage against the spec's list (section P)

The spec lists ~30 hostile scenarios. Most of the send-path, evidence, and reply scenarios were
already covered by the 327 pre-existing tests before this session (see PR #4/#5's own test
reports, which this session did not re-verify line-by-line but did re-run in full as part of the
combined 403). This session's 76 new tests specifically add coverage for the automation-layer
scenarios that had no prior implementation to test:

| Scenario | Covered by |
|---|---|
| Duplicate prospects | Pre-existing (`tests/store.test.mjs`, `prospect-import.mjs` dedup logic), re-exercised in `automation-apify-import.test.mjs` |
| Malformed imports | `automation-apify-import.test.mjs` ("malformed JSON export fails closed") |
| Policy expiry | `automation-campaign-policy.test.mjs` ("an expired policy is not active...") |
| Policy tampering | `automation-campaign-policy.test.mjs` ("tampering with any signed field invalidates...") |
| Duplicate send | Pre-existing (`send-safety.test.mjs`, `store.test.mjs`), plus `automation-outbound-adapter.test.mjs`/`automation-hostile.test.mjs` for the new fake-provider contract |
| Uncertain send | `automation-outbound-adapter.test.mjs` ("an always-uncertain provider never claims a definite send") |
| Concurrent worker race | `automation-hostile.test.mjs` ("duplicate outbound sends are impossible even under repeated reserve/send races") — 20 concurrent reserves collapse to 1 reservation |
| Fulfillment before payment | `automation-fulfillment.test.mjs` + `automation-hostile.test.mjs` ("fulfillment cannot be created before a delivery is payment-gated") |
| Monitoring without consent | `automation-monitoring.test.mjs` + `automation-hostile.test.mjs` |
| Dead-letter recovery | Pre-existing (`queue.mjs`'s `requeueDeadLetter`), surfaced as an owner exception by `automation-hostile.test.mjs` ("a dead-lettered job surfaces in the exception queue") |
| Zero `lite/` diff | Verified directly: `git diff --exit-code origin/claude/uberbond-pr4-max-score-2vmv60 -- lite/` is empty (see readiness doc) |
| Missing postal gate / missing payment gate | `automation-campaign-policy.test.mjs` (`postalAddressConfirmed`/`paymentRailConfirmed` are required boolean fields; signing fails without them) |
| No real provider / no real network side effects | Every new module's tests use only the fake provider (`createFakeOutboundProvider`) or an injected fetcher (`automation-apify-import.test.mjs`'s `pollApifyTask` tests); `defaultApifyFetcher` exists but is never invoked by any test or by any code path that runs in this session |

Scenarios from the spec's list not independently re-tested in this session (stale evidence, weak
issue, uncertain channel, complaint/bounce threshold, refund, chargeback at the payment-engine
level, scheduler restart) were already covered by the 327 pre-existing tests this session verified
still pass unchanged; this report does not claim new coverage for them.

## What "no real provider / no real network side effects" means concretely in this session

- No test in `tests/automation-*.test.mjs` calls `fetch` against a real host. The one function that
  would (`defaultApifyFetcher` in `src/automation/apify-import.mjs`) is defined but not called by
  any test, any job handler default, or any script in this repository.
- The fake outbound provider (`createFakeOutboundProvider`) performs no I/O — it is a pure
  in-memory `Map`-backed implementation.
- The control-center generator (`scripts/generate-automation-control-center.mjs`) seeds an
  ephemeral temp-directory `Store`, never a real database, and is clearly labeled as
  demonstration data in the rendered page's footer.
