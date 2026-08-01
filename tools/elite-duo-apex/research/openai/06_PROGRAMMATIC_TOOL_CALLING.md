# Programmatic Tool Calling pattern

**Source basis:** `OAI-56-GUIDE`  
**Status:** source-derived public guidance, verified 2026-08-01

## Findings

- Use programs for bounded filtering, joining, ranking, deduplication, aggregation, and validation.
- Do not use programs when every result changes the next semantic decision.
- Define tool schemas, concurrency, retries, output schema, and stop conditions.
- Evaluate both program output and final answer.

## ELITE DUO implementation

V2 contains a local programmatic-tools skill and deterministic output validators.

## Evidence rule

This module transfers operating principles only. It does not claim to reproduce the source model's weights or hidden reasoning.
