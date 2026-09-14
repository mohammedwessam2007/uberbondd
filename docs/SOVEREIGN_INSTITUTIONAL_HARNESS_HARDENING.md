# Sovereign Institutional Harness Hardening V2

This layer hardens the merged Sovereign Institutional Harness without replacing it. The article donor remains a research input, not proof of profitability, alpha, hedge-fund parity, or general superintelligence.

## Why V2 exists

The first harness made the workflow institutional: specialized disciplines, gated phases, test-first construction, independent review, a separate risk layer, rollback, Proof DAG compatibility, minimum-sufficient executor selection, and bounded self-improvement.

V2 attacks the ways a sophisticated model could still make that structure look stronger than it really is.

## 1. Critical evidence must be physically bound to proof

The following gate evidence may not pass merely because an artifact row says it exists:

- failing-test receipt
- passing-test receipt
- CI receipt
- risk verdict
- rollback rehearsal

Each must be marked observed, must not be synthetic, must carry a Proof DAG node, and must pass `assertObservedProof`. Synthetic ancestry remains visible and is inadmissible as observed gate evidence.

## 2. Review independence is pairwise, not cosmetic

Reviewers may not merely use a different label while sharing the builder execution instance. V2 requires every review/authority discipline to use an isolated context, to avoid every build instance, and to be pairwise distinct from the other review execution instances.

The same underlying frontier model may still fill several disciplines. The independence claim applies to execution instances and context contamination, not to pretending that one provider is seven unrelated humans.

## 3. Proof-carrying transitions must have ancestry

A later phase cannot be called proof-carrying merely because it has its own receipt. When adjacent phases contain Proof DAG nodes, later-phase proof must descend from at least one proof in the immediately preceding phase.

This creates a verifiable chain rather than six disconnected green checkmarks.

## 4. Runtime layers must connect through explicit contracts

The runtime remains:

`DATA -> SIGNAL -> DECISION -> RISK -> EXECUTION -> MONITORING`

For every adjacent pair, at least one output contract from the upstream layer must be an input contract of the downstream layer. A six-box diagram with disconnected schemas is refused.

Versioned contracts are intended so schema drift becomes observable instead of silently crossing a layer boundary.

## 5. Authority lease is an object, not a string

Consequential action eligibility must bind a lease to:

- a lease identity;
- a subject;
- the exact mission;
- an explicit action set;
- issue and expiry times;
- attenuation-only semantics;
- non-revoked state;
- an evidence reference.

A valid lease for `READ` cannot be treated as a valid lease for `DEPLOY_CANARY`. Expired or mission-mismatched leases fail closed.

This hardening code still returns `externalEffectAuthority: NONE`. Validation of a lease never performs the action.

## 6. Reality reconciliation outranks intention

After an effect, UberBond compares the intended effect digest with observed reality. A mismatch is not massaged into success. It becomes `STOP_RECONCILE_ROLLBACK`, and the system requires both a containment switch and a rollback path.

This is the key anti-delusion layer:

`model expectation < observed reality`

## 7. The target is not "flawless by declaration"

A 10/10 label is not an architectural property. The internal target is instead a system where important claims become increasingly difficult to fake accidentally or intentionally.

The harness is considered structurally strong only when:

1. specifications are explicit;
2. architecture precedes implementation;
3. tests fail before the fix and pass after it;
4. phase transitions carry proof ancestry;
5. review instances are genuinely isolated;
6. runtime contracts connect end to end;
7. risk can stop but not enlarge authority;
8. consequential authority is exact, scoped, expiring, and revocable;
9. observed effects are reconciled against intended effects;
10. rollback exists before consequential shipping;
11. self-improvement remains proposal-only until independent evidence and authority exist;
12. customer, payment, provider, legal, market, life-outcome, and ASI claims remain external-proof questions.

## What makes the combined design stronger than the donor article

The donor article's strongest contribution is harness engineering: use one capable reasoning substrate through multiple disciplined roles and phase gates instead of one giant prompt.

UberBond adds constitutional authority separation, Context Fabric continuity, Proof DAG ancestry, Institution Cell minimum-sufficient routing, recursive revocation, temporal leases, external-proof routing, adversarial falsification, a reality reconciler, capability/provider competition, rollback, and evidence-bound promotion.

The result is not "Astra as a one-person hedge fund." It is a provider-neutral institutional cognition pattern that can be used for engineering, research, economic experimentation, and other bounded missions while preserving the distinction between capability, evidence, and authority.

## Truth boundary

This module improves internal structural assurance. It does not establish market alpha, profitability, customer demand, cleared payment, legal clearance, provider acceptance, life outcomes, or ASI. Those require their own admissible observations.
