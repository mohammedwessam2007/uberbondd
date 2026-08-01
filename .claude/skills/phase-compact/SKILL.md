---
name: phase-compact
description: Persist the mission state and invoke focused compaction only at a safe phase boundary.
model: sonnet
effort: high
allowed-tools: Read, Glob, Grep, Bash, Write
---

# Purpose

Persist the mission state and invoke focused compaction only at a safe phase boundary.

# Quality law

- Do not call a non-Sonnet model.

- Never switch model.
- Never delete unrecoverable evidence.
- Never count token savings when acceptance or review quality falls.
- Use max-effort independent review for any promoted policy change.
- Stop after the bounded artifact exists.
