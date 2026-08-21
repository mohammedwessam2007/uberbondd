# Bounded agent evolution wave

`src/agent-evolution-wave.mjs` closes one local preparation loop without
creating another registry or granting a worker authority:

`UpgradeProposal -> EngineeringMissionPacket -> AgentTask -> relay receipt -> independent review -> SHADOW_READY or REPAIR_REQUIRED`

It deliberately does not schedule itself, discover credentials, run a model,
deploy, merge, send, spend, or promote code. The caller must inject the
existing configured ChatGPT relay client. Each invocation can create at most
one deterministic `LOCAL_PREPARATION` task and can call only the relay
client's already bounded poll once.

## Task 1: proposal-to-mission bridge

`compileAgentEvolutionMission()` composes the canonical self-upgrade and agent
relay contracts. It requires a reviewable proposal, non-protected repository
scope, explicit tests and acceptance gates, a zero-cent cost ceiling, and a
bounded token ceiling. Proposal, mission, task, and wave IDs are deterministic;
the existing relay dedupe key therefore handles replay.

## Task 2: independent result review

`reviewAgentEvolutionResult()` does not trust a worker's `PROCEED` label. It
rechecks task identity, result schema, secret policy, zero-effect ledger,
repository scope, `lite/` protection, exact required test commands, test
outcomes, and the existing self-upgrade gate. Unsupported `PROCEED` creates the
existing bounded `DisputePacket`; agreement on a passing local result reaches
only `SHADOW_READY`. Production promotion and economic proof remain blocked.

## Task 3: one bounded cycle

`runBoundedAgentEvolutionWave()` performs at most:

1. one relay health check;
2. one task enqueue when health is exactly `READY`;
3. one call to the relay client's bounded result poll;
4. one independent review;
5. one compact receipt through the existing audit writer.

There is no autonomous retry loop, scheduler, provider SDK, filesystem writer,
process executor, or deployment boundary in this module.

## Current live boundary

The production Vercel deployment is `READY`, but its relay endpoint returned
HTTP 503 with `RELAY_NOT_CONFIGURED` on 2026-08-20. Therefore no live task was
created and no Claude Code or Cowork run is claimed. The module is
`PASS_LOCAL`; live authenticated operation remains externally blocked.

