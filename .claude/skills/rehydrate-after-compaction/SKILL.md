---
name: rehydrate-after-compaction
description: Restore mission state from durable artifacts.
effort: xhigh
allowed-tools: Read, Glob, Grep, Bash, Edit, Write
disable-model-invocation: false
---

# Purpose

Restore mission state from durable artifacts.

# Kernel

Use the `fable` kernel modules relevant to this task.

# Inputs

- `snapshot`

# Required outputs

- `REHYDRATION_REPORT.json`

# Procedure

1. Validate the mission authority and input existence.
2. Identify hard constraints and approval boundaries.
3. Execute only the bounded skill.
4. Preserve raw evidence and exact identifiers.
5. Validate the required outputs.
6. Record limitations and external actions.
7. Stop after the finite outputs exist.

# Prohibitions

- Do not fabricate evidence.
- Do not expose private chain of thought.
- Do not silently change semantics or quality.
- Do not call a non-Sonnet model.
- Do not perform external or irreversible actions without approval.
