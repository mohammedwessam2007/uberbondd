# GENESIS realization: Blackout-First Compute Planner

Candidate: `genesis-candidate-20260922-self-0009`

Status: **SOURCE IMPLEMENTED / REAL HARDWARE HYPOTHESIS UNVALIDATED**

This realization deliberately reuses the canonical `execution-leaf-continuation` owner instead of creating another queue or checkpoint model.

It adds a blackout-first wrapper and fault-injection replay:
- checkpoint after every accepted result;
- exact-source-revision resume;
- identical terminal receipt replay is idempotent;
- conflicting terminal replay is refused;
- completed dependency state survives restart;
- unreceipted work is never promoted;
- blackout traces are compared against an identical no-blackout control trace.

The fixed replay proves software-state equivalence under simulated interruption. It does not prove actual electrical, network, filesystem, battery, or hardware reliability.
