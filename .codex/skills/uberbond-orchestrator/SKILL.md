---
name: uberbond-orchestrator
description: Use for complex UberBond coding or multi-agent work. Applies the provider-neutral Fable orchestration protocol, Metaswarm review/coordination donors, and Superpowers verification discipline beneath UberBond canon.
---

# UberBond Orchestrator for Codex

Read `docs/ORCHESTRATION_CAPABILITY_CANON.md` and current UberBond canon before dispatching workers.

## Core rule

Codex is the runtime/integrator. A planner or Fable supplier may propose a graph, but Codex validates callability, ownership, scope, results and final verification.

Choose the smallest useful mode: `DIRECT`, `FABLE_GRAPH`, `SWARM`, or bounded `RECURSIVE_SWARM`.

Every implementation node must specify:

- id and purpose;
- dependencies;
- callable worker requirement;
- exclusive file/responsibility ownership;
- inputs and expected output;
- verification;
- stop condition;
- inherited authority ceiling.

Do not infer callable models from configuration or prose. Inspect the live collaboration surface. Provider/model identity remains observable where the runtime exposes it.

Run independent ready nodes in parallel only when ownership/dependencies are non-conflicting. Tell workers that other agents may share the workspace and that existing edits must be preserved.

Never trust worker self-reports as completion. Inspect artifacts and run behavioral verification. Use adversarial or cross-model review when it improves the expected result. Mutation claims follow UberBond Mutation War law.

A child orchestrator inherits or tightens authority, data scope, protected paths, spend, external-effect permissions and iteration/compute budgets. It cannot widen them.

No secrets, credentials, private cookies, raw payment secrets or unnecessary private customer data belong in orchestration packets.

If a real locally configured upstream Fable runtime is callable, it may plan/adjudicate only. Its output is an advisory graph until Codex validates it. If it is unavailable, use the provider-neutral FABLE_GRAPH method without claiming Fable 5.1 executed.

For frontier replacement, use `src/orchestration-frontier.mjs` plus Gamechanger/Find Skills/Capability Assimilator. Fable, Metaswarm and Superpowers are replaceable donors, not permanent sovereign dependencies.

Orchestration does not authorize sending, spending, deployment, credential/DNS changes, money movement, private-session access, customer-system mutation, or commercial truth promotion.
