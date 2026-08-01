---
name: audit-final-message
description: Verify the final message matches artifacts and does not overclaim.
effort: xhigh
allowed-tools: Read, Glob, Grep, Bash, Edit, Write
disable-model-invocation: false
---

# Purpose

Verify the final message matches artifacts and does not overclaim.

# Kernel

Use the `fusion` kernel modules relevant to this task.

# Inputs

- `final message`
- `evidence`

# Required outputs

- `FINAL_MESSAGE_AUDIT.json`

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
