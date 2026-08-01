# Claude Code subagents

**Source basis:** `ANT-SUBAGENTS`  
**Status:** source-derived public guidance, verified 2026-08-01

## Findings

- Subagents use separate context windows.
- Definitions can specify model, effort, tools, memory, skills, hooks, and worktree isolation.
- Background agents auto-deny tool calls requiring new permission.
- Subagents cannot recursively create subagents.

## ELITE DUO implementation

All custom role agents are Sonnet 5 and receive only necessary tools.

## Evidence rule

This module transfers operating principles only. It does not claim to reproduce the source model's weights or hidden reasoning.
