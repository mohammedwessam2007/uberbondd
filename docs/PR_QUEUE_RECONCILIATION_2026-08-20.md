# Pull-request queue reconciliation — 2026-08-20

Every open pull request on this repository was audited against `main` and given
a disposition backed by evidence, not by reading its description. Nine were
open; three remain. This document is the record of why.

The method for each PR: check whether its head is a git ancestor of `main`;
if not, check whether its *content* reached `main` by another route; and run a
real trial merge into current `main` in a throwaway worktree to measure actual
conflict surface. No PR was closed on the basis of its age or its wording.

## Merged

### PR #33 — Harden relay ingress and bind execution receipt

Independently re-verified in a clean worktree at `a90beee` before merging
rather than trusting the PR body: `npm run check` → **1092 tests, 1050 pass,
0 fail, 42 skipped**, zero `not ok`, zero `SyntaxError`, `lite/` untouched.
The claim in the PR matched the measurement exactly.

Substance: the relay body-size cap previously guarded only *streamed* request
bodies, so an already-parsed Vercel body bypassed it entirely. This closes that
and adds a bounded, fail-closed GitHub upstream timeout so a hung upstream call
cannot occupy the function indefinitely.

## Closed as provably superseded

| PR | Evidence |
|---|---|
| **#27** Commercial opportunity catalog | Head `4459004` is a literal git ancestor of `main` (`merge-base --is-ancestor` → true). Reached `main` via the `agent/cloud-agent-relay` lineage in PR #29. |
| **#24** V9 closure + outreach canary + opportunity factory | Commits divergent (130 ahead), but content present: `src/omnia-v9/kernel.mjs`, `gmail-effect-adapter.mjs`, `src/opportunity-factory.mjs`, the canary runbook, and **37** `tests/omnia-v9*` files are all on `main`, recovered from the verified historical archive. Trial merge conflicts in 9 files *against the very content it would re-add*. |
| **#4** P2.2 first attempt | Superseded by PR #5 per its own history ("replaces the earlier rejected PR #4 attempt (wrong ancestry, multiple P0/P1 findings)"). Keeping it open risked merging the known-bad ancestry. |
| **#2** Stale reservation recovery + CI gating | Re-implemented on the main lineage: `src/reservation-recovery.mjs` and `tests/reservation-recovery.test.mjs` are on `main`, wired through `job-handlers.mjs` with configurable timeout and sweep ceiling. Its own gate ("do not merge until Actions passes") was never satisfiable — Actions has been down since 2026-07-17. |
| **#3** Scheduled autonomous reply sync | Scheduling architecture changed: `main` uses in-process `src/scheduler.mjs` (covered by `tests/prometheus-scheduling.test.mjs`), not Actions cron. The acquisition-workers workflow does not exist on `main`. Merging would add a second competing scheduling authority. |
| **#1** Dry-run-safe acquisition checkpoint | Root of the July stack. Every property it protected re-verified as still holding on `main`: `lite/` unchanged, `outbound.enabled=false` / `dryRun=true`, `live-outbound-send` recorded `MISSING`, and scheduled work gated by two independent default-false flags (`AUTOPILOT_ENABLED`, `PROMETHEUS_SCHEDULING_ENABLED`). It was a checkpoint, not a change to land. |

Closing a PR did not delete its branch. `night-shift/dry-run-safe`,
`p2/stale-recovery-ci`, and `p2.1/autonomous-reply-sync` are intact and remain
the ancestry of PR #5.

## Kept open — real, unmerged capability

These two are genuinely absent from `main` and were **not** closed. Each has a
detailed technical assessment posted on the PR itself.

### PR #7 — Canon/V3 durable acquisition cycle

Missing from `main`: `src/autonomous-cycle.mjs`, `send-eligibility.mjs`,
`dispatch-adapter.mjs`, `campaign-activation.mjs`, `attribution-chain.mjs`.
Already recorded honestly in `src/capability-graph.mjs` as
`canon-v3-acquisition-cycle` → `MISSING`.

Trial merge: 4 conflicts (`package.json`, `src/job-handlers.mjs`,
`src/store.mjs`, `worker.mjs`) across 21,502 insertions of July-era code. The
hazard is not textual but semantic: `runDispatch`'s pre-send recheck and
`claimCohortMember` were written against a `store.mjs` whose transaction and
reservation semantics have since changed. A resolution that passes the old 317
tests could still weaken the outbound send gate, with no hosted CI as a second
net. It also introduces a second staged orchestrator alongside the Prometheus
spine — an unresolved duplication question.

### PR #5 — Inbound-only shadow autonomy cycle

Missing from `main`: `src/autonomy-cycle.mjs`, `src/gmail-inbound.mjs`. `main`
has no inbound reply/bounce/complaint/unsubscribe ingestion at all.

Trial merge: 11 conflicts across the whole safety core, and the diff carries
**800 deletions** — a stale branch removing lines from `pipeline.mjs`,
`store.mjs`, and `gmail.mjs` can revert later safety work while still passing
its own July tests. `src/gmail.mjs` is now the archive-recovered superset and
`src/prospect-import.mjs` the evidence-bound v2; this branch predates both.

Its own two disclosed blockers also remain genuinely open: there is still no
owner-approval surface for an inbound account, and CI has never been observed
on that head. Its strongest property — an inbound path with no reachable send
capability, proven by static import scan rather than by assertion — is worth
preserving exactly as designed, which means a rebase and re-verification, not
an auto-merge.

## One claim this session could not verify

`docs/ARGUS_RELAY_TRUTH.md` and `docs/CHATGPT_CLAUDE_CLOUD_RELAY.md` state that
a Vercel project `uberbond-relay` is deployed at
`https://uberbond-relay.vercel.app/api/agent-relay`, deployment
`dpl_9ox6CB71AdLeSHVaEfv8oq1ukBZ9`, READY and fail-closed at
`503 RELAY_NOT_CONFIGURED`.

**That could not be confirmed from this session.** Three independent checks
were inconclusive:

- The Vercel account connected here lists **zero projects** under team `team_A9Lnj…`.
- `get_deployment` for `dpl_9ox6CB71AdLeSHVaEfv8oq1ukBZ9` returns **404 not_found** against that team.
- A direct HTTPS probe is blocked by this sandbox's egress proxy (`CONNECT tunnel failed, 403`), which says nothing either way.

This is recorded as **unverified, not refuted.** The most likely explanation is
simply that the deployment lives on a different Vercel account than the one
connected to this session. It is noted here only so that nobody later reads
those two documents as independently confirmed — they were written by a
different agent and the deployment claim rests on that agent's own evidence,
not on anything reproduced here.

## Unchanged

Hosted GitHub Actions remains **BLOCKED**: green through 2026-07-17, then every
run from `fe51c3c` onward dies in ~3–10 seconds with 404 job logs. Owner fix is
GitHub → Settings → Billing.

Real commercial state is unchanged: **$0 verified revenue, 0 verified paying
customers, 0 accepted live deliveries.** Nothing in this reconciliation
produced a message, a spend, a deployment, a credential change, or a
production mutation.
