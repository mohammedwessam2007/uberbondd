# Agent mesh failure matrix

What has actually been attacked, what held, what broke, and what has not been
looked at. Rows are only marked verified when a test exists that fails if the
guard is removed — a test that cannot fail is not evidence.

Status vocabulary:

- **VERIFIED_LOCAL** — a test exercises it and fails when the guard is reverted.
- **HELD** — attacked by hand and behaved correctly; no permanent test yet.
- **FIXED** — was broken, now guarded by a regression test.
- **UNREVIEWED** — same shape as something that broke elsewhere; not yet examined.
- **EXTERNAL_PROOF_REQUIRED** — cannot be settled without a real external system.

---

## State monotonicity and replay

| Failure mode | Status | Evidence |
|---|---|---|
| Terminal execution replayed identically | VERIFIED_LOCAL | `agent-execution-replay-canonical` |
| Terminal execution replayed with reordered keys | **FIXED** | Was `terminal-execution-history-conflict`; canonical key ordering via shared `sameJson` |
| Terminal execution resurrected by an earlier stage | **FIXED (P0)** | Two writes in one millisecond reopened a terminal task and lost the terminal state; ordering now ranks by state-machine stage |
| Reordered array treated as identical | VERIFIED_LOCAL | Arrays deliberately order-sensitive |
| Execution id changed mid-history | VERIFIED_LOCAL | `execution-id-changed-within-task-history` |
| Unrecognised status accepted | VERIFIED_LOCAL | Fails closed with `execution-status-invalid` |
| Stale earlier stage arriving late | **FIXED (P0)** | Covered by the stage-rank ordering above |

## Compute budget

| Failure mode | Status | Evidence |
|---|---|---|
| Capacity created across reserve/commit/release | VERIFIED_LOCAL | Seeded 3,000-step walk, invariant checked after every transition |
| Actual usage above the reserved ceiling | VERIFIED_LOCAL | `actual-cost-exceeds-reservation` |
| Double commit on one reservation | VERIFIED_LOCAL | `active-compute-reservation-required` |
| Retry after a safe release | **FIXED (P1)** | Was permanently blocked; the safe-retry path did not exist |
| Two workers reserving the same task | VERIFIED_LOCAL | Snapshot is not authority; only one commit can land |
| Budget snapshot rolled back on a timestamp tie | **FIXED (P0)** | 700 cents of recorded spend vanished and the capacity reappeared; snapshots now rank by monotonic committed spend |
| Reservation map exhaustion | HELD | Bounded at 10,000 with a reason code that now names *which* limit was hit |

## Authority and consequence

| Failure mode | Status | Evidence |
|---|---|---|
| Task declaring a consequential class | VERIFIED_LOCAL | `worker-only-accepts-local-preparation` |
| Task declaring **no** consequence class | **FIXED (P1)** | Was accepted and went on to reserve compute; unknown now fails closed |
| Refused task holding budget | VERIFIED_LOCAL | Refusal happens before reservation |
| Model result claiming nonzero external effects | HELD | Rejected as `INVALID_MODEL_RESULT` |
| Secret-shaped content in a task or result | VERIFIED_LOCAL | Type-based scanner; string under a token key still caught |

## Crash recovery

| Failure mode | Status | Evidence |
|---|---|---|
| Crash before dispatch | VERIFIED_LOCAL | Soak: capacity returns, task retryable |
| Crash after model success, before persistence | VERIFIED_LOCAL | Soak boundary 2 |
| Crash after persistence, before submission | VERIFIED_LOCAL | Soak boundary 3, replay converges |
| Crash after submission, before recording it | VERIFIED_LOCAL | Soak boundary 4, no second record |
| 1,000 tasks with crashes at all four boundaries | VERIFIED_LOCAL | `agent-mesh-soak` asserts each boundary was actually hit |

## Not yet reviewed

Three P0/P1 defects this session were the same mistake: **"latest" defined as
"most recently stamped" rather than "furthest along a monotonic quantity."**
These have the same shape and have not been examined:

| Site | Risk |
|---|---|
| `agent-code-artifact-store` latest-artifact selection | Probably safe — artifacts are content-addressed and identity collisions are rejected before the sort. Not proven. |
| `cloud-agent-relay` `listCloudRelayTasks` ordering | Listing only; no authority decision reads it. |
| `agent-autonomy-store` run listing | Listing only. |

`loadLatestAutonomyRun` was in this list and now has an append-order tiebreak.
It ranks on no monotonic field because the run record declares none, and
`saveAutonomyRunSnapshot` enforces no transition guard at all — so run state is
*ordered* but not *protected*. That is a real gap, deliberately left open and
recorded rather than papered over.

## A guard that was itself wrong

The build-wiring guard originally counted only `package.json` references and
reported 23 test files as orphaned. 19 of them were imported by
`tests/agent-relay.test.mjs`, which runs — so they were never orphaned, and
acting on the report made them run twice.

Recorded here because the failure mode is general: **a verification tool that
is wrong is worse than no tool, since it manufactures confident action.** The
guard now resolves the import graph and also fails when a file is both named
and imported. Both directions were checked by reintroducing each fault.

## External proof required

| Claim | State |
|---|---|
| HTTP ingress serving real traffic | Deployed nowhere. Exercised over loopback against the real GitHub API. |
| GitHub Actions running the mesh suites | Blocked at the account level; every run dies in 3–10s with 404 job logs. |
| Real provider (OpenAI/Anthropic) execution | Adapters exist and are disabled by default. No provider has been called. |
| Any commercial outcome | Zero. No customers, no payments, no deliveries. |
