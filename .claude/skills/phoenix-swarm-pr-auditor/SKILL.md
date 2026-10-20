---
name: phoenix-swarm-pr-auditor
description: Inspect a bounded set of UberBond GitHub PRs through the connected Chat On Steroids Core terminal to detect overlapping paths, generated canon conflicts and stale PR readbacks without merging or suppressing donor work.
---

# PHOENIX multi-agent PR collision review

Run from the approved UberBond repository using `@Chat On Steroids Core`:

```sh
node scripts/phoenix-swarm-pr-overlap.mjs --prs 1513,1512,1508,1507,1501,1498
```

The read-only command fetches remote `main` SHA, each PR's current head/base, paginated changed paths and refreshed head/base. It refuses mutable reads and malformed/unbounded input. It distinguishes **substantive source overlaps** from **generated canon overlap** and never concludes semantic duplication from names/paths alone. Run it on the actual active PR numbers, not automatically on historical examples. No repository mutation, review submission, external paid provider call, deployment, email, secret export, or new permission is part of this skill.

Use the actual PR diff and source ancestry to judge donor equivalence or supersession, and preserve all unique capabilities and lineage. For generated-only collisions, run `npm run readiness` *after* safely combining sources into a dedicated isolated worktree. Never overwrite the dirty root or another agent's branch. Re-run after any main/head update. `autoMergeAllowed:false` and `autoCloseAllowed:false` are permanent output invariants.

Run local adversarial tests with `node --test tests/phoenix-swarm-pr-overlap.test.mjs`. The PHOENIX receipt in `docs/receipts/PHOENIX_SWARM_PR_OVERLAP_REVIEW_20261020.md` is a historical observation, not evergreen clearance.
