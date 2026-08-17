# Overnight Handoff — 2026-08-17

## Outcome

**Wave: Wire the Deliverability Guard into the real pipeline.** `Pipeline.maybeSend` —
confirmed as the single choke point every cold-outreach send path funnels through
(`processProspect`, `processOutboundQueue`, `processFollowups` all call it, and
`gmail.mjs`'s `sendEmail` is only ever invoked from inside it) — now calls
`evaluateDeliverabilityGuard()` twice: once as an **admission gate** before any
reservation is attempted, and once as a **final recheck** immediately before the
provider boundary, right after the reservation transitions to `dispatching`. Every
decision, at both checkpoints, is persisted as a receipt via the repository's
existing canonical audit writer (`store.log()` → `auditLog`) — no second receipt
system, no new table.

A second send path was found and deliberately left out of scope:
`RevenueEngine.sendReportEmail` (`src/revenue.mjs`) delivers a transactional
"your report is ready" email to a **self-submitted, consented** lead address. It
is not cold-outreach prospecting — none of the guard's contact-route, evidence,
country-allowlist, or business-hour checks are semantically meaningful for a
customer's own submitted address — and it already has its own independent kill
switch (`cfg.revenue.autoEmailReports`, default `false`) and its own idempotency
(`lead.reportEmailSentAt`). Force-fitting the outreach-shaped guard onto it would
require bypassing or hacking around checks that don't apply, which the mission
explicitly prohibits. Flagged as a candidate for a separate, narrower transactional
guard in a future wave — not built this wave.

A real regression was found and fixed while wiring: the admission guard's replay
detection initially hard-`DENY`'d any repeat call whose reservation was already
`sent` or `uncertain` — but the pre-existing, already-tested pipeline contract
treats a replay against an already-`sent` reservation as an idempotent success
confirmation (`{sent:true, duplicate:true}`), and a replay against an `uncertain`
reservation as `{sent:false, reason:'duplicate-uncertain'}`, not a fresh denial.
Fixed by having the pipeline still run the guard and persist its receipt, but
translate a denial whose *only* reason is a pure idempotency-key replay back to
that pre-existing contract — while any other reason present (e.g. a newly
discovered suppression on top of a replay) still hard-denies. This was caught by
running the pre-existing `tests/send-safety.test.mjs` suite, not invented for this
wave.

## Changed artifacts

- `src/deliverability-guard.mjs` — added `excludeReservationId` (so the final
  recheck doesn't flag the reservation the same call just made as a replay or a
  volume-ceiling breach), and `actionIdentity` (a SHA-256 content hash over
  recipient, message, evidence, authority, and policy version — distinct from the
  stable `idempotencyKey`, which intentionally stays the same across retries of
  the same logical send; `actionIdentity` changes whenever the *content* being
  evaluated changes) plus `workspaceId` (mapped to `campaign.id`, the closest
  existing analogue to a workspace boundary in this single-tenant codebase).
- `src/pipeline.mjs` — `Pipeline.maybeSend` now calls the guard at admission and
  at final recheck, persists both receipts via `store.log('deliverability_guard_decision', ...)`,
  cancels (not deletes) the reservation if the final recheck denies, and
  preserves the pre-existing replay/duplicate/uncertain contract. Every
  pre-existing gate (`isSuppressed`, `evaluateSendEligibility`, account
  connectivity, caps, `reserveOutboundSend`) is unchanged and still runs.
- `tests/pipeline-deliverability-guard.test.mjs` — new, 16 tests (see below).
- `package.json` — wired the new test file into `test:deterministic`.

`lite/` has zero changes, confirmed via `git status --short lite/` before and
after.

## Tests actually run, with commands and exact results

- `node --check src/deliverability-guard.mjs` — PASS.
- `node --check src/pipeline.mjs` — PASS.
- `node --check src/send-safety.mjs` — PASS.
- `node --check src/store.mjs` — PASS.
- `node --test tests/deliverability-guard.test.mjs` — 25/25 PASS (unchanged;
  re-verified after the additive `excludeReservationId`/`actionIdentity` change).
- `node --test tests/pipeline-deliverability-guard.test.mjs` (standalone) —
  16/16 PASS.
- `node --test tests/send-safety.test.mjs` (standalone, pre-existing suite) —
  9/9 PASS — this is the regression check that caught and confirmed the fix for
  the replay-contract bug above.
- `npm run check` (== `check:syntax` + full `test:deterministic`) —
  **139/139 tests passed**, 0 failed.
- `npm audit` — 0 vulnerabilities.
- `npm run test:browser` (with `CHROMIUM_PATH` pointed at the Chromium binary
  already present in this container, same as the prior wave — nothing
  installed) — 1/1 PASS, unchanged from before this wave.
- `uberbond_get_state` via the live local MCP bridge — succeeded; returned the
  real worktree diff for this wave's exact changed files.
- `uberbond_run_verification` with `suite: check` via the live local MCP
  bridge — succeeded; returned `status: "passed"`, 139/139 tests.

## Truth table

| Item | Status |
|---|---|
| `Pipeline.maybeSend` wired to the guard at admission + final recheck | COMPLETE |
| Receipts persisted via the existing `store.log()` audit writer (no new receipt system) | COMPLETE |
| `RevenueEngine.sendReportEmail` path searched and documented as consciously out of scope | COMPLETE |
| Replay/duplicate/uncertain contract regression found and fixed | COMPLETE |
| 16 new pipeline-integration hostile tests | PASS_LOCAL |
| 25 pre-existing guard unit tests (unchanged) | PASS_LOCAL |
| 9 pre-existing send-safety/pipeline tests (regression-checked) | PASS_LOCAL |
| Full `npm run check` (139 tests) | PASS_LOCAL |
| `npm audit` | PASS_LOCAL |
| Browser suite | PASS_LOCAL |
| Live MCP `uberbond_get_state` / `uberbond_run_verification` this session | PASS_LOCAL (via real, connected local bridge) |
| GitHub Actions hosted run for this wave's commit | NOT_RUN yet (not pushed at time of local verification) |
| GitHub Actions hosted runs for the two prior commits on this PR | BLOCKED — see below; not a code failure claim |
| Draft PR #26 update | COMPLETE (pushed to task branch only) |
| PR merge / production deploy / any live send | OWNER_REQUIRED — never performed autonomously |
| Any cleared payment or real revenue | EXTERNAL_PROOF_REQUIRED — none claimed, none occurred |

## Exact pipeline path now protected by the guard

`Pipeline.maybeSend(prospect, campaign, options)`:

1. Build the exact snapshot that would be used (`prospect`, `campaign`, `cfg`,
   `date: this.clock()`, `followup`, `body`, `subject`).
2. **Admission gate**: `evaluateDeliverabilityGuard(snapshot)` → receipt persisted
   via `store.log('deliverability_guard_decision', {phase:'admission', ...})`.
   If not `ALLOW_LOCAL_PREPARATION`, stop — no reservation, no provider call.
   (A denial that is purely a replay of an already-`sent`/`uncertain` reservation
   is translated to the pre-existing idempotent contract instead of a fresh
   denial.)
3. Pre-existing gates unchanged: `isSuppressed`, `evaluateSendEligibility`
   (this is where the structural kill switch — `cfg.outbound.enabled`/`dryRun` —
   still independently blocks everything by default), account connectivity.
4. `store.reserveOutboundSend(...)` — unchanged.
5. `store.markOutboundReservation(reservation.id, 'dispatching')`.
6. **Final recheck**: `evaluateDeliverabilityGuard(snapshot, {excludeReservationId: reservation.id})`
   → receipt persisted (`phase:'final-recheck'`). If not
   `ALLOW_LOCAL_PREPARATION`, the reservation is marked `cancelled` (an
   already-supported terminal status in `store.mjs`) with the deny reason
   codes attached, and the function returns without calling the provider.
7. Only past this point does the unchanged `sendEmailFn` (Gmail) call occur.

Reachable entry points, all unchanged: `processProspect` (line ~129, only when
`sendEligible && campaign.autoSend`), `processOutboundQueue`, `processFollowups`.

## Receipt and idempotency proof

- Same replay never creates a second reservation: proven by the pre-existing
  `store.reserveOutboundSend` uniqueness constraint on `idempotencyKey`, now
  additionally proven never to be *reached* on a pure replay (guard denies first)
  — `tests/pipeline-deliverability-guard.test.mjs`, "a reservation stuck in
  dispatching... blocks a fresh retry."
- Receipt linked to the exact action: every `deliverability_guard_decision`
  audit entry carries `prospectId`, `campaignId`, `followup`, `idempotencyKey`,
  and the new `actionIdentity` hash.
- Changed content → new action identity: proven by "a changed message produces
  a different action identity than the original preparation."
- A denied action cannot later be interpreted as allowed: the guard is
  side-effect-free and re-evaluates from current store state every call; there
  is no cached/stale "allowed" flag anywhere.
- Stale receipts cannot authorize a newer action: the final recheck always
  re-evaluates fresh state immediately before the provider boundary,
  independent of what the admission receipt said — proven by the three
  "final recheck blocks..." tests (suppression, expired evidence, expired
  authority, each injected *after* admission passed).
- Workspace isolation: `cross-campaign-mismatch` denies before any reservation
  — proven at both the guard-unit level (prior wave) and the pipeline level
  (this wave).
- Concurrent attempts cannot bypass the guard: `reserveOutboundSend`'s own
  idempotency-key uniqueness constraint (unchanged, pre-existing) is the actual
  concurrency backstop; the guard is additionally checked at both ends of the
  window.
- Crash between receipt creation and reservation: recoverable — the admission
  receipt is written before the reservation attempt, so a crash there simply
  means the reservation was never created; a retry re-runs admission cleanly.
- Crash between reservation and final recheck: cannot produce a live send —
  proven by "a reservation stuck in dispatching... blocks a fresh retry rather
  than silently resending." No automatic recovery/cancellation sweep for a
  reservation stuck in `dispatching` exists yet (see remaining risks); it
  correctly blocks a naive retry rather than silently completing it.
- All state transitions deterministic and auditable: proven by "the same fixed
  reference time produces byte-identical admission decisions on identical
  fresh state."

## External-effect ledger

- Network calls: 0. Provider calls: 0 real (all tests use a stubbed
  `sendEmailFn` hook; the structural kill switch means the actual `gmail.mjs`
  `sendEmail` was never invoked with a real Google token in this session).
- Messages sent: 0. Purchases: 0. Deployments: 0 (Vercel status checks seen on
  the PR are the repository owner's existing auto-deploy integration, not
  something this session triggered). DNS/credential changes: 0. Production
  mutations: 0.
- Git operations: local commits and a push to
  `claude/uberbond-overnight-shift-o73nrs` only. No merge, no push to `main`
  (unchanged at `ba2b100ac57b7cf0fd84532f6ea6770c6ebeed8a`), no force-push, no
  history rewrite.
- Secrets: none read, exposed, or created.

## lite/ protection result

Confirmed unchanged via `git status --short lite/` before and after every edit
this wave — empty output both times.

## GitHub Actions result

Checked the PR's actual CI state via the GitHub API rather than assuming. The
`.github/workflows/ci.yml` "CI" workflow **did trigger** for the two commits
already on PR #26 (run #47 for `76ed7ce`, run #48 for `ccbc948`) — both jobs
(`browser`, `deterministic`) show `status: completed`, `conclusion: failure`,
each completing in **~3 seconds**. Attempting to fetch the actual job logs for
both returned HTTP 404 (no log content available), which is consistent with
the jobs never executing any real step (a 3-second `npm ci` + full test run is
not possible; the same suite takes ~25–35s in this container) rather than a
genuine code/test failure. This matches this session's stated GitHub billing
lock. I could not retrieve literal log text confirming the word "billing,"
so stated precisely:

**BLOCKED — GitHub Actions runs exist and are marked failure, complete in
~3s with no retrievable logs, consistent with the account billing lock
preventing job execution rather than a code failure. This is not a hosted
CI pass and is not claimed as one.**

This wave's new commit had not yet been pushed at the time of local
verification, so no workflow run exists for it yet; it will trigger on push.

## Benchmark pulse

UNKNOWN — no competitor benchmarking was run this session. Not a worldwide
census; no competitor capability, product, or score is claimed or invented.

## Remaining risks and contradictions

- A reservation stuck in `dispatching` (e.g. from a real process crash between
  the `dispatching` transition and the final recheck/send) has no automatic
  recovery or cancellation sweep. Today it correctly blocks a naive retry
  (proven by test) rather than silently resending, but it also means a
  genuinely crashed reservation stays stuck until an operator manually
  inspects and cancels it. A time-boxed sweep (analogous to
  `Pipeline.recoverStaleProspects` for the `prospects` collection) would be
  the natural next fix, reusing the existing `outboundReservations` table —
  not building a new one.
- The volume-ceiling counting logic in the guard still independently re-derives
  (read-only) the same daily/hourly counting arithmetic that
  `store.reserveOutboundSend` performs internally, flagged as a deferred risk
  in the prior wave and still not extracted into one shared helper — low risk,
  both sides are covered by tests, but worth unifying if the counting logic
  ever changes.
- `RevenueEngine.sendReportEmail` remains outside the guard's scope by design
  (see Outcome above); it has its own independent kill switch and idempotency,
  but no receipt/audit trail comparable to `deliverability_guard_decision`.
  If transactional report delivery ever needs the same audit rigor, it should
  get its own narrow guard variant, not a forced reuse of the outreach-shaped
  one.
- GitHub Actions billing lock is unresolved; this session cannot fix billing
  and did not attempt to.

## Rollback instructions

No schema or migration changes were made this wave (no new tables, no new
columns) — a rollback is a pure code revert. To roll back: `git revert` the
commit that wires the guard into `Pipeline.maybeSend`, or simply stop calling
`evaluateDeliverabilityGuard` from `maybeSend` — every pre-existing gate
(`isSuppressed`, `evaluateSendEligibility`, `reserveOutboundSend`, sender
health, the structural kill switch) is untouched and fully load-bearing on
its own, exactly as it was before this wave.

## Exact owner action (max 3)

1. Resolve the GitHub billing lock so Actions can produce a real hosted CI
   result on PR #26 — the ~3-second failed runs above are not evidence either
   way about the actual code.
2. Review and, when ready, merge Draft PR #26 (never done autonomously).
3. Decide whether a time-boxed recovery sweep for reservations stuck in
   `dispatching` is worth adding next, or whether manual operator review of
   stuck reservations is acceptable for now.

## Next highest-leverage wave

Add a time-boxed recovery sweep for `outboundReservations` stuck in
`dispatching` past a configurable timeout (mirroring
`Pipeline.recoverStaleProspects`), transitioning them to a state that allows
a fresh, guarded retry — reusing the existing `outboundReservations` table,
no new model.

## Decision

**PROCEED** — the guard is now the real pre-action admission gate for every
cold-outreach send path, receipts are persisted through the existing audit
writer, a genuine regression was caught by pre-existing tests and fixed
without weakening any gate, and 139/139 local tests plus a live MCP
verification pass. No external, destructive, or irreversible action was
taken. GitHub Actions remains blocked by billing, honestly reported as such.
