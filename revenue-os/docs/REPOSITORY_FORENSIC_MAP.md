# Repository Forensic Map

Base: `main` @ `ba2b100`. This worktree (`overnight/first-payment-revenue-os`) branches directly
from `main`, not from any of this session's other in-progress branches
(`overnight/bounded-pilot-runtime`, `product/agency-revenue-watchtower`,
`revenue/agency-diagnostic-48-hour`) — those are separate, uncommitted-to-`main` work and out of
scope for this mission's "exact base SHA" requirement.

## Branches present locally

`main`, `automation/full-commercial-loop`, `overnight/autonomous-revenue-game-changer`,
`overnight/revenue-maximizer-ai-service-factory`, plus this session's other worktree branches
(`overnight/bounded-pilot-runtime`, `product/agency-revenue-watchtower`,
`revenue/agency-diagnostic-48-hour`) and several `origin/*` branches
(`night-shift/dry-run-safe`, `p2.1/autonomous-reply-sync`, `p2/stale-recovery-ci`, …). None of
these are merged into `main`; `main`'s own history ends at "Remove temporary patch file" after a
P0.1 launch-repository install. This mission builds fresh from `main` only.

## What `main` already contains (root repo, outside `lite/`)

| Area | File(s) | Real capability already present |
|---|---|---|
| Store | `src/store.mjs` | Dual-backend (`JsonStore` + `PostgresStore`) generic collection store, transactions, `COLLECTIONS` registry, `ConflictError` |
| Queue | `src/queue.mjs` | `DurableQueue` — dedupe/singleton keys, leases, heartbeats, retries, dead-letter, stale-job recovery |
| Discovery | `src/discovery.mjs`, `src/discovery-runner.mjs` | Overpass-based business discovery (real network dependency, not used by this mission) |
| Prospecting | `src/prospect-import.mjs`, `src/json-import.mjs`, `src/audit-rules.mjs` | Prospect validation/import, deterministic website audit scoring |
| Outbound | `src/gmail.mjs`, `src/send-safety.mjs`, `src/unsubscribe.mjs` | Real Gmail OAuth/send/read wrapper, send-eligibility rules, one-click unsubscribe tokens |
| Payments | `src/payments.mjs` | Lemon Squeezy webhook signature verification + checkout URL builder (a *real* payment-provider webhook contract, but for a different provider/flow than this mission's evidence-based reconciliation) |
| Security | `src/security.mjs` | SSRF guard (`assertPublicUrl`, `isPrivateIp`) |
| CSV | `src/csv.mjs` | Bare CSV parser (**no formula-injection guard** — confirmed by inspection, see decision doc) |
| Revenue | `src/revenue.mjs` | `RevenueEngine` class — campaign/lead-scoped revenue tracking, not opportunity/funnel scoring in this mission's sense |
| Migrations | `migrations/001-004` | initial schema, durable queue, shared artifacts, unattended-send-safety |
| Tests | `tests/*.test.mjs` (11 files, 1,635 lines) | Full pre-existing suite; re-run in full as part of this mission's "all existing tests" requirement |
| `lite/` | `lite/**` | The protected, self-contained "Cash Engine Lite" product — inspected only to confirm no accidental dependency, never imported from |

`src/automation/` (built by a *different* session on a *different*, unmerged branch) does not exist
on `main`. This mission's `revenue-os/` package does not depend on it.

## What this mission needs that does not exist on `main`

Everything in `01_MISSION.md`'s 18 workstreams: the canonical revenue-OS entity model (organization/
opportunity/proposal/payment/diagnostic/etc.), research-pack importers with lineage, opportunity
scoring, approval packets, provider-neutral outbound handoff, reply classification, proposal/
payment-request generation, evidence-based payment verification, the diagnostic-factory state
machine, white-label reports, implementation/monitoring gates, funnel/experiment tracking, an
owner command center, a scheduler job registry, bounded AI assistants, and hostile-test coverage.
None of it is reused wholesale from `lite/` or from this session's other worktrees (each of those
is a separate, independent branch off the same `main`) — see `REUSE_VS_REPLACE_DECISION.md` for
which *patterns* (not code) are intentionally repeated.
