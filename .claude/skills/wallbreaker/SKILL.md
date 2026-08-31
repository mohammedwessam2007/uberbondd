---
name: wallbreaker
description: Use UberBond's governed Wallbreaker kernel when a material mission is stuck, repeatedly failing, capability-constrained, verifier-constrained, or has multiple materially different solution families. Turns failures into evidence, prevents blind retries, and queries the Capability Genome only with explicit atom IDs.
---

# Wallbreaker

Use this skill for a real wall, not for routine work that already has a clear dependency-satisfied path.

## Start

1. Refresh current repository truth.
2. Read `docs/WALLBREAKER_CANON.md` and `docs/CAPABILITY_GENOME_CANON.md`.
3. Identify the exact wall, current evidence, current authority ceiling, risk/spend/founder-minute ceilings, and what has already failed.
4. Prefer the repository kernel through `npm run wallbreaker` or direct use of `src/wallbreaker.mjs` when operating in a real repo host.

## Compile the wall

Capture:

- objective;
- success criteria;
- hard constraints;
- assumptions;
- unknowns;
- semantic capability labels;
- explicit Capability Genome atom IDs only when verified;
- evidence refs;
- owner-reserved authority;
- risk, spend, and founder-minute ceilings.

Do not guess missing authority or invent a Genome atom ID from a human label.

## Generate a tournament

Create materially different mechanism families, not cosmetic variants. Score and compare them on expected contribution, probability, founder minutes, cost, risk, evidence, reversibility, novelty, and robustness.

A candidate that violates authority, a hard constraint, spend/risk/founder-minute limits, or has no mechanism is ineligible.

## Treat failure as evidence

Classify the failure before retrying. Preserve:

- failed mechanism signature;
- whether the external outcome is uncertain;
- falsified assumptions;
- new constraints;
- missing capabilities/atoms;
- evidence refs.

Do not repeat an unchanged mechanism after an uncertain external outcome. A retryable provider/stochastic failure may retain the mechanism only when prior outcome safety is actually known.

Authority failures lead to lawful substitutes, dependency redesign, or explicit escalation, never circumvention.

Provider/model quota or outage leads to legitimate routing/fallback, never quota evasion or identity rotation.

## Capability Genome

Semantic labels and canonical atom IDs are different namespaces.

Only query the real Genome with explicit atom IDs or a separately verified mapping. If the Genome returns no approved/security-admitted bundle, preserve the gap and route to bounded discovery/acquisition. Do not call a discovered or unverified capability available.

## Verification

A Wallbreaker plan is not execution proof. A selected candidate still passes current OMNIA/consequence gates and must leave the normal business-effect/evidence receipts.

If the verifier itself fails, classify `VERIFIER_FAILURE`, repair or substitute the verifier, and withhold the success claim.

## Handoff

Leave:

- problem/receipt ID;
- selected mechanism and diverse fallbacks;
- rejected mechanisms and reasons;
- failure classes;
- invalidated assumptions;
- capability-resolution status;
- compute tier;
- exact external-effect ledger;
- remaining external blockers.

Never promote planning output into revenue, customer, payment, delivery, retention, or production truth.
