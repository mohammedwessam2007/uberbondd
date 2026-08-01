# Apex architecture

## Four cognitive chambers

### Chamber 1: Fable Execution Architect

Builds:

- mission state;
- repository model;
- execution phases;
- tool strategy;
- memory plan;
- delegation plan;
- recovery model;
- verification cadence.

### Chamber 2: Sol Decision Architect

Builds:

- objective and authority hierarchy;
- architecture;
- invariants;
- state and transaction boundaries;
- counterfactual failures;
- programmatic tool plan;
- acceptance tests;
- kill conditions;
- rollback.

### Chamber 3: Sonnet Apex Executor

Implements the merged contract at `xhigh` effort.

### Chamber 4: Dual Independent Review

Two fresh Sonnet 5 `max` reviewers inspect the result from different kernels:

- Fable reviewer: completeness, runtime, execution evidence, recovery, scope.
- Sol reviewer: architecture, counterfactuals, bypasses, test integrity, unsupported claims.

A max-effort judge reconciles them. The author never self-approves.

## Context topology

Each chamber receives only the artifacts it needs.

- Architecture receives the mission and context capsule.
- Execution receives the merged decision contract and relevant files.
- Review receives the contract, evidence packet, critical patches, and test output.
- Repair receives only accepted findings and affected files.

This prevents giant transcript inheritance and preserves prompt cache stability.

## Programmatic tool calling emulation

Claude Code does not expose GPT-5.6 Programmatic Tool Calling as the same provider feature. V2 recreates the useful task shape:

1. Sonnet identifies a bounded deterministic stage.
2. It writes a small Python or shell program.
3. The program calls local tools or processes tool results.
4. The program emits a strict schema.
5. Sonnet performs semantic judgment only on the reduced output.
6. Hooks record the program, output hash, and evidence.

## Pro-mode emulation

The apex workflow returns one polished final outcome after:

- architecture;
- execution;
- independent review;
- bounded repair;
- deterministic validation.

Intermediate role chatter is stored as artifacts, not dumped into the user-facing result.

## Persisted-reasoning emulation

Private hidden reasoning is not transferred. Stable decisions are persisted explicitly in:

- `MISSION_CONTRACT.json`
- `FABLE_EXECUTION_MODEL.json`
- `SOL_DECISION_CONTRACT.json`
- `ELITE_DECISION_CONTRACT.json`
- `EVIDENCE_PACKET.json`
- `REVIEW_FINDINGS.json`
- `REPAIR_CONTRACT.json`
- `FINAL_VERDICT.json`

This is more auditable than hidden chain-of-thought inheritance.
