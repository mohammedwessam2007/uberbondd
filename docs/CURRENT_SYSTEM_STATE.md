# UberBond — Current System State

**This file is the canonical present-tense software/commercial state.** Historical detail from the pre-checkpoint version is preserved byte-for-byte under `docs/archive/2026-08-30-pre-checkpoint/`. Repository code and newer exact external evidence still outrank this prose.

Last reconciled: **2026-08-31**
Branch: `gpt/wallbreaker-kernel-20260831`
Reconciled from source state through: `46e893c252b94d6d7216fbcf1c7fbb222a9bee06`

Machine-readable companion: [`artifacts/system-readiness.json`](../artifacts/system-readiness.json). That generated artifact still represents the 2026-08-30 checkpoint until a fresh readiness run is recorded; this prose is updated narrowly so the live reachability ratchet reflects the current branch rather than silently carrying stale module counts.

## Commercial truth

| Measure | Current truth |
|---|---:|
| Real customers | **0** |
| Cleared revenue | **$0.00** |
| Accepted deliveries | **0** |
| Retained customers | **0** |

No architecture, creator claim, generated opportunity, model output, preview deployment, internal test, or research ranking may promote those numbers.

## Verified software evidence

The most recent full reconciled source-changing checkpoint before the 2026-08-31 capability/Wallbreaker additions recorded:

| Gate | Result |
|---|---|
| Syntax | **628 files parse** |
| Deterministic | **2897 tests, 2846 pass, 0 fail, 51 skipped** |
| Relay safety | **150/150** |
| Real PostgreSQL | **167/167** against PostgreSQL 16.13 |
| Mutation war | **100 mutations, 100 killed, 0 not killed** |
| Browser | **1/1** |
| Dependency audit | **0 vulnerabilities** |

The 51 deterministic skips are the environment-dependent real-PostgreSQL suites excluded from that run; they have separate real-PostgreSQL evidence above. Hosted GitHub Actions jobs that receive no runner and execute zero steps remain `INFRASTRUCTURE_NON_EVIDENCE`.

The 2026-08-31 Wallbreaker branch adds focused hostile tests in `tests/wallbreaker.test.mjs`; they do not become verified evidence until an exact-head deterministic/build gate records the result.

## Reachability

**119 of 257 `src` modules have no entry point at all**.

| Reachability class | Modules |
|---|---:|
| Reachable from production | 127 |
| Reachable only via an operator script | 11 |
| **No entry point at all** | **119** |

The prior 255-module prose became stale after the governed external-capability control plane landed. `src/external-capability-control-plane.mjs` is reachable through operator scripts. `src/wallbreaker.mjs` is likewise operator-reachable through `scripts/wallbreaker-plan.mjs`. Neither file should be counted as a production execution path merely because it exists.

The existing `src/payment-operator-attention.mjs` remains production-reachable through `founder-command-center -> prometheus-control-tower -> job-handlers`.

## Wallbreaker v1

The branch contains a deterministic Wallbreaker problem-solving kernel in `src/wallbreaker.mjs`, an operator CLI in `scripts/wallbreaker-plan.mjs`, hostile focused tests, and `docs/WALLBREAKER_CANON.md`.

Wallbreaker v1:

- compiles a wall into objective, success criteria, constraints, assumptions, unknowns, capability needs, risk/spend/founder-minute ceilings, and evidence refs;
- ranks candidate strategies by expected contribution, probability, founder minutes, cost, risk, evidence, reversibility, novelty, and robustness;
- preserves strategy-family diversity rather than filling the frontier with near-clones;
- classifies failures into assumption, evidence, capability, implementation, provider, authority, economics, environment, stochastic, verifier, impossible-constraint, or unknown classes;
- prunes candidates that rely on falsified assumptions;
- prevents unchanged failed mechanism signatures from being blindly retried;
- emits targeted Capability Genome queries for capability gaps;
- treats provider quota/outage as a substitution/routing problem without authorizing provider-limit evasion;
- treats authority blocks as lawful-substitute or escalation problems, never circumvention;
- emits an adaptive compute tier for downstream model routing;
- carries `businessEffectAuthority: NONE` and the canonical zero external-effect ledger.

This is a real deterministic orchestration primitive, not evidence that a million-solution search, heterogeneous model swarm, Capability Genome, or autonomous external execution is already live. Those remain later integration layers.

## PR #251 payment-attention policy

`classifyPaymentEvent()` remains the payment-truth authority. The founder command center interprets its already-safe classifications as follows:

- `REVIEW_REQUIRED` -> operator attention.
- `PENDING_OR_UNCLEAR` with only `subscription-status-on_trial` -> expected pending, quiet.
- Every other `PENDING_OR_UNCLEAR` -> anomalous pending, operator attention.
- Pending with no reason -> fail visible.

This changes **operator visibility only**. It does not clear money, unlock fulfilment, create revenue, mutate provider evidence, call a provider, or widen authority.

Independent focused proof at the prior checkpoint covered nine cases, all passing. A hostile mutation that treats every pending state as expected makes five of the nine protections fail.

## Memory integrity

A manual readiness refresh accidentally compacted away hundreds of lines of capability evidence in an intermediate branch commit. It was caught before merge. Commit `a7d25ab08781307002f663dcfa903983ff5c54b2` restored the full capability registry. The old canon, handoff and bootstrap were then archived byte-for-byte at commit `991efdee100616cd6d811a92194d611fa3097a14`.

The current crash checkpoint remains `docs/memory/UBERBOND_CHECKPOINT_2026-08-30.md` until a newer durable checkpoint explicitly supersedes it.

The older machine memory entry that described Everest as unresolved is superseded: repository evidence establishes **Everest -> SUMMIT 100 -> BLACK SKY -> Reality Activation**, with the Everest receipt verdict `EVEREST_PARTIALLY_CLOSED`.

## AI company / Trinity

- **GPT-5.6 Sol, Company Brain:** market sensing, opportunity research/tournaments, economics, pricing, competitor/company research, portfolio allocation and world-class distribution strategy.
- **Claude Code / Opus Max, Software Factory:** bounded engineering, adapters, cloud/runtime, persistence, tests, hostile verification, recovery and deployment evidence.
- **Mission Control:** repository continuity, contradiction reconciliation, review, deployment truth, consequence gates and founder-minute minimization.

AI employees are bounded roles in one governed company. Intelligence and capability never create consequence authority.

The repository contains a real Claude engineering orchestrator, but a live Claude Code run still requires the verified isolation/provider runtime defined by that contract. The GitHub relay worker is verification-only and is not evidence that Claude executed.

Wallbreaker is subordinate to these existing worker, model-routing, capability, consequence, and evidence systems. It is not a fourth independent authority layer.

## Cloud truth

The connected Vercel account exposes team `team_A9LnjIuS5PU0rNetsHMu1N0r` and full project `prj_RWUPf14w1xIz9NK92AbNW5z7qDCg` (`uberbondd`).

Exact-current-main production at `5cb18b852b29b2c90f66869544e58a10531009e9` reached the deterministic suite and failed because this file still claimed 255 modules while 256 existed. That is a real stale-canon/reachability failure, not a provider-rate-limit failure. This branch repairs that stale claim while adding Wallbreaker, but exact-head cloud success must still be observed before merge.

## External gates

Internal software cannot manufacture the following:

- a real provider credential plus separately authorized spend;
- lawful sender infrastructure and measured sender health;
- real customer demand/commitment;
- provider-origin cleared payment;
- accepted delivery, refund/dispute, renewal and expansion evidence;
- payment-provider KYC/payout and exact applicable legal/tax treatment;
- sustained unattended operation over real elapsed time;
- a human escalation transport;
- verified isolation plus a real Claude execution runtime.

Wallbreaker must treat these as external/authority constraints when applicable. It may search for lawful substitutes or dependency redesigns, but cannot turn a missing authority or real-world proof gate into permission to bypass it.

## Immediate frontier

1. Finish the exact-head Vercel syntax + deterministic gate for the Wallbreaker branch.
2. Repair any source/test/reachability defect revealed by that gate rather than weakening the guardrail.
3. If the candidate is green and remains bounded, merge it with expected-head protection and verify new `main` plus exact production deployment state.
4. Connect Wallbreaker to the Capability Genome once that system actually exists on repository truth; do not pretend retrieval requests are installed capabilities.
5. Continue the pre-customer frontier through real scheduler/provider/distribution/payment activation, prioritizing real economic proof over architecture volume.

Zero customer contact, zero provider/model execution, zero purchases, zero credential/DNS changes, zero money movement, and zero production mutation were authorized or performed by this Wallbreaker implementation branch.
