# UBERBOND PR#4 REPAIR — SESSION STATE

Last updated: 2026-07-21 (Phase 1 read-only inspection)

## Repository facts (verified by direct git inspection)

- Repo root: `/home/user/uberbondd`
- Current branch: `claude/uberbond-pr4-max-score-2vmv60`
- Current HEAD: `ba2b100ac57b7cf0fd84532f6ea6770c6ebeed8a` (identical to `origin/main`)
- Working tree: clean, no dirty/untracked files at session start — nothing to checkpoint/preserve.
- Accepted P2.1 base `a905c907de67fdacfc85ee1cd1e3660eefb1be81`: **exists** on `origin/p2.1/autonomous-reply-sync` (fetched; was not present until `git fetch origin`).
- Rejected PR #4 head `41bd12e97525c4a4fe2c8b93613a400767015cba`: **exists** on `origin/claude/uberbond-p2-2-setup-c29k84` == GitHub PR #4 head (fetched).
- `origin/claude/uberbond-pr4-max-score-2vmv60` (this branch's prior remote copy) was pruned/deleted on the remote — no prior repair work exists there.

## Ancestry (verified)

```
ba2b100 (main, current HEAD)
 ├── + 243ff73, e29319d, a905c90  →  a905c907... (ACCEPTED BASE, PR #3, "p2.1/autonomous-reply-sync")
 └── + 05def14 .. 41bd12e (8 commits) → 41bd12e... (REJECTED HEAD, PR #4)
```

- `a905c907` is **NOT** an ancestor of current HEAD, and current HEAD **is** an ancestor of `a905c907` — i.e. accepted base is strictly ahead of current branch tip by 3 commits.
- `a905c907` is **NOT** an ancestor of `41bd12e` — confirms **P0-01**: PR #4 was built as a sibling branch from `ba2b100`, not on top of the accepted P2.1 base. `merge-base(ba2b100, 41bd12e) == ba2b100`, `merge-base(HEAD, a905c907) == ba2b100`.

## lite/ protected path

- `lite/` tree hash `caeb6a6d545d18e30a8f4b3442b2b664da1aaac4` is **identical** across current HEAD, accepted base `a905c907`, and (to be reconfirmed after branch build) rejected head `41bd12e`.
- No local edits have touched `lite/`. Zero diff currently: `git diff --exit-code a905c907...HEAD -- lite/` → clean.

## P2.2 code map (only exists on rejected PR #4 branch — none of it is on current HEAD or accepted base)

Files added/changed by `ba2b100..41bd12e` (excluding `lite/`):

- `migrations/005_autonomy_cycle.sql` (new)
- `src/autonomy-cycle.mjs` (new) — orchestrator; expected home of `runAutonomyCycle()`, `withStageTimeout()`
- `src/gmail-inbound.mjs` (new) — expected home of `createGmailInboundReader()`, `inboundGet()`
- `src/inbound-classify.mjs` (new) — reply classification / suppression stage
- `src/store.mjs` (modified) — generic JSON/Postgres store; where `autonomyCycleRuns` generic-mutation bypass must be checked/fixed
- `src/config.mjs` (modified) — inbound gates/env config
- `scripts/run-autonomy-cycle.mjs` (new) — manual entry point
- `scripts/p2-2-crash-worker.mjs` (new) — crash/SIGKILL test harness
- `tests/autonomy-cycle.test.mjs`, `tests/autonomy-cycle-store.test.mjs`, `tests/inbound-classify.test.mjs`, `tests/p2-2-capabilities.test.mjs`, `tests/p2-2-postgres-race.test.mjs` (new)
- `tests/postgres-schema.test.mjs` (modified)
- `package.json` (modified) — new scripts: `autonomy-cycle`, `smoke:postgres-p2-2-race`, expanded `test:deterministic`/`check:syntax`

No P2.2 symbol (`withStageTimeout`, `runAutonomyCycle`, `createGmailInboundReader`, `inboundGet`, `autonomyCycleRuns`, `leaseOwner`, `leaseExpires`) exists anywhere outside `lite/` on current HEAD or on accepted base — confirms repair must be built fresh from accepted base by reconstructing/reviewing the rejected branch's commits one at a time, not merged wholesale.

## Environment

- Node v22.22.2, npm 10.9.7
- `psql` client present (PostgreSQL 16.13). No `DATABASE_URL`/`TEST_DATABASE_URL` env set. Real isolated-Postgres server availability NOT YET CONFIRMED (only the client binary is confirmed present) — must verify a real disposable server can be started (`embedded-postgres` / `pg` are already devDependencies on the rejected branch) before any race-condition row can be marked Pass.
- `.github/workflows/`: `acquisition-pr-checks.yml`, `acquisition-workers.yml`, `ci.yml`, `lite-audits.yml` exist on accepted base. Failed-run logs for PR #4 have not yet been retrieved (read-only GitHub inspection not yet performed).

## Current phase

Phase 1 (read-only inspection) — substantially complete. No edits made. No branch created yet.

## Recovery state saved: yes (this file + siblings in `.claude/uberbond-continuity/`)
