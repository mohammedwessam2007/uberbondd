# Known limitations

- Sonnet remains Sonnet. The kernels do not recreate Fable or GPT-5.6 weights.
- Max effort is not a strict token budget.
- Sonnet 5 does not support Anthropic task budgets.
- Claude Code agent teams are experimental and use significantly more tokens.
- Command hooks cannot understand every semantic risk; policy and review remain necessary.
- CLAUDE.md and prompt instructions influence behavior but are not hard enforcement.
- MCP servers and external tools introduce separate trust boundaries.
- Claude Code versions may change hook schemas or feature support.
- Prompt caching behavior is automatic and model-specific.
- A large on-disk system helps only when modules load selectively.
- The benchmark laboratory must be run on real tasks before declaring superiority.
