# OMNIA V9 Branch Reconciliation

## Finding

Before choosing a reconciliation strategy, the actual git topology was checked with `git merge-base --is-ancestor` for every per-stage V9 branch against `agent/omnia-v9-closure`:

| Branch | Stage | Ancestor of `agent/omnia-v9-closure`? |
|---|---|---|
| `agent/omnia-v9-admission-kernel` | P0 | yes |
| `agent/omnia-v9-proof-store` | P1 | yes |
| `agent/omnia-v9-canonical-constitution` | P2 | yes |
| `agent/omnia-v9-cedar-policy` | P3 | yes |
| `agent/omnia-v9-outbound-final-shadow` | P4 | yes |
| `agent/omnia-v9-execution-receipts` | P5 | yes |
| `agent/omnia-v9-receipt-uniqueness` | P6 | yes |
| `agent/omnia-v9-authorization-bound-receipts` | P7 | yes |
| `agent/omnia-v9-pre-effect-authority-reconciliation` | P8 | yes |
| `agent/omnia-v9-authority-transition-ledger` | P9 | yes |
| `agent/omnia-v9-closure` | closure | (itself) |

**Every per-stage branch is already a linear ancestor of `agent/omnia-v9-closure`.** The P0→P9 stack was built sequentially, each stage branching from and merging cleanly into the next, with no divergent history to reconcile and no duplicate commits to squash. `claude/omnia-v9-closure-verify-1iuar2` (the two closure-verification passes' working branch) was created directly from `agent/omnia-v9-closure` and carries that same linear history forward.

## Decision

**Option B applies as-is: no reconciliation surgery is needed.** The existing history is already the clean, canonical path:

```
agent/omnia-v9-admission-kernel (P0)
  -> agent/omnia-v9-proof-store (P1)
    -> agent/omnia-v9-canonical-constitution (P2)
      -> agent/omnia-v9-cedar-policy (P3)
        -> agent/omnia-v9-outbound-final-shadow (P4)
          -> agent/omnia-v9-execution-receipts (P5)
            -> agent/omnia-v9-receipt-uniqueness (P6)
              -> agent/omnia-v9-authorization-bound-receipts (P7)
                -> agent/omnia-v9-pre-effect-authority-reconciliation (P8)
                  -> agent/omnia-v9-authority-transition-ledger (P9)
                    -> agent/omnia-v9-closure (closure integration)
                      -> claude/omnia-v9-closure-verify-1iuar2 (two independent closure-verification passes: defect fixes, mutation testing, real-Postgres/Cedar re-verification)
                        -> product/omnia-v9-real-integration (this mission)
```

## Canonical branch for this mission

`product/omnia-v9-real-integration`, forked from `claude/omnia-v9-closure-verify-1iuar2` at commit `5dc1b082a3f8b8a9d437680021e87bb115673913` (the second closure pass's final evidence commit — see [`OMNIA_V9_FROZEN_BASELINE.md`](./OMNIA_V9_FROZEN_BASELINE.md)).

## Superseded / intermediate branches

None of the P0–P9 stage branches are superseded in the sense of containing abandoned work — each is a real, linear step in the history that's still reachable and still part of the canonical line. They are not merge targets going forward; `claude/omnia-v9-closure-verify-1iuar2` is the single canonical upstream for any future V9 kernel work, and `product/omnia-v9-real-integration` (this branch) is the canonical upstream for integration work. No branches were deleted, rewritten, or force-pushed as part of this reconciliation — there was nothing to clean up.

## What this means for future work

Because the history is already linear and clean, future V9 kernel changes should branch from `claude/omnia-v9-closure-verify-1iuar2` (or its eventual PR merge target), and future integration changes should branch from `product/omnia-v9-real-integration` (or its eventual PR merge target). Neither branch should be rebased or squashed retroactively — the commit-by-commit record of what was verified, when, and why is itself part of the evidence trail this project depends on.
