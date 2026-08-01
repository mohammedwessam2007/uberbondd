# CLAUDE.md

Guidance for a Claude Code session picking up work on this repository, so context does not have to
be reconstructed from scratch. Read this before touching anything under `src/`, `migrations/`, or
`lite/`.

## Canon rules (do not violate these)

1. **Live outbound is disabled by default and stays that way.** `OUTBOUND_ENABLED` (pre-Canon
   pipeline) and `ACQUISITION_WORKERS_ACTIVE` (Canon cycle, see below) both default to `false`.
   Never flip either default in code; activation is an operator/owner decision made via
   environment configuration, never a code change.
2. **`lite/` is a separate, untouched application.** Verify with
   `git diff --exit-code <base>..HEAD -- lite/` before every commit that touches this repo. If that
   command produces any output, you have broken this rule.
3. **Historical/research-seed prospects and opportunities are never sendable.** Research data
   (`data/canon/research-seed/UBERBOND_IMPORT.json`) is read-only reference data
   (`src/research-seed.mjs`) with no write path into the live store at all — it becomes real only
   once grounded in one specific company through the normal
   `commercial-intelligence-import.mjs` pipeline.
4. **No process-local state is ever the authority for a durable guarantee.** Deduplication,
   reservations, cost ceilings, and campaign activation are all backed by a real store-level
   unique constraint, atomic reservation, or explicit approval row — never a JS `Set`/`Map` a
   worker could lose on restart.
5. **A missing live provider fails closed, never silently.** `dispatch-adapter.mjs` produces a
   `blocked` result with a canonical audit event when no real send provider is configured — it
   never fabricates a `sent` event. Simulation results are always the distinctly-named
   `simulated_sent`, never `sent`.
6. **One store, one opportunity table, one prospect table, one audit system.** Do not create a
   second store/queue/prospect model/policy registry to solve a Canon-specific problem — extend
   the existing `src/store.mjs` collections and migrations instead (see `Protected paths` below for
   what "extend" is allowed to touch).

## Architecture

This repo has three layers:

- **Pre-Canon pipeline** (`server.mjs`, `worker.mjs`, `src/pipeline.mjs`, `src/revenue.mjs`,
  `src/discovery.mjs`, ...): the original single-prospect outreach engine (audit report, propose,
  send, follow up). Untouched by the Canon/V3 integration except for one one-line bug fix (see
  `docs/PREMERGE_AUDIT_DISPOSITION.md`'s "Bonus defect" section).
- **Revenue OS v1/v2** (`src/revenue-os.mjs`, `src/commercial-intelligence-import.mjs`,
  `src/policy-reason-codes.mjs`, migrations `005`-`007`): PR #6's control plane — source evidence,
  opportunities, policy decisions, experiments, message variants, owner gates, partner
  routes/offers/rejections. This is the durable commercial truth every layer above and below reads
  and writes; see `docs/REVENUE_OS_V1.md`.
- **Canon/V3 integration** (this branch — `src/autonomous-cycle.mjs`,
  `src/opportunity-hunter.mjs`, `src/prospect-supply.mjs`, `src/portfolio-allocator.mjs`,
  `src/send-eligibility.mjs`, `src/dispatch-adapter.mjs`, `src/campaign-activation.mjs`,
  `src/reply-classifier.mjs`, `src/reserved-domains.mjs`, `src/contact-routes.mjs`,
  `src/evidence-independence.mjs`, `src/canon-registries.mjs`, `src/research-seed.mjs`, migration
  `008`): a durable staged-job orchestration layer built entirely on top of Revenue OS's tables via
  the existing `DurableQueue` — it adds zero new store/queue/audit *mechanisms*, only new job
  types, collections, and pure decision functions. Full disposition of every premerge-audit finding:
  `docs/PREMERGE_AUDIT_DISPOSITION.md`.

### Canon cycle stages (`src/autonomous-cycle.mjs`)

```
opportunity_hunt → prospect_discovery → send_planning → dispatch → reply_sweep → attribution → checkpoint
```

Each is a `DurableQueue` job type (`CANON_JOB_TYPES`), scheduled once per day
(`scheduleCanonCycle`) except `reply_sweep`, which self-gates to once per 24h via the
`canonLastReplySweepAt` durable setting regardless of how often its job runs. Every stage is
idempotent/resumable by construction — see `docs/PREMERGE_AUDIT_DISPOSITION.md`'s P0-001 entry for
why that's true without any new leasing code.

### Known limitations (disclosed, not hidden)

- `src/opportunity-hunter.mjs`'s six adapters (`officialReleases`, `publicHiring`,
  `procurementRfp`, `marketplaces`, `partnerVendorFreelancer`, `launchesMigrations`) and
  `autonomous-cycle.mjs`'s `prospectDiscovery`/`replySweep` adapters all default to **disabled** —
  this sandbox has no live hiring-board/procurement/marketplace/Gmail credentials. They fail closed
  (zero signals, a `*-blocked-no-adapter` audit event) rather than fabricating data. A real
  deployment supplies real adapter functions.
- Business-hours enforcement (P1-007), per-source-family circuit breakers (P1-006), same-day
  pre-send evidence re-verification (P1-005), a frozen 100-org experiment cohort (P1-011), and a
  message-quality/claim-validation module (P1-012) are deferred with fail-closed blockers — see
  `docs/PREMERGE_AUDIT_DISPOSITION.md` for exactly what still gates each one in the meantime.
- A real LLM-extraction adapter (mission: "Use LLM APIs only for extraction and bounded commercial
  reasoning") must call `store.reserveCostBudget(dateKey, 'model', costCents,
  cfg.acquisition.dailyModelCostCeilingCents)` before making its call — no code path in this
  integration currently makes an LLM call, so nothing does this yet.

## Protected paths

- `lite/` — never modify. Verify with the git diff command in rule 2 above.
- `migrations/*.sql` that are already applied (001-008 as of this branch) — never edit in place;
  add a new migration file instead.
- `src/store.mjs`'s `COLLECTIONS`/`MAP`/`EMPTY` — extend by adding new entries, never remove or
  rename an existing collection or column mapping (breaks both backends' data in place).
- `docs/canon` registries (`data/canon/registries/*.json`, `data/canon/research-seed/*.json`) are
  versioned data contracts — if you must edit one, update its sha256 in `data/canon/MANIFEST.json`
  in the same commit (`src/canon-registries.mjs` refuses to load a drifted file).

## Standard commands

```
npm install
npm run check           # syntax check (all src/lite/scripts files) + full deterministic test suite
npm run test:deterministic   # the suite alone
npm run test:browser    # Playwright-dependent; environment-only failure disclosed above
npm run db:migrate      # apply pending migrations against DATABASE_URL
```

## Test sequence for a Canon/Revenue-OS change

1. `node --check <changed files>`
2. `npm run test:deterministic` (or the specific new/changed test file first, then the full suite)
3. `git diff --exit-code <base>..HEAD -- lite/` — must be empty
4. If you touched `migrations/`, confirm `tests/postgres-schema.test.mjs` still passes (it runs
   real Postgres — PGlite — migrations, not JSON-store mocks)

## Base and handoff

- This integration branch is built from **PR #6 head `27cd700e7d27287382c9f5e1811ae704f4f1535e`**
  (`claude/uberbond-full-automation-841k2f`), base `main` at `ba2b100ac57b7cf0fd84532f6ea6770c6ebeed8a`.
- Full finding-by-finding disposition: `docs/PREMERGE_AUDIT_DISPOSITION.md`.
- To continue this work: read the "Known limitations" section above first — every deferred item
  already has its fail-closed blocker identified, so closing one is additive (implement the real
  behavior, then remove the blocker's now-redundant restriction) rather than requiring new safety
  analysis from scratch.
