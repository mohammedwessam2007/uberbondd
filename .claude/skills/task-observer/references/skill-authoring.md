# Skill authoring and revision

Adapted from Eoghan Henn / rebelytics.com, CC BY 4.0, pinned source `510caad26c907793e48306262af216ff9f71c9f7`.

Use this before creating or materially editing any UberBond skill.

## Authoring sequence

1. State the observed repeated problem and evidence.
2. Search current skills/modules for an existing home.
3. Decide whether the lesson is task-specific, owner preference, project invariant, safety/authority rule, or broadly reusable technique.
4. Prefer the smallest additive change to the existing skill when appropriate.
5. For a new skill define a crisp trigger, scope, allowed tools, authority ceiling, inputs/outputs, stop conditions and examples/counterexamples.
6. Preserve attribution/licensing for adapted third-party methodology.
7. Exclude secrets/private data from reusable/public skills.
8. Stage substantial changes and test them before merge.
9. Version or receipt the result and link the observations that motivated it.

## Structural enforcement

If a rule is repeatedly ignored, do not merely make its prose louder. Prefer deterministic enforcement: validator, hook, test, schema, permission boundary, control-plane rule or fail-closed state machine.

## Confidentiality

Open-source/general skills must contain generalized methodology, not client-identifying details. Internal UberBond skills may contain project-specific structure, but still must not embed credentials, auth cookies, secret keys or raw private customer/payment payloads.

## Cross-cutting principles

A principle that applies across several skills belongs in `skill-observations/cross-cutting-principles.md` and should be propagated deliberately rather than leaving sibling skills inconsistent.
