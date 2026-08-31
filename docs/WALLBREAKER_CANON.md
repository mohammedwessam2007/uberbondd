# UberBond Wallbreaker Canon

Status: CANONICAL PLANNING PRIMITIVE
Policy: `wallbreaker-1.1.1`
North star: `risk-adjusted cleared contribution profit / founder minute`

## Purpose

Wallbreaker is UberBond's deterministic adaptive problem-solving kernel for high-value walls, repeated failure, uncertain execution paths, and capability gaps. It exists to turn a stuck mission into a bounded evidence loop instead of an identical retry loop.

Wallbreaker is a planning and ranking primitive. It is not a consequence authority, a payment authority, a provider credential, a customer signal, or proof that an external action succeeded.

## Core loop

`wall -> compile -> generate materially different strategy families -> score -> select diverse frontier -> execute only through existing consequence gates -> classify failure -> falsify assumptions -> query Capability Genome when explicitly scoped -> replan -> verify`

Every cycle preserves the distinction between hypothesis, evidence, capability, authority, external effect, and commercial outcome.

## Authority law

Wallbreaker has `businessEffectAuthority: NONE`.

It may compile, score, rank, reject, classify, query local capability state, and generate bounded next-search instructions. It may not itself:

- send email/SMS/calls;
- contact customers or prospects;
- move money;
- clear payment;
- spend provider budget;
- deploy production;
- mutate customer systems;
- change DNS;
- submit KYC;
- access credentials or private sessions;
- bypass access controls, provider quotas, or terms;
- turn a model guess into external evidence.

A Wallbreaker-selected strategy still passes UberBond's existing OMNIA/consequence gates.

## Problem compiler

A wall should be compiled into:

- objective;
- success criteria;
- hard constraints;
- assumptions;
- unknowns;
- semantic capability needs;
- explicit canonical Capability Genome atom IDs when separately known;
- owner-reserved authority;
- risk budget;
- spend ceiling;
- founder-minute ceiling;
- evidence references.

A semantic capability label such as `provider-routing` is not automatically a Capability Genome atom ID. Atom IDs must be supplied explicitly or derived through a separately verified mapping step.

## Strategy tournament

Candidate strategies are scored using expected contribution, success probability, direct cost, founder minutes, risk, evidence strength, reversibility, novelty, and robustness.

Candidates fail closed when they exceed declared authority, hard constraints, spend, founder-minute, or risk ceilings, or when they lack an actual mechanism.

The frontier preserves strategy-family diversity. Near-clones do not crowd out materially different approaches.

## Failure taxonomy

Wallbreaker classifies observed failure into:

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

The class drives a different countermove family. It does not merely append more tokens to the same failed prompt.

## No-blind-retry law

A failed mechanism signature is not retried unchanged when the external outcome is uncertain or when the failure class does not explicitly support safe bounded retry.

Known-safe provider/stochastic retry may remain eligible only when evidence establishes that repeating the same mechanism cannot duplicate an uncertain prior consequence.

Already-classified retry safety is preserved across countermove derivation. A failure object that already says `safeToRetrySameMechanism: false` cannot silently regain retry eligibility merely because it is classified again.

## Assumption falsification

When evidence falsifies an assumption, candidates relying on that assumption are pruned from the current frontier until new evidence justifies reopening them.

Environmental change may reopen previously pruned paths, but only with refreshed evidence.

## Capability Genome integration

Wallbreaker integrates with the existing World Capability Genome rather than creating a second capability registry.

The contract is:

1. keep semantic capability labels separate from canonical atom IDs;
2. when explicit atom IDs exist, query the real Genome runtime;
3. retrieve only already approved/active, security-admitted capability records;
4. compose a minimum sufficient compatible bundle;
5. return the exact retrieval/bundle receipt;
6. if no sufficient approved bundle exists, return a real capability gap;
7. route that gap into bounded discovery/acquisition planning rather than pretending an implementation exists.

Current Genome truth remains important: the foundation may be healthy while imported approved/active world capability counts are still zero. Wallbreaker must expose that state, never inflate it.

## Provider and model walls

Quota exhaustion, rate limits, outages, or capacity ceilings are routing/substitution signals when legitimate alternate configured providers exist. They are never permission to evade the exhausted provider's limits, rotate unauthorized identities, conceal provider identity, or violate terms.

If no legitimate route exists, classify the external capacity blocker honestly.

## Compute tiers

Wallbreaker emits a bounded compute signal:

- `CHEAP`
- `STANDARD`
- `DEEP`
- `EXTREME`

This indicates reasoning/search budget, not consequence authority.

More compute never relaxes law, evidence, privacy, budget, payment, or customer-reality gates.

## Sol use

Sol should invoke the Wallbreaker doctrine when:

- an opportunity thesis repeatedly fails;
- evidence conflicts;
- a distribution mechanism stalls;
- economics remain underdetermined;
- a missing capability blocks a valuable mission;
- a provider/model/research route fails;
- the team is about to repeat the same research/action mechanism without changed evidence.

Sol should return materially different strategy families and exact evidence needed to falsify each.

## Claude use

Claude should invoke Wallbreaker when:

- an implementation or verifier repeatedly fails;
- a dependency/provider is unavailable;
- stale branch/rebase conflicts block progress;
- a missing capability is discovered;
- a test exposes a wrong assumption;
- hosted CI/cloud infrastructure fails before source execution;
- a proposed workaround would widen authority or bypass policy.

Claude should repair the mechanism, switch to a lawful alternative verifier/provider, or escalate a genuine external blocker. It should not weaken tests to make the UI green.

## Verification law

Focused command:

`npm run test:wallbreaker`

Operator command:

`npm run wallbreaker -- <problem.json>`

The focused tests should attack at least:

- deterministic compilation;
- authority/spend/risk/founder-minute gates;
- quota/provider classification without evasion;
- classified failure preservation;
- retry-safety preservation;
- anti-circumvention behavior;
- semantic-label vs atom-ID separation;
- real Genome retrieval/minimum-bundle behavior;
- empty/insufficient Genome gap truth;
- failed mechanism pruning;
- falsified-assumption pruning;
- family diversity;
- adaptive compute;
- zero external-effect ledgers.

## Truth boundary

Wallbreaker can improve UberBond's problem-solving quality, but it cannot prove that UberBond has customers, revenue, demand, installed capabilities, working provider credentials, accepted delivery, renewal, or founder-independent commercial operation.

Those remain external or separately measured truths.
