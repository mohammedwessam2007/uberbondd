# UberBond Canon / Autonomous Revenue V3 Integration — Delivery Summary

Base: PR #6 head `27cd700e7d27287382c9f5e1811ae704f4f1535e` (branch
`claude/uberbond-full-automation-841k2f`), base `main` at `ba2b100ac57b7cf0fd84532f6ea6770c6ebeed8a`.

Full finding-by-finding disposition of the premerge audit (`UBERBOND_CLAUDE_PREMERGE_AUDIT_V1`):
see `docs/PREMERGE_AUDIT_DISPOSITION.md`. Repo orientation for future sessions: `CLAUDE.md`.

**This PR was subsequently repaired** in response to an independent review
(`UBERBOND_CLAUDE_PR7_REPAIR_PACK_V1`) that found real defects in the durable stage ordering, the
frozen-cohort/batch-approval model, and the pre-dispatch safety recheck. Every finding and its fix
is documented in `docs/PR7_REPAIR_REPORT.md` — read that alongside this file for the current,
correct state of the cycle/cohort/dispatch mechanisms (some of what follows below describes the
pre-repair design; the repair report is authoritative wherever the two differ).

## What this delivers

A durable, staged, resumable acquisition cycle (`src/autonomous-cycle.mjs`) built entirely on PR
#6's existing Revenue OS control plane and `DurableQueue` — opportunity hunting, prospect supply,
send planning, dispatch, reply sweeping, attribution, and checkpointing — plus the safety layer the
premerge audit required before any of that could be trusted: canonical send eligibility
(`send-eligibility.mjs`), fail-closed dispatch (`dispatch-adapter.mjs`), an exact-batch campaign
activation gate (`campaign-activation.mjs`), typed contact routes (`contact-routes.mjs`), reserved-
domain rejection (`reserved-domains.mjs`), evidence-independence scoring
(`evidence-independence.mjs`), a canonical reply classifier (`reply-classifier.mjs`), a durable cost
ledger (`store.mjs#reserveCostBudget`), and a portfolio allocator with a minimum-sample proven-lane
gate (`portfolio-allocator.mjs`). Six Canon governance registries (offer portfolio, experiment
registry, gate registry, message-variant registry, attribution contract, company-revalidation
queue) and the V3 research-seed corpus are landed as hash-verified versioned data contracts under
`data/canon/` (`src/canon-registries.mjs`, `src/research-seed.mjs`).

## Changed files

- **New migration:** `migrations/008_canon_v3_integration.sql` — `campaign_activation_approvals`,
  `cost_ledger_entries`, and four new `source_evidence` columns (`source_family`, `claim_origin`,
  `last_verified_at`, `pre_send_verified_at`). No existing table/column was altered or dropped.
- **New source:** `src/campaign-activation.mjs`, `src/contact-routes.mjs`,
  `src/reserved-domains.mjs`, `src/evidence-independence.mjs`, `src/send-eligibility.mjs`,
  `src/dispatch-adapter.mjs`, `src/opportunity-hunter.mjs`, `src/prospect-supply.mjs`,
  `src/portfolio-allocator.mjs`, `src/reply-classifier.mjs`, `src/autonomous-cycle.mjs`,
  `src/canon-registries.mjs`, `src/research-seed.mjs`.
- **Modified source:** `src/store.mjs` (two new collections + `reserveCostBudget`, both backends),
  `src/config.mjs` (`acquisition.*` config block + a production-safety check),
  `src/commercial-intelligence-import.mjs` (one-line `date`/`at` parameter-name bug fix — see the
  disposition doc's "Bonus defect" section).
- **New data:** `data/canon/MANIFEST.json`, `data/canon/registries/*.json` (6 files),
  `data/canon/research-seed/UBERBOND_IMPORT.json` — all hash-verified against their source archives.
- **New tests:** 12 new test files (`tests/campaign-activation.test.mjs` through
  `tests/canon-seven-day-simulation.test.mjs`), plus one added case in
  `tests/dispatch-adapter.test.mjs` for the P0-004 concurrency acceptance test.
- **Docs:** `CLAUDE.md` (new), `docs/PREMERGE_AUDIT_DISPOSITION.md` (new), this file (new),
  `ENVIRONMENT_VARIABLES.md` (new `Canon/V3 acquisition cycle` section), `package.json` (new files
  added to `check:syntax`/`test:deterministic`).
- **`lite/`: zero diff** (`git diff --exit-code <base>..HEAD -- lite/` is empty).

## Test evidence

```
npm run check         # syntax + full deterministic suite: 281/281 pass, 0 regressions
npm run test:browser   # pre-existing, disclosed Playwright-binary limitation (unrelated to this diff)
git diff --exit-code 27cd700e7d27287382c9f5e1811ae704f4f1535e..HEAD -- lite/   # empty
```

12 new test files, 69 new test cases (including subtests), covering every P0 acceptance test named in
`PREMERGE_FINDINGS.json` verbatim (see `docs/PREMERGE_AUDIT_DISPOSITION.md` for the exact mapping),
plus a seven-simulated-day end-to-end run (`tests/canon-seven-day-simulation.test.mjs`) proving in
one pass: zero duplicate recipients across the week, exactly one reply sweep per day, bounded
infrastructure cost, a complete audit trail for every stage every day, research seeds never
touching the live store, and a global kill switch blocking dispatch immediately.

## Zero-write preview / zero-send proof

- `commercial-intelligence-import.mjs`'s preview mode is unchanged by this branch — still zero
  writes, including its own audit trail.
- Every dispatch outcome in every test is either `blocked` (no live provider configured) or
  `simulated_sent` (explicit simulation) — no test, and no code path added in this branch, ever
  produces a real `sent` outbound event. `ACQUISITION_WORKERS_ACTIVE` defaults `false` and
  `ACQUISITION_TARGET_DAILY_SENDS` defaults `0`, so Canon reservations are blocked by configuration
  even before reaching that check.

## Known limitations

See `CLAUDE.md`'s "Known limitations" section and `docs/PREMERGE_AUDIT_DISPOSITION.md`'s deferred
P1 entries (P1-005, P1-006, P1-007, P1-011, P1-012) for the complete list — each has an explicit
fail-closed blocker documented so closing one is additive work, not new safety analysis.

The single largest limitation: every opportunity-hunter/prospect-discovery/reply-sweep adapter is
disabled by default in this sandbox (no live hiring-board, procurement, marketplace, or Gmail
credentials were available here). Every adapter fails closed (zero signals, a `*-blocked-no-adapter`
audit event) rather than fabricating data — see the module doc-comments in
`src/opportunity-hunter.mjs` and `src/autonomous-cycle.mjs`.

## Rollback instructions

This is a purely additive change: one new migration, new modules, and one one-line bug fix in an
existing file. To roll back:

1. Revert this PR's commit(s) (`git revert` or drop the branch — nothing outside it depends on
   these new modules yet).
2. If migration `008_canon_v3_integration.sql` was already applied to a live database and needs
   reverting: `DROP TABLE IF EXISTS campaign_activation_approvals, cost_ledger_entries;` and
   `ALTER TABLE source_evidence DROP COLUMN IF EXISTS source_family, DROP COLUMN IF EXISTS
   claim_origin, DROP COLUMN IF EXISTS last_verified_at, DROP COLUMN IF EXISTS
   pre_send_verified_at;` (remove the corresponding row from `schema_migrations` if you want
   `db:migrate` to re-run it later).
3. No `ACQUISITION_*` environment variable needs to be set or unset to disable this — every one of
   them already defaults to off/zero.
