---
name: stable-prefix-audit
description: Detect system, tool, model, MCP and instruction changes that destroy exact prefix caching.
model: sonnet
effort: high
allowed-tools: Read, Glob, Grep, Bash, Write
---

# Purpose

Detect system, tool, model, MCP and instruction changes that destroy exact prefix caching.

# Quality law

- Do not call a non-Sonnet model.

- Never switch model.
- Never delete unrecoverable evidence.
- Never count token savings when acceptance or review quality falls.
- Use max-effort independent review for any promoted policy change.
- Stop after the bounded artifact exists.
