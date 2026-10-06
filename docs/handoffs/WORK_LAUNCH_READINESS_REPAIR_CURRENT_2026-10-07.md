# UberBond launch-readiness repair current — 2026-10-07

Status: `EXACT_HEAD_REVERIFY_REQUIRED_AFTER_NO_AMPUTATION_CONSOLIDATION`

Canonical repair PR: #1251
Branch: `fix/launch-readiness-repair-20261007`
Base recovered: `c49df1d0f2825512077e55708ee1e014f1fd45e2`

This handoff records the current repair frontier after the hostile launch-readiness sweep. It preserves the wider UberBond organism and does not grant any customer, message, payment, DNS, credential, deployment or spend authority by itself.

## Defects repaired

1. Three committed test files contained malformed in-memory store setters and blocked repository syntax verification. They were repaired rather than excluded.
2. Capability Genome startup confused fixed Aug/Sep historical pilot evidence with a continuously refreshed world corpus. Startup now binds the exact pilot as `HISTORICAL_PILOT`, visibly reports it as historical, and preserves fail-closed `CURRENT` freshness and future-date rejection.
3. Date-sensitive Genome fixtures were pinned to explicit reference clocks.
4. Current collection truth was separated from legacy payment implementations. Contra is selected/account-pending; XPay and Payoneer remain backups; PayPal is deactivated; Lemon Squeezy is dormant/unselected. Old implementations remain recoverable diagnostics, not current owner actions.
5. Fourteen dormant source modules were given explicit fail-closed reachability classifications recovered from PR #1209. None was activated merely to satisfy the ratchet.
6. Semantic donor promotion was tightened so sub-phrase/name collisions and deliberately unreachable donor code cannot impersonate current implementation.
7. The coverage index no longer re-admits explicitly gated modules as operator-reachable.
8. Coverage enforcement rows now carry exact verified source/test witnesses instead of deriving authority from broad filename matches.
9. Deep Atlas growth was made scale-safe. Derived generated JSON preserves exact file/text/chunk coverage without recursively exploding every derived key into another structural node. Deep Atlas and Ultimate Graph hashing now stream canonical JSON into SHA-256 rather than constructing a giant canonical string.

## Exact hosted evidence before this consolidation commit

Exact code head `0d21e54a47943eea19f5dd193a25a88912492159`:

- `uberbondd-lite-private` preview `dpl_DmL4PnGrXk5aERXtuUDN9mLHErHp` reached `READY`.
- Deep Atlas: 4,262 repository artifacts; 4,169 parsed text files; 152,525 deep features; 10,593 content chunks; 0 truncated files; 0 structural-detail cap failures.
- Ultimate Graph: 163,581 nodes; 650,318 edges; 0 orphan nodes.
- scale regression, secret-sweep tests and related graph tests passed.
- full `uberbondd` preview `dpl_ECCTZ75QbsHALY5JnM56QX6gd3Vf` executed the same exact head and, before this handoff commit, had already reported exact reachability over 1,047 source modules with `partitionExact=true`, `allClassified=true`, zero unclassified and zero stale classifications, while continuing through deterministic verification without an observed failure at the last recorded checkpoint.
- GitHub Actions red jobs on this line repeatedly contained no executed steps. Those zero-step runner failures are infrastructure evidence, not source-test failures. Vercel executed source and remains the independent build judge.

Because this consolidation commit adds preserved tests/docs, exact-head verification must be repeated before merge.

## No-amputation consolidation

PR #1250 contained unique useful history not present in #1251. The following are intentionally preserved here before #1250 can be retired:

- `docs/handoffs/WORK_LATE_NIGHT_REPAIR_CURRENT_2026-10-06.md` as historical repair lineage;
- `docs/receipts/INFINITE_OPUS_REACHABILITY_RECONCILIATION_2026-10-04.md`;
- `docs/receipts/LATE_NIGHT_LAUNCH_REPAIR_20261006.md`;
- `tests/semantic-recovery-surface-wiring.test.mjs`;
- `tests/sovereign-coverage-test-classification.test.mjs`, repaired to import `readFileSync`.

Common #1250/#1251 changes are not duplicated. Newer #1251 source wins where it supersedes old repair attempts.

## Launch truth that remains external

- Winnr $69 purchase is ready but still requires Mohamed's explicit financial authorization.
- Contra exact account login/KYC/tax/Wallet/payout state remains owner/provider-held.
- applicable outbound legal-route evidence and exact send effect authorization remain mandatory at send time.
- the historical Intelo `UNKNOWN_0_OR_1` effect remains frozen and non-replayable.
- no customer, cleared revenue or accepted delivery is claimed.

## Completion law

Do not merge merely because the PR is mergeable. Require a fresh exact-head executed verifier after this consolidation. After merge, verify production on the exact merged/main SHA and update issue #1188 with the receipts. Only then may the older repair PR be marked superseded.
