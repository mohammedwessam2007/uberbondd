# Frontier VM Fresh Task Custodian — 2026-09-29

Status: PRE-REGISTERED / NO SPEND / NO MODEL CALLS

## Purpose

Prevent cherry-picking, benchmark leakage, and post-hoc task selection in the first live Frontier VM burn-in.

## Cohort

The first burn-in cohort is the first **40 qualifying fresh tasks** encountered after the live TypingMind/OpenRouter connection is evidenced and the live Crown snapshot is frozen.

A task qualifies only if:

1. it is a real UberBond or founder task, not invented to flatter the architecture;
2. the exact task has not already been optimized against by the candidate path;
3. the task and evaluation criteria are sealed before either baseline or candidate output is generated;
4. the direct Crown baseline and Frontier VM candidate receive materially identical task facts and authority boundaries;
5. the task is hard enough that a quality regression could matter;
6. any task exclusion is recorded with the reason before seeing outcome quality.

## Anti-cherry-pick law

Do not select the 40 easiest tasks.
Do not discard candidate losses.
Do not replace a failed task with a friendlier one.
Do not let aggregate score hide a direct paired regression.

Every admitted task receives a monotonically increasing cohort index.

## Per-task sealing record

Before generation, record:

- task_id
- admitted_at
- task_class
- exact task digest
- exact source-state digest or immutable evidence refs
- evaluation criteria
- Crown candidate/revision/reasoning mode
- candidate architecture revision
- authority/effect class
- privacy class
- estimated maximum spend
- baseline/candidate generation order policy

Then generate:

A. direct current task-class Crown baseline  
B. Frontier VM V5 candidate

Neither output may rewrite the sealed task or criteria.

## Evaluation

Prefer blind paired scoring where practical.

A required-dimension regression is a regression even if the candidate is cheaper.

Promotion tolerance:

`pairedTaskRegressionAllowed = 0`

Any observed regression triggers the canonical deoptimization/falsification path rather than a cost-based excuse.

## Cost truth

Use authoritative provider billing/usage receipts where available.

Do not inflate reference cost with hypothetical expensive routes.

Record actual served model, provider, service tier, fresh/cached tokens, output/reasoning tokens where exposed, latency, and all-in cost.

## Privacy

Never put secret API keys in the task record.

Sensitive tasks must obey the applicable provider-retention and data-collection policy. If the strongest candidate cannot satisfy the required privacy class, that is a task-class routing constraint, not permission to leak data.

## Terminal milestone

Milestone 1 requires:

- 40+ admitted fresh paired tasks;
- zero observed paired required-quality regressions;
- real cost receipts;
- at least one Jev circuit in shadow;
- at least one realized exact reuse/multicast/cache saving;
- no hidden quality downgrade.

This document creates a custodian protocol only. It does not fabricate the 40 tasks or claim the milestone has been reached.
