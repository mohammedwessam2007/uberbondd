---
name: create-rollback
description: Create rollback, data restoration, and deployment reversal instructions.
effort: xhigh
allowed-tools: Read, Glob, Grep, Bash, Edit, Write
disable-model-invocation: false
---

# Purpose

Create rollback, data restoration, and deployment reversal instructions.

# Kernel

Use the `fusion` kernel modules relevant to this task.

# Inputs

- `changes`

# Required outputs

- `ROLLBACK.md`

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
