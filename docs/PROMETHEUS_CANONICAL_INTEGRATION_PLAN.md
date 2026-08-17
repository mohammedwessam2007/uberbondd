# Prometheus Canonical Integration Plan

Companion to `docs/PROMETHEUS_BRANCH_RECONCILIATION.md` (read that first for
the evidence). This document is the action plan: what to actually do about
the two large stranded lineages, in what order, and what stays untouched.

## The core decision this plan cannot make for the owner

Both stranded lineages (OMNIA V9 on PRs #8–#24, Canon/V3 on PR #7) are
real, independently-verified, tested code — not abandoned experiments. But
integrating either means retiring parts of what this session already built
and shipped on `main`'s side of history (the Deliverability Guard, payment
truth classifier, reservation recovery — all live on PR #26 right now).
That's a direction call for the owner, not something to infer from code
quality alone. This plan is written as **two branches of instructions**,
one per answer, so whichever way it's decided, the next session has a
concrete starting point instead of another reconciliation pass.

## If V9's formal kernel is chosen as canonical

1. Rebase `agent/omnia-v9-closure` (or the PR #24 tip) onto the current
   `main`, not the other way around — V9's `src/omnia-v9/` tree is
   self-contained per the reconciliation's diffstat read and didn't show
   imports from `canon-v3`-only files.
2. Re-run `npm run check:syntax` + `npm run test:deterministic` on the
   rebased result before touching anything else — confirm the 500/459/41
   figure still holds after rebase, don't assume it.
3. Migrate this branch's `evaluateDeliverabilityGuard()` call sites in
   `src/pipeline.mjs` to call through V9's kernel/pre-effect-authority
   reconciler instead. This is a real rewrite, not a drop-in — the two
   have different input/output shapes (receipts vs. `ActionIntent`
   records).
4. Retire `src/deliverability-guard.mjs` and its dedicated test files only
   after the V9-routed pipeline passes the exact same hostile-test
   scenarios that currently cover the Guard (replay, stale reservation,
   crash recovery, workspace isolation) — port those test *cases*, not
   just the test *count*.
5. Decide the fate of `src/payments.mjs`'s `classifyPaymentEvent()` (this
   session, Wave 5) against V9's `FINANCIAL` effect class handling —
   these were never compared directly this wave; that comparison is a
   prerequisite, not something to guess at now.
6. Run the V9 branch's own real-Postgres suite
   (`scripts/run-v9-postgres-tests.mjs`) against a fresh throwaway database
   using the same local-Postgres-server pattern this wave proved out for
   `PostgresStore` (`service postgresql start`, a dedicated role/database) —
   independently re-verify the claimed 106/106, don't just trust the PR.

## If the current lighter Guard stays canonical

1. Do not merge PR #24 or PR #7 as-is. Their value becomes reference
   material — specific mechanisms worth mining individually
   (`pre-effect-authority-reconciler.mjs`'s stale-authority handling,
   `revenue-os.mjs`'s `OWNER_GATE_TYPES` enum as a possible input to this
   session's founder-command-center action queue) without inheriting the
   full kernel's complexity.
2. Close or explicitly mark PRs #8–#23 (the intermediate V9 stack
   checkpoints) as superseded-by-#24 rather than leaving 17 separate open
   drafts representing the same lineage — that's an owner action (closing
   PRs), not something this session should do unilaterally.
3. Rename this wave's `src/opportunity-registry.mjs` only if V9's
   `opportunity-factory.mjs` is ever pulled in for its solicited-application
   logic specifically (unlikely to be needed by the current self-serve
   wedge, which has no solicited-application flow).
4. Revisit canon-v3's `autonomous-cycle.mjs` staged-job acquisition model
   only if/when outbound is ever authorized to go live — it solves a real
   problem (durable multi-stage acquisition orchestration) that the current
   simpler `Pipeline.maybeSend` doesn't need yet because outbound stays
   structurally disabled.

## What this plan explicitly does NOT recommend

- Merging both stacks together. They were built independently against
  different base states and touch the same core files
  (`store.mjs`, `pipeline.mjs`, `send-safety.mjs`); a combined merge would
  need its own dedicated conflict-resolution wave, not an incidental one.
- Silently picking a side. The reconciliation found both lineages
  genuinely tested and real — this is an architecture/ambition call for
  the owner (formal Cedar-policy kernel vs. lighter purpose-built guard),
  not a correctness call this session can resolve from evidence alone.
- Closing any of the 26 open PRs. That's the owner's call to make, this
  session only surfaces the recommendation.

## Immediate next step (safe regardless of which branch is chosen)

Close the 17-PR-deep stack visually for the owner: PRs #9–#23 are each one
incremental commit in the same lineage as #24 (confirmed via their base/head
chain — each PR's base is the prior PR's exact head SHA). Whoever decides
V9's fate only needs to look at #24 (the cumulative tip) and #7, not review
17 intermediate PRs individually.
