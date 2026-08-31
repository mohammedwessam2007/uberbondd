# Task Observer environments and activation

Adapted from Eoghan Henn / rebelytics.com, CC BY 4.0, source pinned at `510caad26c907793e48306262af216ff9f71c9f7`.

## UberBond activation

The strongest durable activation path is repository configuration, not hoping skill-description matching fires. `CLAUDE.md` should instruct Claude to load Task Observer before substantive tool-using work and to flush useful observations at objective completion boundaries.

A harness-level `SessionStart` hook is stronger when available, but it still injects an instruction rather than granting authority. Hooks must not contact customers, call providers, spend, deploy, change credentials/DNS, or mutate production merely to activate observation.

## Stable workspace

Use the repository's persistent root for `skill-observations/`. Never derive the observation location from a temporary checkout/worktree. Search for an existing observation workspace before creating another to avoid silent forks.

## Storage regimes

1. Local persistent filesystem: normal per-observation files and checkpoints.
2. Shared/hosted store with expensive writes: keep checks, suppress empty-marker writes.
3. No persistence: produce a structured handoff document with decisions, observations, principles, actions and working artifacts.

## Compaction/resume

After context compaction, reload `CLAUDE.md` and this skill. The persistent observation directory is the continuity mechanism.

## Governance-protected config

If a hook or policy denies editing shared config, do not bypass it. Surface the denial and use an approved project instruction or owner-approved configuration path.
