---
name: rewind-abandoned-path
description: Use checkpoint rewind rather than summarizing a branch that should disappear entirely.
model: sonnet
effort: high
allowed-tools: Read, Glob, Grep, Bash, Write
---

# Purpose

Use checkpoint rewind rather than summarizing a branch that should disappear entirely.

# Quality law

- Do not call a non-Sonnet model.

- Never switch model.
- Never delete unrecoverable evidence.
- Never count token savings when acceptance or review quality falls.
- Use max-effort independent review for any promoted policy change.
- Stop after the bounded artifact exists.
