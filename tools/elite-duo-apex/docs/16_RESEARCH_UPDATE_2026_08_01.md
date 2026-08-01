# Research update, August 1, 2026

## Codex's efficiency advantage

OpenAI describes Codex as preserving exact prompt prefixes for caching and automatically compacting once an `auto_compact_limit` is exceeded. Its Responses API compact endpoint can return an opaque encrypted compaction item that preserves model-side latent understanding. That exact object is OpenAI-specific and cannot be transplanted into Claude.

## Claude-native equivalents

Claude Code supports:

- exact-prefix prompt caching managed automatically;
- cache telemetry showing fresh input, cache creation, and cache reads;
- model-specific caches, while effort changes do not invalidate the cache;
- automatic removal of old tool outputs before conversation summarization;
- `/compact` with custom focus instructions;
- `PreCompact` and `PostCompact` hooks, including the generated compact summary;
- `/rewind`, which returns to an earlier cached prefix;
- forked subagents that inherit parent context and reuse the parent prompt cache;
- ordinary subagents with isolated context for noisy exploration;
- a status line exposing live context percentage and rate-limit usage;
- configurable auto-compaction thresholds.

## Claude API context management

Anthropic's API documentation further supports server-side compaction, selective tool-result clearing, thinking-block clearing, tool search, programmatic tool calling, and prompt caching. Claude Code exposes some of these behaviors natively and V4 emulates the rest with local deterministic scripts rather than an external API.

## Design conclusion

The closest Claude Code equivalent to Codex's low-context agent loop is not one giant transplanted prompt. It is:

`stable Sonnet prefix + forked cache-sharing side work + isolated noisy workers + tool-output evaporation + durable state + audited compaction + rewind + benchmarked effort allocation`.
