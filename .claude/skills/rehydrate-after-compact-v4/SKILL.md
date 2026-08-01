---
name: rehydrate-after-compact-v4
description: Reload durable mission artifacts and audit missing continuity after compaction.
model: sonnet
effort: high
allowed-tools: Read, Glob, Grep, Bash, Write
---

# Purpose

Reload durable mission artifacts and audit missing continuity after compaction.

# Quality law

- Do not call a non-Sonnet model.

- Never switch model.
- Never delete unrecoverable evidence.
- Never count token savings when acceptance or review quality falls.
- Use max-effort independent review for any promoted policy change.
- Stop after the bounded artifact exists.
