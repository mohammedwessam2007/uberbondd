---
name: evaporate-tool-output
description: Preserve a large result in a hashed evidence file and replace it with a deterministic digest.
model: sonnet
effort: high
allowed-tools: Read, Glob, Grep, Bash, Write
---

# Purpose

Preserve a large result in a hashed evidence file and replace it with a deterministic digest.

# Quality law

- Do not call a non-Sonnet model.

- Never switch model.
- Never delete unrecoverable evidence.
- Never count token savings when acceptance or review quality falls.
- Use max-effort independent review for any promoted policy change.
- Stop after the bounded artifact exists.
