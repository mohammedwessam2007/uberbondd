# Claude Code prompt caching

**Source basis:** `ANT-CACHE`  
**Status:** source-derived public guidance, verified 2026-08-01

## Findings

- Claude Code manages prompt caching automatically.
- Model switches trigger uncached turns for the new model.
- Subagents build separate caches.
- Forks can share the parent's prefix cache.
- Compaction uses prefix-sharing behavior.

## ELITE DUO implementation

Remaining Sonnet-only protects cache continuity and avoids model-switch penalties.

## Evidence rule

This module transfers operating principles only. It does not claim to reproduce the source model's weights or hidden reasoning.
