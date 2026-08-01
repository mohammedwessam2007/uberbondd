# Token efficiency without quality loss

## Stable-prefix architecture

Keep the following stable:

1. Claude Code native system prompt
2. Elite fusion kernel
3. concise project CLAUDE.md
4. path-scoped rules
5. role-agent definitions

Place volatile mission data last.

Claude Code manages prompt caching automatically. Model switches create a fresh cache, which is another reason the default system remains Sonnet-only.

## Fresh contexts

Fresh contexts improve:

- independent verification;
- role separation;
- cache locality inside each role;
- reduced contamination from rejected alternatives;
- lower repeated-history cost.

## Files instead of transcripts

Contracts compress stable decisions into machine-readable form. A reviewer needs the evidence packet, not every implementation thought.

## Memory hierarchy

- CLAUDE.md: permanent project rules, under 200 lines
- path-scoped rules: file-specific requirements
- auto memory: concise learned facts
- topic memory: details read on demand
- mission state: temporary durable execution state
- rejected-alternatives ledger: retained outside execution context

## Compaction

Before compaction:

- persist state;
- persist unresolved decisions;
- record exact tests and failures;
- record modified files;
- record next finite action.

After compaction:

- rehydrate from artifacts;
- do not reconstruct decisions from vague summaries.

## No giant prompt superstition

Long prompts can reduce adherence and trigger unnecessary thinking. V2 is large on disk but loads modules selectively. The entire file system is not injected into every turn.
