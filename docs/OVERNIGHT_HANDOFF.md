# Overnight Handoff — 2026-08-17

## Outcome

**Wave: Deliverability Guard.** Built a deterministic, side-effect-free
Deliverability Guard (`src/deliverability-guard.mjs`) that gates any
proposed outbound action with an explainable `ALLOW_LOCAL_PREPARATION` /
`REVIEW_REQUIRED` / `DENY` decision and a complete audit receipt. It
composes UberBond's existing canonical safety primitives — suppression
list, outbound-reservation idempotency table, sender-health pausing,
contact/evidence eligibility rules, country/business-hour gates — rather
than duplicating any of them. No new table, queue, suppression model, or
evidence model was created. The guard never calls a provider and never
writes state; even its `ALLOW_LOCAL_PREPARATION` result only means "safe to
draft," not "safe to send." Live outbound remains structurally disabled by
existing `cfg.outbound.enabled=false` / `dryRun=true` defaults, unchanged.

A real defect was found and fixed while writing hostile tests: the guard's
staleness/expiry checks (reservation staleness, evidence age, campaign
expiry) initially compared against real wall-clock `Date.now()` instead of
the decision's own `date` parameter, making the guard non-deterministic
relative to real time — a violation of the "same input → same decision"
requirement. A hostile regression test caught this before it shipped; all
three call sites now use the reference date passed into the function.

## Changed artifacts

- `src/deliverability-guard.mjs` — new. `evaluateDeliverabilityGuard()`,
  pure and read-only; `POLICY_VERSION` constant.
- `src/send-safety.mjs` — added `suppressionLookup(store, {website, email})`,
  extracted as the one canonical suppression check (previously only existed
  duplicated inline inside `Pipeline.isSuppressed`).
- `src/pipeline.mjs` — `Pipeline.isSuppressed` now calls the extracted
  `suppressionLookup` instead of duplicating the lookup logic; removed the
  now-unused `normalizeDomain` import. No behavior change (23 pre-existing
  send-safety/pipeline tests still pass unmodified).
- `src/config.mjs` — added `outbound.maxEvidenceAgeDays` (default 45,
  `OUTBOUND_MAX_EVIDENCE_AGE_DAYS` env override), following the exact
  pattern already used for `minEvidenceConfidence`.
- `tests/deliverability-guard.test.mjs` — new, 25 tests (see below).
- `package.json` — wired `src/deliverability-guard.mjs` into `check:syntax`
  and `tests/deliverability-guard.test.mjs` into `test:deterministic`, so
  neither is ever silently unverified (the exact gap found and fixed for the
  MCP bridge in the prior wave).

`lite/` has zero changes, confirmed before and after via
`git status --short lite/`.

## Tests actually run, with commands and exact results

- `node --check scripts/uberbond-mcp.mjs` — PASS.
- `node --test tests/claude-mcp.test.mjs` — 6/6 PASS.
- `npm run check` (== `check:syntax` + full `test:deterministic`) —
  **123/123 tests passed**, 0 failed.
- `npm audit` — 0 vulnerabilities.
- `node --test tests/deliverability-guard.test.mjs` standalone — 25/25 PASS.
- `uberbond_get_state` via the live local MCP bridge — succeeded; returned
  the real worktree diff (`package.json`, `src/config.mjs`,
  `src/pipeline.mjs`, `src/send-safety.mjs` modified;
  `src/deliverability-guard.mjs`, `tests/deliverability-guard.test.mjs`
  untracked), confirming the connection is genuine, not simulated.
- `uberbond_run_verification` with `suite: check` via the live local MCP
  bridge — succeeded; returned `status: "passed"`, 123/123 tests.
- `npm run test:browser` — ran with `CHROMIUM_PATH` pointed at the
  Chromium binary already present in this container at
  `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` (the pinned
  `playwright@1.61.1` package's default resolution pointed at a revision
  that isn't present, `chromium-1228`; `src/browser-crawler.mjs` already
  honors `CHROMIUM_PATH` for exactly this case, so pointing at it required
  no install) — **1/1 PASS**.
- GitHub Actions: **BLOCKED** — account billing lock stops workflows before
  they start. This is an infrastructure/billing blocker, not a code
  failure; no hosted CI run exists to point to, and none is claimed.

## Truth table

| Item | Status |
|---|---|
| Deliverability Guard implemented, composing existing canonical safety records | COMPLETE |
| 25 hostile guard tests (eligible, missing/expired/contradictory evidence, suppression, opt-out, complaint, bounce, duplicate, replay, stale reservation, uncertain identity, inferred route, missing/expired authority, review-required autoSend, unsupported provider, volume ceiling, unsupported claims, safety window, cross-campaign, malformed input, no-provider-call proof) | PASS_LOCAL |
| Real-time-vs-reference-date determinism bug found and fixed | COMPLETE |
| `suppressionLookup` extraction (no duplicate suppression model) | COMPLETE |
| Full `npm run check` (123 tests) | PASS_LOCAL |
| `npm audit` | PASS_LOCAL |
| Browser suite | PASS_LOCAL (Chromium was present; pointed `CHROMIUM_PATH` at it, installed nothing) |
| Live MCP `uberbond_get_state` / `uberbond_run_verification` calls this session | PASS_LOCAL (via real, connected local bridge) |
| GitHub Actions hosted run | BLOCKED (billing lock; infra, not code) |
| Draft PR #26 update | COMPLETE (pushed to task branch only) |
| PR merge / production deploy / any live send | OWNER_REQUIRED — never performed autonomously |
| Any cleared payment or real revenue | EXTERNAL_PROOF_REQUIRED — none claimed, none occurred |

## External-effect ledger

- Network calls: 0 outbound provider calls, 0 scraping, 0 messages sent.
- Purchases: 0. Deployments: 0. DNS changes: 0. Credential/secret changes: 0.
- Production mutations: 0.
- Git operations: local commits and a push to
  `claude/uberbond-overnight-shift-o73nrs` only. No merge, no push to
  `main` (still at `ba2b100ac57b7cf0fd84532f6ea6770c6ebeed8a`, unchanged),
  no force-push, no history rewrite.
- The guard itself performed zero writes during all 25 tests — verified
  explicitly by asserting `outboundReservations` stays empty across a
  sweep of DENY/REVIEW/malformed calls, and by a static-source check that
  the guard module contains no reference to `sendEmail`, `gmail.mjs`, or
  any network call.
- Secrets: none read, exposed, or created.

## Security and policy invariants verified

- Guard is a pure function: same `{store, prospect, campaign, cfg, date}`
  snapshot now deterministically yields the same decision (fixed the
  wall-clock bug above to make this true).
- No existing safety gate was weakened; `evaluateSendEligibility`,
  `contactEligibility`, `evidenceEligibility`, and the store's
  idempotency/cap/sender-health logic are all unmodified and reused as-is.
- No new suppression table, queue, evidence model, or revenue model.
- `lite/` untouched (verified via `git status` before and after).
- `ALLOW_LOCAL_PREPARATION` cannot escalate to a send: the guard has no
  code path that calls a provider, confirmed by test and static check.

## Benchmark pulse

UNKNOWN — no competitor benchmarking was run this session. Not a worldwide
census; no competitor capability, product, or score is claimed or invented.

## Remaining risks and contradictions

- The guard's daily/hourly volume-ceiling preview re-derives the same
  count logic that `store.reserveOutboundSend` uses internally
  (read-only, via `store.list`), rather than sharing one extracted helper
  with it — a small duplication of *counting arithmetic* (not of the
  suppression/idempotency/queue *models* themselves, which remain single
  sources of truth). Low risk since both sides are covered by tests; worth
  factoring into one shared helper in a future wave if the counting logic
  changes.
- "Unsupported claims" detection is a small deterministic pattern list
  (guarantee/100%/risk-free/superlative-rank/instant-results/proven-to). It
  is intentionally conservative and will not catch every unsupported claim
  a human reviewer would flag — it is a fast deterministic pre-filter, not
  a substitute for the human review this repo's `docs/constitution/`
  policy already requires for every real outreach send.
- GitHub Actions remains blocked by the account billing lock; this session
  cannot fix billing and did not attempt to.

## Exact owner action (max 3)

1. Resolve the GitHub billing lock so Actions can run hosted CI on PR #26 —
   nothing in this repo can substitute for a real hosted run.
2. Review and, when ready, merge Draft PR #26 (never done autonomously).
3. If/when live outbound is ever intentionally enabled, treat the
   Deliverability Guard as an additional pre-send check layered in front
   of `Pipeline.maybeSend`, not a replacement for `evaluateSendEligibility`
   — the two currently run independently and should be wired together
   deliberately by the owner, with explicit review of the wiring.

## Next highest-leverage wave

Wire `evaluateDeliverabilityGuard()` into the actual `Pipeline.maybeSend`
call path (behind the same structural kill switch) so the receipt it
produces becomes the real pre-send audit record, and persist that receipt
to `auditLog` via `store.log()` — turning today's pure decision function
into an audited one without adding a new storage model.

## Decision

**PROCEED** — new code is narrowly scoped, fully reuses existing canonical
safety data, is covered by 25 passing hostile tests plus the full 123-test
repo suite, and a real determinism bug was caught and fixed before
shipping. No external, destructive, or irreversible action was taken.
