# UberBond Wallbreaker Canon

Status: CANONICAL PLANNING PRIMITIVE
Policy: `wallbreaker-1.1.0`
North star: `risk-adjusted cleared contribution profit / founder minute`

## Purpose

Wallbreaker is UberBond's deterministic adaptive problem-solving kernel for high-value walls, repeated failure, uncertain execution paths, and capability gaps. It exists to turn a stuck mission into a bounded evidence loop instead of an identical retry loop.

Wallbreaker is a planning and ranking primitive. It is not a consequence authority, a payment authority, a provider credential, a customer signal, or proof that an external action succeeded.

## Core loop

`wall -> compile -> generate materially different strategy families -> score -> select diverse frontier -> execute only through existing consequence gates -> classify failure -> falsify assumptions -> query Capability Genome when explicitly scoped -> replan -> verify`

Every cycle preserves the distinction between hypothesis, evidence, capability, authority, external effect, and commercial outcome.

## Authority law

Wallbreaker always carries:

- `businessEffectAuthority: NONE`
- the canonical zero external-effect ledger

It may recommend a path, lawful substitute, provider fallback, capability acquisition, deeper verification, or escalation. It may not send, spend, deploy, move money, access credentials, bypass consent, evade provider limits, impersonate authority, or create production mutation authority.

**Capability never creates authority.** A better plan still passes UberBond's existing OMNIA, policy, evidence, budget, consent, and consequence gates.

## Problem contract

A compiled wall includes:

- objective;
- explicit success criteria;
- hard constraints;
- assumptions;
- unknowns;
- semantic capability needs;
- explicit Capability Genome atom IDs when known;
- owner-reserved authority;
- risk ceiling;
- spend ceiling;
- founder-minute ceiling;
- evidence references.

A wall with no objective or no success criteria is invalid rather than silently guessed.

## Candidate tournament

Candidate strategies are evaluated on the mechanism they actually propose, not on rhetoric. The kernel accounts for:

- expected contribution economics;
- probability of success;
- founder minutes;
- monetary cost;
- risk;
- evidence strength;
- reversibility;
- novelty;
- robustness.

Candidates fail closed if they violate a hard constraint, cross an authority boundary, exceed spend/risk/founder-minute ceilings, or omit the mechanism.

Wallbreaker preserves strategy-family diversity. Five near-identical variants are not five independent fallbacks.

## Failure is evidence

Wallbreaker classifies failures as:

- `WRONG_ASSUMPTION`
- `MISSING_EVIDENCE`
- `CAPABILITY_GAP`
- `IMPLEMENTATION_DEFECT`
- `PROVIDER_FAILURE`
- `AUTHORITY_BLOCK`
- `ECONOMIC_FAILURE`
- `ENVIRONMENT_CHANGE`
- `STOCHASTIC_FAILURE`
- `VERIFIER_FAILURE`
- `IMPOSSIBLE_CONSTRAINT`
- `UNKNOWN`

A failed mechanism signature is not blindly retried when the external outcome is uncertain. Falsified assumptions prune dependent candidates. A known-safe retryable provider or stochastic failure may remain eligible only when the prior outcome is known not to have caused an ambiguous effect.

Authority blocks produce lawful-substitute, dependency-redesign, or explicit owner-escalation paths. They never produce circumvention instructions.

Provider quota exhaustion, rate limits, outages, and model unavailability are routing signals. Wallbreaker may select another legitimately configured provider/model, but it may not defeat quotas, rotate unauthorized identities, conceal provider identity, or violate provider terms.

## Capability Genome integration

Wallbreaker is integrated with the World Capability Genome runtime through the Genome's real retrieval and minimum-bundle contracts.

Two namespaces must remain separate:

1. **semantic capability labels**, such as `provider-routing` or `invoice-reconciliation`;
2. **canonical Capability Genome atom IDs**, such as an explicitly verified atom identifier.

Wallbreaker must never silently promote a human label into a Genome atom ID. Atom IDs must be supplied explicitly or produced by a separately verified mapping process.

When explicit atom IDs are present, Wallbreaker calls the real Genome retrieval and minimum-bundle logic. It can report `CAPABILITY_BUNDLE_READY` only when approved/active, security-admitted, authority-compatible capability records actually satisfy the required atoms and dependencies.

When the corpus is empty or insufficient, the truthful result is a capability gap. That gap may trigger bounded acquisition/discovery planning; it is never converted into fake availability.

At the 2026-08-31 Genome foundation checkpoint, imported approved/active world capabilities remain `0/0`. The foundation is real; the world corpus is not yet populated.

## Compute escalation

Wallbreaker emits a compute tier:

- `CHEAP`
- `STANDARD`
- `DEEP`
- `EXTREME`

This signal can inform model routing and research depth. It does not widen data access, budget, security scope, or consequence authority.

## Truth boundary

A Wallbreaker receipt proves only what the deterministic planner derived from its supplied inputs and current repository contracts.

It does not prove:

- customer demand;
- cleared payment;
- accepted delivery;
- retention or renewal;
- provider execution;
- real-world capability availability;
- external security;
- production deployment;
- causal commercial impact.

Those facts require their own canonical evidence.

## Worker law

### GPT-5.6 Sol Company Brain

Use Wallbreaker when a high-value mission is stuck, repeatedly failing, underspecified, capability-constrained, or has multiple materially different solution families. Preserve evidence classes and send explicit atom IDs only when verified.

### Claude Code / Opus Max Software Factory

Use Wallbreaker to localize implementation, verifier, environment, dependency, and capability failures. Repair the failed mechanism or select a materially different mechanism before retry. Never weaken a guardrail merely to obtain green output.

### Mission Control

Keep Wallbreaker subordinate to repository truth, consequence gates, and commercial truth. Dedupe concurrent Wallbreaker work and preserve failure receipts so the company learns from what did not work.

## Completion law

Wallbreaker is internally complete for a repository state only when:

1. its kernel and tests are present on verified `main`;
2. the Capability Genome seam is bound to the actual runtime contract;
3. the brain/worker instructions know when and how to invoke it;
4. current canon/readiness measurements describe the actual tree;
5. any merge/deployment limitations are recorded as external infrastructure truth rather than disguised as code success.

No internal completion claim may promote UberBond's commercial truth above observed customer/payment/delivery/retention evidence.
