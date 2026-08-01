# Research conclusions

## Fable 5's transferable strengths

Anthropic's public guidance emphasizes:

- long-horizon autonomy;
- first-shot correctness on complex well-specified problems;
- stronger code review and debugging;
- ambiguity navigation;
- dependable subagent delegation;
- evidence-grounded progress reporting;
- memory systems;
- autonomous completion without unnecessary permission requests;
- acting once enough information exists;
- fresh-context verification;
- avoiding speculative refactoring and irrelevant option surveys.

These behaviors are implemented as the Fable execution kernel.

## GPT-5.6 Sol's transferable strengths

OpenAI's public model guidance emphasizes:

- lean prompts;
- strong intent understanding;
- explicit autonomy and approval boundaries;
- `max` reasoning for the hardest tasks;
- pro-mode quality-first execution;
- programmatic tool calling for bounded filtering, joining, ranking, deduplication, aggregation, and validation;
- persisted reasoning across stable multi-turn goals;
- explicit prompt caching;
- multi-agent parallelism;
- tool-search and relevant-tool exposure;
- evaluation of final answers, not merely intermediate programs;
- measuring quality, tokens, latency, retries, and cost.

Inside Claude Code, these patterns are recreated through contract artifacts, deterministic scripts, isolated agents, and stable prompt prefixes.

## Sonnet 5 realities

Anthropic documents Sonnet 5 as:

- strong in coding and agentic work;
- adaptive-thinking by default;
- supporting `high`, `xhigh`, and `max` effort;
- more likely to use tools and self-verify at higher effort;
- literal in following scoped instructions;
- using a 1M-token context window and 128K maximum output;
- sensitive to tight output limits when high effort uses substantial thinking.

Therefore V2 uses explicit scope, sufficiently large turns, narrow role contexts, and no low-effort roles.

## Claude Code features used

- custom subagents with separate context windows;
- Sonnet-only model overrides;
- per-agent effort;
- persistent project and local memory;
- skills with supporting files;
- deterministic hooks;
- worktree isolation;
- prompt caching;
- path-scoped rules;
- agent teams as an opt-in mode;
- pre/post compaction persistence;
- tool and permission enforcement;
- instruction-load auditing;
- finite task and stop gates.

## Community 'Fable OS' trick

Community posts describe transplanting a large Fable-oriented system prompt into a cheaper model. The useful idea is behavioral scaffolding. The exaggerated claim is that prompt text transfers the frontier model's weights.

This package does not include leaked prompt material. It distills the public, testable behavioral components and adds controls missing from the viral method: context isolation, hooks, schemas, memory hygiene, independent review, evaluation, and rollback.
