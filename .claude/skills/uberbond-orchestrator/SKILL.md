---
name: uberbond-orchestrator
description: Use for complex UberBond engineering, research, verification, or cross-agent work where bounded task graphs, parallel ownership, independent review, or Fable-style orchestration can improve results. Composes Fable Orchestrator, Metaswarm, and Superpowers mechanisms beneath UberBond canon.
---

# UberBond Orchestrator

Read first:

- `AGENTS.md`
- `UBERBOND_CANON.md`
- `docs/ORCHESTRATION_CAPABILITY_CANON.md`
- `docs/AI_SKILL_PLUGIN_ASSIMILATION_CANON.md`
- `artifacts/external-skill-plugin-registry.json`

## Goal

Choose the smallest orchestration structure that improves verified outcome per founder minute.

Do not spawn agents because a swarm sounds impressive.

## Mode selection

Use exactly one starting mode:

- `DIRECT`: small, low-coupling task with simple verification.
- `FABLE_GRAPH`: multiple bounded nodes with meaningful ownership/dependencies.
- `SWARM`: several independent specialist lanes plus integration/review.
- `RECURSIVE_SWARM`: only for genuinely large epics where child orchestrators materially reduce coordination cost.

Escalate to a larger mode only when evidence shows the smaller one is insufficient.

## Fable graph contract

Every implementation node must include:

```text
id
purpose
dependencies
workerRequirement
ownedFilesOrResponsibility
inputs
expectedOutput
verification
stopCondition
authorityCeiling
```

Planner/adjudicator nodes do not silently implement worker tasks.

The runtime remains responsible for validating the graph, worker callability, file ownership, results and final verification.

## Callable worker law

Never infer callability from a config file, README, model catalog, historical chat, or provider claim.

Before dispatch:

1. inspect the live worker/subagent surface;
2. identify callable agent types and provider/model pins where available;
3. preserve provider/model identity in receipts;
4. if a requested worker is unavailable, choose a lower-risk verified substitute only when the task permits it;
5. otherwise report the capability gap.

A discovered model is not a callable model.

## Parallel execution

Run ready nodes in parallel only when their dependencies and ownership do not conflict.

Every worker receives:

- bounded objective;
- exact responsibility or file ownership;
- inherited constraints;
- evidence already gathered;
- expected output;
- verification requirement;
- stop condition;
- reminder that other workers may share the repository and their changes must be preserved.

## Verification law

Never trust a worker's success statement by itself.

For consequential changes:

1. inspect the actual diff/artifact;
2. run focused behavioral tests;
3. verify the intended failure mode is exercised;
4. use adversarial or cross-model review when it adds value;
5. run the canonical broader gate when executable;
6. preserve infrastructure failure as infrastructure non-evidence;
7. do not call a mutant killed unless the intended mutation applied and the intended test failed for the intended reason.

Use TDD/systematic debugging/verification disciplines from the Superpowers donor where they improve falsifiability, but current UberBond test and Mutation War law wins conflicts.

## Recursive orchestration law

Child orchestrators inherit or tighten:

- authority ceiling;
- data scope;
- protected paths;
- spend cap;
- external-effect permissions;
- consequence class;
- iteration and compute budget.

A child may never widen them.

Use explicit depth and iteration caps. If the loop repeatedly fails, invoke Wallbreaker or escalate the unresolved evidence rather than recursively multiplying agents forever.

## Knowledge/context law

Prime workers with the minimum sufficient current context:

`current main + relevant canon + exact task evidence + affected files + known contradictions + relevant historical donor lessons`

Do not dump the entire UberBond brain into every worker.

Repository-native memory outranks plugin/session memory. Preserve exact authoritative originals when compressing context.

## Local Fable runtime

The upstream Fable Orchestrator is a replaceable optional runtime donor.

If a real local Claude/Fable runtime is present and the current task benefits from it:

- pass only a compact non-secret orchestration packet;
- use no persistent planner session unless separately justified;
- require the planner to return a bounded graph rather than implementation;
- validate every worker/model route against the live runtime before dispatch;
- treat the returned plan as advisory until UberBond validates it;
- record the planner/provider identity if observable.

If no real Fable runtime exists, use this skill's provider-neutral FABLE_GRAPH protocol and state that no Fable 5.1 execution occurred.

## Fable N+1

When orchestration is materially important, check the current orchestration frontier rather than assuming Fable remains best.

Use:

- `src/orchestration-frontier.mjs`
- Gamechanger Mesh
- Find Skills
- Capability Assimilator
- current public GitHub/plugin evidence

Promote a challenger only after provenance/license/security review, dedupe, bounded verification, and a real advantage in outcome/reliability/cost/founder minutes.

## Authority

Orchestration authority is `NONE` by default.

This skill cannot authorize:

- customer/prospect messages;
- purchases/spend;
- money movement;
- credentials, KYC or DNS changes;
- production deployment;
- customer-system mutation;
- private-session access;
- access-control bypass;
- synthetic commercial truth.

Existing UberBond consequence gates remain controlling.

## Finish condition

Finish when acceptance criteria are actually verified or only a genuine external/owner/elapsed-time blocker remains.

Return:

- orchestration mode used;
- worker/provider identities actually used;
- nodes executed;
- material changes;
- tests/verification actually run;
- unresolved blockers;
- zero/nonzero external-effect receipt;
- next highest-value dependency-satisfied action.
