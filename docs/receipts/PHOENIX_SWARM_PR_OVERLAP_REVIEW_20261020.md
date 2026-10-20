# PHOENIX read-only swarm PR collision review | October 20, 2026

**Truth class:** Fresh GitHub PR file-metadata inspection and deterministic local algorithm. Not a review of every source diff, a clean source CI verdict, a deployment receipt, or permission to merge/close PRs. This receipt is scoped to the six PRs named below; newer changes require a new run.

## Canonical source and command

At the 2026-10-20T10:49:50.843Z capture, remote `main` was `6f70a7d91c214f5a00c9bfbd5857b34d3f59aace` (merge #1511). Run from the repository using approved authenticated GitHub CLI:

```bash
node scripts/phoenix-swarm-pr-overlap.mjs --prs 1513,1512,1508,1507,1501,1498
node --test tests/phoenix-swarm-pr-overlap.test.mjs
```

The tool makes only GitHub metadata GET calls with a bounded PR set and per-PR file pagination. It checks PR head/base identity again after retrieval and refuses mutable observations. It NEVER merges, closes, rebases, sends messages, changes credentials, or deploys. Raw credentials are not surfaced. Local test fixtures prove stale/duplicate/path-traversal evidence refuses.

## Actual findings at initial run

- 6 active PRs, 15 intersecting PR pairs.
- 3 **substantive changed-source path** overlaps: `#1498 ↔ #1501`, `#1498 ↔ #1513`, `#1501 ↔ #1513`. #1513 explicitly records preservation of both parent donor lineages, and is the integration candidate; no automatic supersession is declared.
- 12 other intersections consist exclusively of two generated files: `artifacts/system-readiness.json` and `docs/CURRENT_SYSTEM_STATE.md`. These require canonical readiness regeneration **after** integrating actual source, not deletion of donor behavior or assumption of incompatible source.
- #1512 owns the pending inbound-reply / STOP hold extension; the existing production GET had **not** exposed `pendingReplyReviewCount` in the read-only live observation; release and receiver readback still needed. #1508 and #1507 preserve separate source/history and must not be blindly merged after #1511.

## No-amputation and authority

Overlap means shared paths, not equivalence, success, loss of unique ideas, or authorization. Preserve branch tips, test receipts, shared-source ancestry, and the original 890 founder-idea identities. The original October Wave 1–2 corpus gap remains UNKNOWN. Neither this audit nor any PR can grant sending authority. At review time Railway reported `sendAuthority:NONE`, canonical Neon synthetic adverse observations 2/2 reconciled, no cleared live mail or cash.

## Limitations

A newer main, PR commit, reviewed source diff, or actual production observation supersedes these specific file-list results. The private independent 2026-10-20 UberWarm backup manifest was retrieved using connected GitHub, while the Codespace `gh` token returned HTTP 404 for the private backup blob. This is a **credential-scope/readback gap**, not proof of missing backup. The manifest records decoded bundle SHA-256 `63969244683b101a6169d2c75f5aa029241d1995c394f8f8cc4726e3b4d233af`, incremental prerequisite `6237f828c5d45a6ac0f6c02a019975c14a373b69`, and prior independent verification. This audit did not independently fetch or rehash those bytes.
