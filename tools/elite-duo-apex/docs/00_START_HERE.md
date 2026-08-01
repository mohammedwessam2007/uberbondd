# ELITE DUO APEX Sonnet OS V2

A research-backed, clean-room Claude Code operating system that uses **Claude Sonnet 5 only** while combining two elite public operating disciplines:

- **Fable 5 Max discipline** for long-horizon execution, memory, tool use, delegation, recovery, verification, and completion.
- **GPT-5.6 Sol Max discipline** for intent inference, architecture, counterfactual analysis, programmatic tool orchestration, lean prompting, adversarial review, and decision quality.

No Haiku. No economy model. No hidden OpenAI or Fable API call. Every AI role uses `model: sonnet`.

## Quality floor

- Core execution: Sonnet 5 `xhigh`
- Architecture: Sonnet 5 `max`
- Adjudication: Sonnet 5 `max`
- Independent review: Sonnet 5 `max`
- Debugging and repair: Sonnet 5 `xhigh` or `max`
- Deterministic validation: ordinary code, not a cheaper model

## Why this package is large

The previous V1 was a compact proof of concept. V2 includes:

- a current research corpus;
- 32 all-Sonnet role agents;
- 64 reusable skills;
- 30 modular kernel files;
- 16 lifecycle hooks;
- 24 evaluation suites;
- 18 schemas and contracts;
- memory, caching, worktree, and compaction systems;
- install, rollback, audit, and benchmarking tools;
- sequential, subagent, team, and one-shot-max workflows.

## The honest boundary

This does not copy Fable or GPT-5.6 model weights. It imports public operating principles into a Sonnet-only Claude Code harness. Actual Fable 5 or GPT-5.6 calls consume their own allowance and are disabled by default.

## Start

1. Read `01_EXECUTIVE_SPECIFICATION.md`.
2. Read `02_RESEARCH_CONCLUSIONS.md`.
3. Read `03_APEX_ARCHITECTURE.md`.
4. Upload this ZIP to Claude Code.
5. Paste `INSTALL_PROMPT.txt`.
6. Run `elite-apex`.

The system is finite, auditable, reversible, and benchmarkable.
