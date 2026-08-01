# Sonnet 5 context engineering

**Source basis:** `ANT-SONNET-PROMPT`  
**Status:** source-derived public guidance, verified 2026-08-01

## Findings

- Sonnet 5 supports a large context window and long output.
- Large prompts may trigger more thinking and tool use.
- Tight output limits can truncate final answers after substantial thinking.
- Fresh, narrow role contexts can preserve quality and reduce repeated history.

## ELITE DUO implementation

The system loads modular rules and capsules instead of all files at startup.

## Evidence rule

This module transfers operating principles only. It does not claim to reproduce the source model's weights or hidden reasoning.
