---
id: 2
title: Importing one constant counts as wiring a deliberately unwired module
status: open
type: methodology-gap
skill: [uberbond-orchestrator]
proposes_skill: []
siblings_checked: [task-observer, wallbreaker, uberbond-capability-assimilator]
area: verification
date: 2026-09-25
session_context: Night War round 3 on claude/uberbond-night-war-launch-glgsqc
parked_until: null
resolved: null
resolution: null
reference: commits 0bbc148, 93f3040 on claude/uberbond-night-war-launch-glgsqc
---

**Issue**: To reuse the distribution control plane's 50% concentration cap, the lawful channel router imported the constant from `src/distribution-control-plane.mjs`. The reachability ratchet then reported the control plane as reachable while `config/reachability-classification.json` still held it AWAITING_ACTIVATION behind `NO_OUTBOUND_AUTHORIZATION`. The ratchet was right to fail. Deleting the classification would have made green by silently "activating" a module the owner had deliberately left unwired, even though only a number was used.

**Suggested improvement**: When a new caller needs a constant or pure helper from a module classified AWAITING_ACTIVATION or DELIBERATELY_UNREACHABLE, move that constant into a small neutral module (here `src/distribution-concentration.mjs`) that both import, and keep the gated module's classification. Only remove a classification when the new path actually exercises the gated behaviour and its gate is released.

**Principle**: Reachability is module-granular, so sharing values across a gate must go through a neutral module; never resolve a reachability failure by deleting the gate's classification.
