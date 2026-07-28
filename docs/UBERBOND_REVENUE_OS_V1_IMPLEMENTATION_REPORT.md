# UberBond Revenue OS V1 Implementation Report

Branch: `claude/uberbond-full-automation-841k2f`, based on `main` at `ba2b100` (the same
`base_commit_observed` the code tranche's own `MANIFEST.json` recorded). Produced per
`NESTED_INPUTS/UBERBOND_REVENUE_OS_V1_CODE_TRANCHE/CLAUDE_CODE_EXECUTE.md`'s step 9.

## What was applied from the tranche

- `migrations/005_revenue_os_control_plane.sql` (with one fix, see "Repairs" below)
- `src/revenue-os.mjs` (applied unmodified -- its own 7-test file passed as-is, no changes needed)
- `tests/revenue-os.test.mjs` (applied unmodified)
- `docs/REVENUE_OS_V1.md` (applied unmodified)
- `PATCHES/src-store.mjs.patch` -- applied by hand (the patch has no line-numbered hunks, so it was
  applied via direct edits matching its context, not `git apply`), plus one additional consistency
  fix (see "Repairs")
- `PATCHES/package.json.patch` -- applied by hand, same reason

## Repairs made to the tranche (not merely "applied as-is")

1. **`message_variants_identity_unique` did not actually prevent duplicates when `campaign_id`
   and `experiment_id` are both NULL.** Postgres unique indexes treat every NULL as distinct from
   every other NULL, so the tranche's plain `UNIQUE INDEX ON message_variants(campaign_id,
   experiment_id, body_hash)` never fires for two rows that are both unassigned to a campaign/
   experiment -- exactly the state an early, not-yet-scheduled message variant is in. Found by
   writing a hostile duplicate-insert test (see `tests/postgres-schema.test.mjs`) and watching it
   fail against the tranche's own migration, unmodified. Fixed by wrapping the two nullable
   columns in `COALESCE(..., '')` so NULL collapses to one comparable value; documented inline in
   the migration.
2. **`src/store.mjs`'s `JsonStore.init()` hardcoded `version: 5`** when loading an existing
   `db.json`, even after the tranche's own patch bumped `EMPTY.version` to `6`. Not functionally
   load-bearing (nothing else in the codebase reads this field), but a real inconsistency the
   version bump introduced; fixed to `6` for consistency rather than left as a latent trap for
   whoever reads it next.
3. Both `package.json`'s `check:syntax` and `test:deterministic` scripts were extended to also
   cover the three new files this session added beyond the tranche itself (see below), not just
   the tranche's own `src/revenue-os.mjs`.

## Built beyond the tranche (mission steps 3-8, not part of the applied code tranche)

- `src/commercial-intelligence-import.mjs` -- validates JSONL/CSV batches against
  `04_COMMERCIAL_INTELLIGENCE_SCHEMA.json`'s exact contract (hand-written, matching this repo's
  existing validator style), normalizes domains/contacts, computes idempotency keys via
  `revenue-os.mjs#opportunityIdempotencyKey`, rejects duplicates (idempotency-key pre-check plus
  the migration's own unique constraint as the authoritative guard) and stale evidence, stores
  versioned policy decisions, and creates owner gates **only** for `record_type:'owner_gate'`
  records -- never for a plain opportunity, however large. Has no send capability of any kind.
- `scripts/import-commercial-intelligence.mjs` -- CLI entry point (`--file`, `--format`,
  `--database-url`/JSON-store fallback, `--report`).
- `scripts/dry-run-revenue-os.mjs` -- the mission's required dry run: imports three authorized,
  clearly synthetic (`.invalid`-domain, RFC 2606 reserved) fixture opportunities, stores evidence,
  scores each, records policy pass/reject with real reason codes, and creates exactly one owner
  gate (for the one fixture whose pursuit needs a binding marketplace submission -- the other two
  never get a gate). Exported as `runRevenueOsDryRun` so it is exercised directly by
  `tests/dry-run-revenue-os.test.mjs` in CI, not only as a manual script.

## Known limitation, disclosed rather than hidden

`04_COMMERCIAL_INTELLIGENCE_SCHEMA.json` names 6 `record_type`s (`opportunity`, `partner_route`,
`offer`, `message_variant`, `rejection`, `owner_gate`). The applied migration only added tables
for the record shapes this mission's own "Build" list named explicitly (source evidence,
opportunities, policy decisions, experiments, message variants, owner gates) -- there is no
dedicated table for `partner_route`, `offer`, or `rejection`. This importer still fully schema-
validates all 6 types; the three without a dedicated table are counted as `partiallyPersisted` and
written to the existing generic `auditLog` collection so nothing is silently dropped, but they do
not yet get their own queryable table. Extending the migration to add them is the next concrete,
scoped follow-up.

## Test results (all run independently this session)

```
$ npm run check:syntax                # clean, no errors
$ npm run test:deterministic          # 131 pass, 0 fail
$ node --test tests/postgres-schema.test.mjs   # 10 pass, 0 fail (includes 3 new tests
                                                  for migration 005, one of which caught
                                                  the message_variants bug above)
```

`npm run test:browser` could not be verified in this sandbox: Playwright is pinned to a browser
revision (`chromium_headless_shell-1228`) that this container's pre-installed browser cache does
not have (`chromium_headless_shell-1194` is what's actually present). Reproduced on a completely
clean `main` checkout with none of this session's changes applied (`git stash` + re-run) -- this
is a pre-existing sandbox limitation, not a regression introduced here, and it is unrelated to
Revenue OS V2 (the failing test is `src/browser-crawler.mjs`'s own crawler, untouched this
session). The repository's real CI (`.github/workflows/ci.yml`) runs `npx playwright install
--with-deps chromium` before this test, which provisions the exact pinned revision -- so this
should not reproduce there. Flagged here explicitly rather than claimed as passing.

## Brutal 10/10 Scorecard -- honest per-row status (per the tranche's own scorecard doctrine:
"never round a 9.4 to 10")

| Category | Status this pass |
|---|---|
| Data persistence | Real: every fixture opportunity, evidence item, and policy decision is a canonical, queryable store record (proven by the dry-run tests reading them back). |
| Idempotency | Real: duplicate opportunity imports and duplicate message variants are proven rejected by test; a second full dry-run run creates zero duplicate rows. |
| Policy | Real: every policy decision (pass or reject) carries versioned, deterministic reason codes, proven for both outcomes. |
| Source quality | Not measured -- no real evidence has been gathered yet; only synthetic fixtures exist. |
| Deliverability, Outreach quality, Conversion, Revenue, Margin, Retention | **Not applicable this pass.** Outbound is disabled and there is no send capability anywhere in the code added this session -- these rows require real sends and real payments, neither of which this mission performed or was asked to perform. |
| Analytics | Partial: opportunities join to source evidence and policy decisions; full source/lane/offer/variant/action revenue attribution (the mission's "Dashboard" section) was not built this pass -- out of scope for this narrow tranche-application mission. |
| Owner leverage | Real for what exists: exactly one owner gate was created across three fixtures, proving gates are not created reflexively. |
| Delivery, Security, Recovery | Not evaluated this pass -- no real delivery, no incident drills performed. |

10/10 readiness remains **false**, correctly -- `revenue-os.mjs#tenOfTenReadiness` requires real
commercial evidence (paid pilots, collected revenue, positive reply rate) that does not exist yet.

## Next highest-leverage fix

Add dedicated `partner_route`, `offer`, and `rejection` persistence (a small follow-on migration +
three more branches in `importCommercialIntelligenceBatch`), so a full ChatGPT Work commercial-
intelligence batch can be imported with zero `partiallyPersisted` records -- this is the one
concrete gap between what this pass built and what `07_CLAUDE_CODE_MERGE_MISSION.md`'s "validate
all JSONL... import in dry-run mode" step will need once a real batch arrives.
