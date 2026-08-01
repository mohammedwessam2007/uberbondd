# Claude Code hooks

**Source basis:** `ANT-HOOKS`  
**Status:** source-derived public guidance, verified 2026-08-01

## Findings

- Hooks fire across session, prompt, tool, subagent, task, stop, compaction, instruction, and worktree events.
- PreToolUse and Stop can block actions.
- Command hooks provide deterministic enforcement.
- Hook context can be injected into Claude without becoming a visible chat message.
- Exit code 2 is the blocking signal for many events.

## ELITE DUO implementation

V2 includes command hooks for dangerous actions, evidence, state, compaction, and completion.

## Evidence rule

This module transfers operating principles only. It does not claim to reproduce the source model's weights or hidden reasoning.
