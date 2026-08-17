# Prometheus Branch Reconciliation

## Scope and method (read this first)

This is a **bounded** reconciliation, not a line-by-line audit of every open
PR. The repository has 26 open draft PRs (#1–#26) representing a huge amount
of prior work — two of the largest bodies alone total ~50,000 added lines.
Auditing all of it exhaustively in one session isn't honest to attempt or
useful to read. What this document actually did, with real evidence for
each claim:

1. Listed every open PR and branch via the GitHub API (not assumed).
2. Identified the two largest, most relevant stranded lineages per the
   mission's own callouts — the OMNIA V9 chain (PRs #8–#24, stacked) and the
   Canon/V3 commercial-activation chain (PRs #6–#7) — and fetched their tip
   branches into local git worktrees.
3. **Independently re-ran** `npm run check:syntax` and `npm run
   test:deterministic` on both tip branches myself, rather than trusting
   their PR descriptions' claimed numbers.
4. Sampled specific files whose names suggested overlap with code already
   built on the current branch this session, to check for real duplication
   vs. naming collision.
5. Did **not** read every file, did not run the V9 branch's real-Postgres
   test suite (`npm run check:v9:postgres`, which needs its own database
   setup distinct from what this wave built), and did not review the other
   ~20 open PRs (#1–#5, #9–#23 individually — most are checkpoints along the
   same V9 stack, not independent bodies of work).

## What exists: two large, independently-verified, unmerged lineages

### Lineage A — OMNIA V9 (PRs #8 through #24, stacked)

**Tip: `claude/from-v9-complete-build-2026-08-10` (PR #24), diffed against
`main`: 197 files changed, +29,060 / −80.**

PR #24's own description claims: `npm run check` → 500 total / 459 passed /
41 real-PostgreSQL-gated / 0 failed; a separate real-Postgres run
(`OMNIA_V9_TEST_DATABASE_URL`) → 106/106 passed.

**Independently verified this wave**: checked out the branch into a
worktree, ran `npm ci`, `npm run check:syntax` (clean, exit 0 across ~100
files including `src/omnia-v9/*`), and `npm run test:deterministic`
myself: **500 total / 459 passed / 41 skipped / 0 failed** — exactly
matching the PR's own claim. The 41 skipped are the real-Postgres-gated
ones; I did not attempt to independently reproduce those against a fresh
database this wave (out of scope — the branch's harness is
`scripts/run-v9-postgres-tests.mjs`, a different mechanism from this wave's
`tests/postgres-store-live.test.mjs`).

**What it is**: a formal, closed-schema authorization kernel
(`src/omnia-v9/kernel.mjs`, `schema.mjs`, `proof-store.mjs`,
`policy-bundle.mjs`, `pre-effect-authority-reconciler.mjs`,
`authority-transition-ledger.mjs`, plus a `cedar-adapter.mjs` for Cedar
policy evaluation) built around explicit `ActionIntent` / `EvidenceRecord`
/ `ExecutionReceipt` records, each with a computed digest, closed enums
(`effectClass` ∈ `WRITE_INTERNAL | COMMUNICATE_EXTERNAL |
PRODUCTION_MUTATION | DATA_EXPORT | CREDENTIAL_USE | FINANCIAL |
LEGAL_COMMITMENT | PHYSICAL_EFFECT | PROFESSIONAL_AUTHORITY`), and a large
`integrations/` directory wiring it to Gmail dispatch, external-effect
state machines, and a real-Postgres proof store. It also carries
`src/opportunity-factory.mjs` (795 lines) and `src/outreach-governance.mjs`
— a solicited-opportunity compiler for gig/RFP/job-style applications (see
below) and outreach routing/dedupe governance.

**This is the real "OMNIA V9" the Prometheus mission assumed already
governs UberBond.** It does not exist on `main` or on this session's branch
— it exists, tested, on this unmerged stack.

### Lineage B — Canon/V3 commercial activation (PR #7, on top of PR #6)

**Tip: `claude/canon-v3-commercial-activation` (PR #7), diffed against
`main`: 65 files changed, +21,502 / −12.**

PR #7's own description claims: `npm run check` → 317/317, 0 regressions.

**Independently verified this wave**: same procedure — `npm ci`, syntax
check clean, `npm run test:deterministic` myself: **317/317 passed, 0
failed** — matching the PR's claim exactly.

**What it is**: a durable staged-job autonomous acquisition cycle
(`src/autonomous-cycle.mjs`: opportunity hunt → prospect discovery → send
planning → dispatch → reply sweep → attribution → checkpoint, built on the
existing `DurableQueue`), canonical send eligibility
(`src/send-eligibility.mjs`), fail-closed dispatch
(`src/dispatch-adapter.mjs`), campaign activation approvals + frozen cohort
membership (`src/campaign-activation.mjs`), a cost ledger, a portfolio
allocator, six governance registries under `data/canon/`, and
`src/revenue-os.mjs` — a service-lane catalog (15 defined service lanes)
plus an `OWNER_GATE_TYPES` enum for consequential-action categories. This
is a policy/catalog layer, **not** a revenue/payment engine — see the
naming-collision note below.

## Naming collisions vs. real duplication (checked, not assumed)

Two file names on these branches strongly suggested overlap with code
already built on this session's branch. I read both to check:

| This branch's file | Stranded branch's similarly-named file | Actually the same thing? |
|---|---|---|
| `src/opportunity-registry.mjs` (this wave — a business-model/opportunity **scoring** engine: Business Genome + Money Model Tournament) | `src/opportunity-factory.mjs` (V9 branch — a solicited-opportunity **compiler** for gig/RFP/job/contractor applications: submission mechanisms, requirement matching like `MIN_RELEVANT_YEARS`/`RESIDENCE_COUNTRY`, decision states like `BLOCKED_PRIOR_CONTACT`) | **No.** Same word, different domain. One scores candidate business models; the other decides whether to apply to a specific solicited opportunity. No functional overlap found in the code sampled. Real risk: future confusion from the name alone — recommend renaming one if both are ever active on the same branch. |
| `src/revenue.mjs` → `RevenueEngine` (this branch — lead creation, Lemon Squeezy webhook handling, payment classification, report unlock, monitoring subscriptions) | `src/revenue-os.mjs` (canon-v3 branch — a static service-lane catalog + owner-gate-type enum) | **No.** `revenue-os.mjs` is closer to a policy/catalog module than an engine; it doesn't handle payments, webhooks, or leads in the code sampled. Real risk: same naming-collision issue as above.

## Genuine overlap that *does* exist (not just naming)

This session's Waves 3–6 (Deliverability Guard, payment-truth classifier,
reservation recovery, this wave's PostgresStore proof) were built **on top
of `main` directly**, with no knowledge that Lineage A's formal admission
kernel already existed on an unmerged branch. The overlap is in *purpose*,
not file names:

- `src/deliverability-guard.mjs` (this branch, ~300 lines, admits/denies a
  single outbound-send action) and `src/omnia-v9/kernel.mjs` +
  `pre-effect-authority-reconciler.mjs` (V9 branch, ~1,000+ lines across
  several files, a general-purpose closed-schema authorization kernel for
  *any* consequential action, not just sends) solve the same class of
  problem — "should this consequential action be allowed?" — at very
  different levels of generality and maturity.
- `src/pipeline.mjs`'s `maybeSend` (this branch) and
  `src/autonomous-cycle.mjs` + `src/dispatch-adapter.mjs` (canon-v3 branch)
  both implement outbound-send orchestration with different staging models.

This is a real instance of the "parallel truth system" the mission's own
Critical Architectural Law warns against — it already happened, across
sessions, before this reconciliation surfaced it. It was not created by
this wave; this wave's Guard/payment-truth/reservation-recovery work is
smaller in scope and was built to the current wedge's actual needs, not as
a deliberate alternative to V9.

## Recommendation: do not merge blindly (per the mission's own instruction)

I did not attempt an integration this wave — the combined ~50,000 lines
across two independently-evolved architectures is real engineering work
requiring an owner decision on direction, not something to fold in
silently. Specific, evidence-based recommendations:

1. **Owner decision needed first**: does the V9 formal-kernel model
   (Cedar policy, digest-signed records, closed schemas) become the
   canonical admission layer going forward — in which case this session's
   lighter Deliverability Guard should be *retired in favor of it*, not
   merged alongside it — or does the current wedge's simpler, already-live
   Guard remain sufficient, in which case V9's kernel is a
   over-engineered-for-now asset to shelve rather than integrate? Both are
   legitimate answers; this reconciliation surfaces the choice, it doesn't
   make it.
2. **Do not merge both PR #7 and PR #24 stacks as-is**: they were built
   independently against different base states and will conflict
   extensively with each other and with this branch's Wave 3–6 work
   (`store.mjs`, `pipeline.mjs`, `send-safety.mjs` are touched by all
   three).
3. **Cherry-pick candidates, if V9 is chosen as canonical**: `src/omnia-v9/`
   (self-contained, no imports from `autonomous-cycle.mjs`),
   `outreach-governance.mjs`. These have their own dedicated test files and
   didn't show entanglement with canon-v3's cohort/attribution machinery in
   the diffstat.
4. **Sequencing if pursued**: V9 kernel and store first (it's more
   self-contained and independently tested against real Postgres per its
   own PR), then re-evaluate whether canon-v3's acquisition cycle is still
   wanted given this session's simpler Deliverability-Guard-gated pipeline
   already covers the safety-critical part of the same job.
5. **This wave's `src/opportunity-registry.mjs` should keep its name** —
   the collision with `opportunity-factory.mjs` is real but shallow (see
   table above); renaming is cheap if both are ever merged together.

Full sequencing detail is in `docs/PROMETHEUS_CANONICAL_INTEGRATION_PLAN.md`.
