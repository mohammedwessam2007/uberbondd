---
name: uberbond-capability-assimilator
description: Use when an UberBond task may benefit from an external agent skill, Claude Code plugin, MCP server, model gateway, memory system, context compressor, security agent, or research tool. Discovers and selects the smallest approved capability without duplicating UberBond or widening authority.
---

# UberBond Capability Assimilator

Read first:

- `AGENTS.md`
- `UBERBOND_CANON.md`
- `docs/AI_SKILL_PLUGIN_ASSIMILATION_CANON.md`
- `artifacts/external-skill-plugin-registry.json`

## Trigger

Use this skill when:

- a task exposes a missing capability;
- a specialized external skill/plugin might reduce founder minutes;
- a worker is about to install or invoke an external runtime;
- a new public agent tool/repository is proposed;
- a Claude Code automation recommendation appears;
- repeated owner corrections suggest a skill improvement;
- large tool outputs create context/cost pressure;
- security verification or broader public-web research is needed.

## Decision sequence

1. State the exact missing capability.
2. Search current UberBond modules/skills first. If already covered, compose the existing capability and stop.
3. Check `artifacts/external-skill-plugin-registry.json` for an approved supplier.
4. If no suitable supplier exists, use Find Skills / current web/repository research to generate candidates.
5. For every candidate record: source, exact ref/version where practical, license, capability, overlap, data scope, external-effect surface, authority, sandbox needs, rollback path, expected benefit, and kill condition.
6. Choose the smallest useful integration class:
   - `CANONICAL_METHOD`
   - `PROJECT_SKILL`
   - `OPTIONAL_RUNTIME`
   - `EXTERNAL_ADAPTER`
   - `REFERENCE_ONLY`
7. Install project-locally/reversibly where possible. Never commit credentials, cookies, private tokens, or raw private customer data.
8. Verify the capability on a bounded task before trusting it broadly.
9. Preserve original authoritative evidence when memory/compression tools are involved.
10. Record durable lessons/receipts and revoke the supplier if it becomes unsafe, stale, redundant, expensive, or inferior.

## Approved supplier behaviors

### Find Skills
Use for candidate discovery only. Popularity is not approval.

### Claude Code Setup
Use as a read-only automation auditor. Reconcile all recommendations against UberBond before adoption.

### Task Observer
Capture corrections, repeated manual work and skill gaps. Produce proposed improvements. Do not silently mutate canon or skills.

### Claude-Mem
Use as subordinate local/session memory. Repository brain and durable evidence always win conflicts.

### Headroom
Use to compress large working context/tool outputs when originals remain recoverable. Never destroy proof to save tokens.

### OmniRoute
Use only as an optional model/provider routing supplier. Preserve model/provider identity and never let fallback widen authority or weaken evidence requirements.

### Strix
Use only on UberBond-owned or explicitly authorized targets, defaulting to local/test/preview. No unrelated third-party scanning or destructive exploitation.

### Agent Reach
Use only for lawful public/authorized research surfaces. No CAPTCHA bypass, access-control evasion, private-cookie harvesting, private-contact inference, or prohibited scraping.

## Skill-improvement loop

`work -> observation -> candidate lesson -> evidence/counterexample -> proposed skill diff -> review/tests -> merge -> version`

Treat owner corrections as strong local evidence, then classify them before generalizing:

- task-specific correction;
- owner preference;
- UberBond project invariant;
- safety/authority rule;
- general reusable technique.

## Output contract

When this skill materially affects a mission, leave a compact receipt containing:

- selected capability/supplier;
- why existing UberBond coverage was insufficient;
- version/ref/source;
- license;
- data/effect/authority boundary;
- what was installed or merely referenced;
- verification performed;
- measured or expected founder-minute benefit;
- rollback/revocation instruction;
- unresolved external gates.

Never report installation or execution that did not actually occur.
