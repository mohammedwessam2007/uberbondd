---
name: analyze-runtime-api-design
description: Analyze Runtime: Api Design
model: sonnet
effort: xhigh
allowed-tools: Read, Glob, Grep, Bash, Edit, Write
---

# Purpose

Analyze Runtime: Api Design

# Inputs

- mission contract
- Api Design source materials
- current-state evidence
- approval policy

# Procedure

1. Confirm authority, scope, and approval boundaries.
2. Inspect current evidence and existing mechanisms.
3. Run the Fable execution lens for continuity, tools, recovery, and completion.
4. Run the Sol decision lens for architecture, counterfactuals, and acceptance.
5. Use deterministic scripts for bounded counts, joins, validation, and hashing.
6. Produce the declared outputs.
7. Independently review before a readiness verdict.

# Outputs

- `ANALYZE_RUNTIME_API_DESIGN_RESULT.json`
- `EVIDENCE.md`
- `LIMITATIONS.md`

# Prohibitions

- Sonnet 5 only.
- No external effect without approval.
- No self-approval.
- No unsupported readiness claim.
- No hidden scope expansion.
