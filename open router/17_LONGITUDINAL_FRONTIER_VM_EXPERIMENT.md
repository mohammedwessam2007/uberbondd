# 17 — Longitudinal Frontier VM Experiment

Status: PRE-EXECUTION / REQUIRES LIVE CROWN + API CREDENTIAL + FRESH TASKS  
Date: 2026-09-29

## Question

Can UberMind reduce the fraction of cognition purchased from the market frontier over repeated real work while preserving the current frontier's required finished-work quality?

This is the experiment that can validate or kill the V5 thesis.

## Primary hypotheses

H1 — Quality:

```
paired required-quality regressions = 0
```

inside any promoted bounded domain.

H2 — Frontier residual:

```
FRR_late < FRR_early
```

where:

```
FRR =
candidate frontier-priced semantic work
---------------------------------------
direct-baseline frontier-priced semantic work
```

H3 — Economics:

```
candidate all-in cost < direct matched Crown reference cost
```

after certification overhead is amortized.

H4 — Recompilation:

After a stronger Crown succeeds the incumbent, useful compiled cognition survives where still valid and deoptimizes where it no longer satisfies the stronger quality contract.

## Phase A — Burn-in

Minimum first milestone: 40 fresh paired tasks in one meaningful task class.

For each task:

```
A = direct current Crown baseline
B = V5 Frontier VM candidate
```

A is generated independently before B can influence it.

Record:

- exact Crown identity/revision;
- reasoning setting;
- provider;
- fresh/cached input;
- output/reasoning tokens;
- all-in cost;
- task outcome;
- evidence;
- founder minutes;
- semantic nodes;
- frontier nodes;
- compiled hits;
- Jev decisions;
- deoptimizations.

No production baseline removal occurs during burn-in.

## Phase B — Certified recurrence

Only bounded regions that clear the canonical zero-loss gate enter this phase.

Use new tasks from the same certified archetype, not replayed answers.

Candidate path may use:

```
exact reuse
 -> certified Jev
 -> minimum information-diverse swarm
 -> frontier residual only
```

Random shadow Crown audits remain active.

Goal:

Observe whether:

- direct frontier token share falls;
- semantic page faults per useful task fall;
- compiled hit share rises;
- all-in cost falls;
- paired regressions remain zero.

## Phase C — Crown succession shock

When a stronger market Crown is verified, or in a controlled test using a deliberately stronger reference:

1. mark high-value compiled circuits stale-for-revalidation;
2. re-run sampled states against the stronger Crown;
3. keep circuits that still satisfy the stronger baseline;
4. decompile circuits that do not;
5. measure survival rate and revalidation cost;
6. continue production only within refreshed applicability bounds.

This tests whether virtualization truly decouples the logical quality service from the physical model supplier.

## Phase D — Ablation

Run at least:

1. direct Crown;
2. ordinary model router;
3. router + adaptive swarm;
4. V5 without Jev;
5. V5 without cross-task CSE;
6. V5 without Frontier Delta residualization;
7. V5 without profile-guided compilation;
8. complete V5.

The purpose is causal attribution.

A complete system win without ablation does not tell us what created the gain.

## Required scorecard

```
paired_regressions
paired_improvements

baseline_frontier_cost
candidate_frontier_cost
frontier_residual_ratio

baseline_all_in_cost
candidate_all_in_cost
reference_compression_factor

semantic_nodes
frontier_nodes
frontier_node_share
compiled_hits
compiled_hit_share

semantic_page_faults
Jev_decisions
Jev_false_negative_escalation_misses
Jev_false_positive_escalations

Crown_calls
Crown_calls_avoided
multicast_consumers
cross_task_CSE_hits

deoptimizations
quality_debt
circuit_expirations

Crown_revision
recompilation_survival_rate

founder_minutes
latency
```

## Kill conditions

Do not rationalize away failures.

Pause or shrink the theory if:

- cheap prework repeatedly costs more than direct Crown;
- paired regressions emerge in promoted domains;
- subtle regressions evade our evaluator;
- most production work never repeats enough to amortize compilation;
- Jev circuits decompile before earning back certification cost;
- Crown succession invalidates most compiled cognition;
- orchestration costs dominate;
- founder/operator complexity exceeds savings.

## Success ladder

### Milestone 1

40+ fresh paired tasks, zero observed required-quality regressions, real cost receipts.

### Milestone 2

100+ recurring fresh tasks, FRR lower in late window than early window, candidate all-in cost below direct reference.

### Milestone 3

At least one certified Jev circuit and one deterministic path with realized, not hypothetical, Crown-call avoidance.

### Milestone 4

Crown succession event with measurable recompilation survival and correct deoptimization.

### Milestone 5

Cross-task semantic CSE/multicast produces realized frontier-call avoidance across independent user missions.

### Milestone 6

Independent replication or external evaluation reproduces the quality/cost effect.

## Claim gate

Before Milestone 1:

> architecture hypothesis

After bounded Milestone 1:

> zero observed paired regressions on N tasks under this task class and campaign

After Milestones 2–4:

> evidence of self-amortizing frontier-quality cognition in bounded recurring domains

Only after broad independent replication:

> consider stronger research claims

## The result worth chasing

The jaw-dropping graph would not be "number of agents."

It would be:

```
quality
  stays pinned to moving Crown
        |
        |-----------------------------

frontier residual ratio
  1.0 |\
      | \
      |  \
      |   \____
      |        \____
  0.0 +------------------------------> accumulated verified cognition

all-in marginal cost
      follows the frontier residual downward
```

Then a new Crown arrives:

```
temporary revalidation spike
 -> recompile
 -> lower residual again
 -> at a higher quality floor
```

If reality produces that curve, V5 is doing something materially different from a static router.
