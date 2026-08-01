# Explicit caching pattern

**Source basis:** `OAI-56-GUIDE`  
**Status:** source-derived public guidance, verified 2026-08-01

## Findings

- Stable reusable prompt prefixes can be cached.
- Cache writes and reads have different economics.
- Breakpoints should avoid repeatedly caching volatile content.
- Cache usage should be measured.

## ELITE DUO implementation

Claude Code caching is automatic, so V2 keeps stable kernels and volatile capsules separate.

## Evidence rule

This module transfers operating principles only. It does not claim to reproduce the source model's weights or hidden reasoning.
