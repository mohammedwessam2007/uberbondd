---
name: context-health
description: Inspect live context, cache ratio, effort and rate limits and return the current zone and next action.
model: sonnet
effort: high
allowed-tools: Read, Glob, Grep, Bash, Write
---

# Purpose

Inspect live context, cache ratio, effort and rate limits and return the current zone and next action.

# Quality law

- Do not call a non-Sonnet model.

- Never switch model.
- Never delete unrecoverable evidence.
- Never count token savings when acceptance or review quality falls.
- Use max-effort independent review for any promoted policy change.
- Stop after the bounded artifact exists.
