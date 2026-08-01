# Reranking doctrine

**Group:** `ai-data`  
**Risk:** `HIGH`  
**Model:** Claude Sonnet 5  
**Architecture effort:** `max`  
**Execution effort:** `xhigh`  
**Independent review:** required

## Objective

Apply ELITE DUO APEX to reranking without weakening quality, authority, privacy, safety, or evidence.

## Lifecycle

1. `discover`
2. `design`
3. `build`
4. `evaluate`
5. `deploy`
6. `monitor`

## Core decisions

- identify the end-to-end outcome;
- identify authoritative inputs and unstable assumptions;
- reuse existing mechanisms;
- assign durable truth and transaction boundaries;
- define final-action rechecks;
- define falsifiable acceptance tests;
- preserve rollback and residual risk.
