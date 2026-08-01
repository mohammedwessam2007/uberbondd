---
name: isolated-noisy-worker
description: Use a fresh Sonnet subagent for logs, broad search or file exploration that should not enter the parent.
model: sonnet
effort: high
allowed-tools: Read, Glob, Grep, Bash, Write
---

# Purpose

Use a fresh Sonnet subagent for logs, broad search or file exploration that should not enter the parent.

# Quality law

- Do not call a non-Sonnet model.

- Never switch model.
- Never delete unrecoverable evidence.
- Never count token savings when acceptance or review quality falls.
- Use max-effort independent review for any promoted policy change.
- Stop after the bounded artifact exists.
