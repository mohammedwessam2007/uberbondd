# Test Evidence

Exact commands run in this worktree (`/home/user/uberbondd-revenue-os`, branch
`overnight/first-payment-revenue-os`) and their results, captured immediately before packaging.

## New suite (this mission's own tests)

Command:
```
npm run check:revenue-os
```
(runs `check:revenue-os:syntax` -- `node --check` against all 39 new source/script/fixture files
-- then `test:revenue-os`, 14 test files)

Result:
```
1..182
# tests 182
# suites 0
# pass 182
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 20061.136604
```

182/182 passing, 0 failures, 0 skipped.

Test files (14): `store.test.mjs`, `migrations-and-model.test.mjs`, `importer.test.mjs`,
`scoring.test.mjs`, `approval-and-outbound.test.mjs`, `reply.test.mjs`, `proposal.test.mjs`,
`payments.test.mjs`, `diagnostic-and-report.test.mjs`, `implementation-and-monitoring.test.mjs`,
`scheduler-and-ai.test.mjs`, `funnel-and-owner-ui.test.mjs`, `hostile-and-security.test.mjs`,
`fixtures-and-demo.test.mjs`.

## Existing repository suite (root + `lite/`)

Command:
```
npm run check
```
(runs `check:syntax` -- `node --check` against every pre-existing root/`lite/` source file -- then
`test:deterministic`, the repository's own 11 pre-existing test files)

Result:
```
1..92
# tests 92
# suites 0
# pass 92
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 25728.117276
```

92/92 passing, 0 failures, 0 skipped -- confirms this mission's changes did not regress any
pre-existing test, and `lite/` itself is untouched (see the zero-lite proof).

## Browser suite (pre-existing, environmental)

Command:
```
npm run test:browser
```

Result: 1 test, 1 failure -- `crawlSiteBrowser` fails because this container's Playwright
installation does not have a matching Chromium binary at the path `src/browser-crawler.mjs`
expects. **This is confirmed pre-existing and unrelated to this mission**: the same command run
against `main` (before any `revenue-os/` changes) fails identically with the same
`browserType.launch` error. `revenue-os/` never imports or touches `src/browser-crawler.mjs`.
Not fixed here, since it is outside this mission's scope and pre-dates it -- see
`UBERBOND_FIRST_PAYMENT_REVENUE_OS_EXTERNAL_BLOCKERS.md`, item 8.

## Migration apply-order proof

Part of `migrations-and-model.test.mjs`: all 6 SQL migration files (`001_core.sql` through
`006_ops.sql`) applied in order against a real Postgres-compatible engine (`@electric-sql/pglite`),
producing 27 `ros_`-prefixed tables, with the `ros_payments.status` CHECK constraint independently
verified to enforce the mission's exact 13-state vocabulary (an out-of-vocabulary insert is
rejected).

## Concurrency / race / restart proof

- **Payment race** (`payments.test.mjs`): two payments presenting byte-identical evidence via
  `Promise.all` -- exactly one ends up `VERIFIED`, the other `BLOCKED`; the store never contains
  two `VERIFIED` payments against the same evidence.
- **Scheduler concurrency** (`scheduler-and-ai.test.mjs`): two racing firings of the same
  scheduled mode/runKey via `Promise.all` produce exactly one persisted job row.
- **Restart recovery** (`store.test.mjs`, `scheduler-and-ai.test.mjs`): a job forced into a
  stale-leased `active` state (simulating a worker that died mid-run) is recovered via
  `store.recoverStaleJobs` and completes on a fresh claim.
- **Idempotent export** (exercised in `scripts/generate-demo.mjs`'s own run and covered by the
  export module's design -- fixed entry mtimes, no export-time randomness): re-running the
  delivery-zip export against identical inputs produces a byte-identical archive.

## Zero-lite proof

Command:
```
git diff --exit-code main -- lite/
```
Result: exit code 0, empty output -- confirmed at the end of every one of the 12 commits on this
branch, and reconfirmed here as the final step before packaging. Also enforced by a standing test
(`hostile-and-security.test.mjs`) so a future change to this package cannot silently regress it.
See `UBERBOND_FIRST_PAYMENT_REVENUE_OS_ZERO_LITE_PROOF.md` for the full transcript.

## End-to-end demonstration

Command:
```
node revenue-os/scripts/generate-demo.mjs
```
Ran to completion with no errors, producing `revenue-os/demo-output/` (sample report in
HTML/Markdown/JSON with a signed manifest, sample proposal, sample onboarding, sample QA result,
sample implementation-offer record, sample monitoring-offer record, an idempotent delivery ZIP, and
a rendered owner dashboard). Console output (abridged):

```
imported 2, quarantined 3
top opportunity: riverside-agency.invalid, recommended offer: FOUNDING_AGENCY_REVENUE_LEAK_DIAGNOSTIC
approval decided: approved
send handoff: fake-sent
follow-up stop after reply: true (reply-received)
proposal total: $250.00
mismatched payment result: MISMATCH
verified payment result: VERIFIED
project reached: CHECKS_RUNNING
defects found: 7
QA passed: true
delivery gate blocked: false
delivery zip sha256: 2a49cbb7626280f37c9499d911db9c6959a7048b73d1b62e324a4e8898cb3fc1
implementation gate blocked: false, status: authorized
monitoring active: true

final project status: MONITORING_OFFERED
```

Every step in the mission's own end-to-end acceptance-checklist is represented in this single run:
import+validate+quarantine, dedupe+rank, approval packet+explicit approval, send-handoff export,
reply import+follow-up stop, proposal+payment request, reject-mismatched-then-accept-verified
payment, three-site diagnostic, grounded report, QA pass, delivery-ZIP export,
implementation+monitoring offers, and (via the owner dashboard render, not shown in this console
excerpt) the scoreboard/next-3-actions home screen.
