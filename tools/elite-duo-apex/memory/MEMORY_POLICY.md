# Memory policy

## Store

- reusable build and test commands;
- verified architecture facts not obvious from code;
- recurring debugging causes;
- user corrections that will matter again;
- accepted decisions and why;
- invalidated approaches and the evidence that disproved them.

## Do not store

- secrets;
- raw credentials;
- transient mission state;
- facts already easy to discover from the repository;
- speculative conclusions;
- copied tool output;
- private chain of thought;
- temporary branches or line numbers likely to drift.

## Structure

- `MEMORY.md`: concise index, one line per topic
- `topics/*.md`: detailed lessons loaded on demand
- `MEMORY_CORRECTIONS.csv`: additions, updates, deletions, and reasons
- `MEMORY_SOURCES.json`: evidence supporting retained memories

Review memory after major repairs and before release decisions.
