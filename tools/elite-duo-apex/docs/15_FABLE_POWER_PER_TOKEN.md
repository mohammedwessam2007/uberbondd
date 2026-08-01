# Fable power per Sonnet token

## What the research supports

Claude Code already provides most of the harness primitives needed for efficient long missions:

- automatic prompt caching;
- automatic old-tool-output clearing;
- automatic and manual compaction;
- compact instructions;
- persistent CLAUDE.md and auto memory;
- separate-context subagents;
- cache-sharing forked subagents;
- lifecycle hooks before and after compaction;
- status-line telemetry for current context and cache usage;
- checkpoint rewind for abandoned paths.

## Cost hierarchy

Use these in order:

1. avoid producing unnecessary content;
2. use deterministic code;
3. reuse a cached prefix;
4. reuse an existing artifact;
5. send noisy work to a separate context;
6. evaporate large tool outputs into hashed evidence files;
7. rewind an abandoned path to an already cached prefix;
8. compact at a natural phase boundary;
9. clear only when switching to an unrelated mission.

## Quality hierarchy

- Sonnet 5 max: architecture, adjudication, independent review.
- Sonnet 5 xhigh: difficult implementation, debugging, migration, security.
- Sonnet 5 high: evidence compilation and structured coordination.
- deterministic software: counts, schemas, hashes, joins, log reduction.

This is not model downgrading. It allocates the same Sonnet model where judgment remains.

## Why compaction is not always first

Compaction replaces conversation history, so the next turn rebuilds the conversation-layer cache. It is beneficial when discarded history is truly dead weight, but unnecessary early compaction can cost more than continuing on a warm prefix.

V4 therefore prefers:

- forks for context-heavy side tasks that need parent knowledge;
- fresh subagents for independent research and review;
- output evaporation for large logs;
- rewind when an entire branch was wrong;
- compaction only at natural phase boundaries or genuine pressure.
