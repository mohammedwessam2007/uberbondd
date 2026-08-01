---
name: calibrate-compaction
description: Recommend an auto-compaction threshold from telemetry, subject to quality benchmarking.
model: sonnet
effort: high
allowed-tools: Read, Glob, Grep, Bash, Write
---

# Purpose

Recommend an auto-compaction threshold from telemetry, subject to quality benchmarking.

# Quality law

- Do not call a non-Sonnet model.

- Never switch model.
- Never delete unrecoverable evidence.
- Never count token savings when acceptance or review quality falls.
- Use max-effort independent review for any promoted policy change.
- Stop after the bounded artifact exists.
