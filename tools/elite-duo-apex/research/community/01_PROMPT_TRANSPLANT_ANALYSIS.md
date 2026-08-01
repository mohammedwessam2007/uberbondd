# Prompt-transplant analysis

**Source basis:** `COMMUNITY-LEAK`  
**Status:** source-derived public guidance, verified 2026-08-01

## Findings

- Community users circulate large Fable-oriented system prompts.
- Behavioral instructions can influence a cheaper model's operating style.
- The prompt is not the model weights.
- Replacing Claude Code's native prompt can remove useful tool and safety scaffolding.
- Appending a distilled clean-room kernel is safer than wholesale replacement.

## ELITE DUO implementation

V2 uses original modular kernels appended to Claude Code's native system.

## Evidence rule

This module transfers operating principles only. It does not claim to reproduce the source model's weights or hidden reasoning.
