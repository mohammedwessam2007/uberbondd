# UberBond Full-Automation Readiness

## Verdict: **NOT READY**

Not because the automation logic is incomplete — every lettered stage (A–N) has a real,
tested implementation, either pre-existing or added this session, and the combined 403-test suite
passes with zero failures, zero `npm audit` findings, and a verified-empty `lite/` diff. It is
"NOT READY" rather than "AUTOMATION CORE COMPLETE" for two specific, locally-solvable, deliberately
deferred reasons — not blocked by any external dependency:

1. **The new job handlers are not yet registered into the scheduler.**
   `src/automation/job-handlers.mjs` implements `fulfillment.process`, `monitoring.enroll`,
   `apify.import`, `apify.poll`, `digest.daily`, and `digest.weekly`, and all six are exercised
   directly by `tests/automation-hostile.test.mjs` against the real job-harness-compatible
   contract. They are **not** added to `src/scheduled-workers.mjs`'s `MODE_DEFINITIONS` registry
   or to the GitHub Actions scheduled-workflow cron list that the pre-existing job types
   (`research.batch`, `drafts.process`, `replies.poll`, etc.) use. This was a deliberate choice,
   not an oversight: the task's non-negotiables ask for caution around anything adjacent to real
   scheduled execution, and editing a CI/CD cron workflow is exactly the kind of "modifying
   CI/CD pipelines" action this session's operating instructions call out as needing explicit
   sign-off rather than being done silently. Wiring these in is a same-session-sized, no-external-
   dependency task.
2. **No HTTP/admin-UI routes exist yet for the owner-facing actions this layer adds** — signing a
   campaign policy, confirming monitoring consent, or advancing a fulfillment checklist, all
   currently only callable as functions (which is what every test does). `server.mjs`'s existing
   admin routes and `public/admin.js` were not touched. This is real, additional, locally-solvable
   work, not a stub disguised as done.

Both gaps are explicitly listed rather than glossed over because the task asked for an honest
verdict, and "AUTOMATION CORE COMPLETE" would overstate what exists. Everything else the spec asks
for — the eighteen lettered stages' actual logic, the state machine, the exception queue, the
control center, the configuration surface, and the test suite proving the loop with fake providers
— is real and passes.

## What would flip this to AUTOMATION CORE COMPLETE

- [ ] Add `fulfillment.process`, `monitoring.enroll`, `digest.daily`, `digest.weekly` (and
      optionally `apify.import`/`apify.poll`) to `src/scheduled-workers.mjs`'s `MODE_DEFINITIONS`,
      following the exact pattern already used by the seven existing modes in that file.
- [ ] Add admin routes (`server.mjs`) + minimal UI (`public/admin.js` or a new page) for: sign a
      campaign policy, record monitoring consent, patch a fulfillment task's checklist.
- [ ] Re-run the full suite (`npm run check:full`) after both, plus a fresh `git diff --exit-code
      <base> -- lite/` to reconfirm zero drift.

Neither item requires a credential, a provider account, or any change to `lite/`.

## Remaining genuine external integrations (verdict: would be BLOCKED, not NOT READY, if attempted)

These require something this session cannot obtain or should not obtain per the task's explicit
non-negotiables (no real credentials, no deployment, no Vercel connection, no real email):

1. **A real Apify account, token, and actor task.** `defaultApifyFetcher` in
   `src/automation/apify-import.mjs` is implemented against Apify's documented REST shape but has
   never been run against Apify's real API — there is no way to verify it against the real service
   without a real `APIFY_TOKEN`/`APIFY_TASK_ID`, which this session does not have and was told not
   to fabricate or acquire.
2. **Real Gmail OAuth credentials for a live send.** Already true before this session (see PR #4/#5)
   and unchanged: `src/gmail.mjs`'s real provider path is complete and tested against the fake
   provider, but a real send has never happened and requires real `GOOGLE_CLIENT_ID`/
   `GOOGLE_CLIENT_SECRET` plus an owner-connected inbox.
3. **A real payment provider account** (Lemon Squeezy or equivalent) for anything beyond
   `provider=test`/`provider=manual`. The webhook verification path (`src/payments.mjs`) is
   implemented and tested against synthetic signed payloads; it has never received a real webhook.
4. **Deployment infrastructure** (Vercel/Railway/Render — configs for several already exist in the
   repo root from earlier sessions) to actually run the scheduler continuously. This session did
   not deploy anything, per the task's explicit instruction.
5. **A signed owner policy for autonomous mode**, in the human-process sense: `AUTOMATION_MODE=
   autonomous` requires `AUTOMATION_AUTONOMOUS_CONFIRMED=true`, which is a config flag, but the
   task's spec also describes autonomous mode as requiring "signed owner policy" as a governance
   artifact outside the codebase — that is an organizational decision, not something this session
   can or should manufacture.

None of these five is what makes the verdict "NOT READY" above — all five are pre-existing,
already-known-and-documented external dependencies (most already called out in PR #4/#5's own
"Unresolved / known risks" sections), not new gaps this session introduced or discovered.

## Deployment prerequisites (once BLOCKED items above are resolved)

1. Set `STORE_BACKEND=postgres` and a real `DATABASE_URL` (production requires this — see
   `validateStartupConfig`).
2. Set a strong `ADMIN_TOKEN` (≥32 chars), an HTTPS `APP_BASE_URL`, and a 64-hex-char
   `TOKEN_ENCRYPTION_KEY` (also used as `CAMPAIGN_POLICY_SECRET` unless overridden).
3. Decide and set `AUTOMATION_MODE` explicitly (never leave it to default in production if
   `approval`/`autonomous` behavior is intended — the default is `shadow`, which performs no
   external writes regardless of any other flag).
4. Only after the above: configure real Gmail OAuth, a real payment provider, and (optionally)
   Apify credentials, one at a time, verifying each against this session's fake-provider test
   coverage as a behavioral baseline before flipping the corresponding `*_ENABLED` flag.
5. Wire the two scheduler/UI gaps above before relying on any of this running unattended.

## Zero-`lite/` proof

```
$ git diff --exit-code origin/claude/uberbond-pr4-max-score-2vmv60 -- lite/
$ echo $?
0
```

Empty diff, exit code 0: `lite/` is byte-identical to the branch base across this entire session.

## PR #5 status

Unchanged. This session did not touch, comment on, approve, or merge PR #5, and did not push to
`claude/uberbond-pr4-max-score-2vmv60`. All of this session's commits are on the new
`automation/full-commercial-loop` branch only.
