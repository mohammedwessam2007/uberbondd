# Fable long-run behavior

**Source basis:** `ANT-FABLE-PROMPT`  
**Status:** source-derived public guidance, verified 2026-08-01

## Findings

- Long turns require timeouts and progress mechanisms.
- Act once enough information exists instead of endlessly surveying.
- End only when complete or blocked on user-only input.
- Ground progress claims in current-session tool results.
- Avoid promises about work that has not been executed.

## ELITE DUO implementation

Implemented through state files, evidence hooks, stop gates, and a long-run orchestrator.

## Evidence rule

This module transfers operating principles only. It does not claim to reproduce the source model's weights or hidden reasoning.
