---
name: detect-weakened-tests
description: Compare tests and assertions for silent weakening.
effort: max
allowed-tools: Read, Glob, Grep, Bash, Edit, Write
disable-model-invocation: false
---

# Purpose

Compare tests and assertions for silent weakening.

# Kernel

Use the `sol` kernel modules relevant to this task.

# Inputs

- `base diff`
- `head diff`

# Required outputs

- `TEST_INTEGRITY_REPORT.json`

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
