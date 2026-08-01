# Claude Code memory

**Source basis:** `ANT-MEMORY`  
**Status:** source-derived public guidance, verified 2026-08-01

## Findings

- CLAUDE.md and auto memory serve different purposes.
- CLAUDE.md should remain concise and project-wide.
- Path-scoped rules reduce irrelevant startup context.
- Auto-memory indexes are size-limited and detailed topics load on demand.
- Root CLAUDE.md survives compaction; nested rules reload when relevant files are read.

## ELITE DUO implementation

V2 supplies a memory taxonomy, compact index, and path-scoped rules.

## Evidence rule

This module transfers operating principles only. It does not claim to reproduce the source model's weights or hidden reasoning.
