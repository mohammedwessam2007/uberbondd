# Prompt size versus quality

**Source basis:** `COMMUNITY-LEAK`  
**Status:** source-derived public guidance, verified 2026-08-01

## Findings

- A larger file is not evidence of stronger reasoning.
- Large static prompts consume context and may reduce instruction adherence.
- Modularity and selective loading preserve detail without injecting everything.
- Quality must be benchmarked by acceptance tests.

## ELITE DUO implementation

V2 is large on disk but deliberately sparse in each context.

## Evidence rule

This module transfers operating principles only. It does not claim to reproduce the source model's weights or hidden reasoning.
