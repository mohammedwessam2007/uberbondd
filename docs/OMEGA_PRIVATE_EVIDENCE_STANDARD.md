# Ω Private Evidence Standard

Status: PRIVATE RESEARCH GOVERNANCE
Date: 2026-09-15

Ω does not earn a 10/10 evidence rating from architecture, unit tests, self-reported benchmark wins, or demonstrations on public/training-adjacent tasks. A 10/10 private-evidence designation is reserved for repeated, adversarial, independently verified evidence that the system reduces total verified work on hidden, held-out, structurally novel tasks without leakage or goal mutation.

## Core rule

No claim may outrun its strongest independently settled evidence. A result that cannot be independently verified remains a hypothesis, regardless of model confidence or internal consensus.

## Evidence dimensions

1. Semantic compilation: natural-language intent is converted into candidate formal contracts, ambiguity is preserved until consequentially resolved, and the selected contract passes independent semantic checks.
2. Hidden holdouts: evaluation instances are sealed before operator discovery and cannot be read by the generator, compiler, or optimizer.
3. Cross-family transfer: one engine operates across multiple formally distinct problem families without hand-written per-instance answers.
4. Cross-domain structural transport: an operator discovered in source domain A is transported through an explicit adapter into unseen domain B and reduces total verified work versus a cold B-domain baseline.
5. Independent verification: evaluator/verifier implementation, holdout generation, and candidate generation are separated. Candidate systems cannot edit their own graders.
6. Leakage resistance: contaminated, memorized, answer-bearing, or identifier-based shortcuts are detected with negative controls and mutation tests.
7. Full-cost accounting: compilation, search, verification, retries, memory maintenance, model calls, substrate overhead, decrystallization, and failed experiments are counted.
8. Robustness: gains persist over randomized seeds, adversarial variants, task perturbations, and reordered presentations.
9. Replication: a result must reproduce in a clean run from sealed inputs and immutable source identity.
10. Reality settlement: at least one claimed transferable mechanism must survive an external or mechanically grounded consequence rather than only synthetic self-consistency.
11. Compounding: later held-out tasks require less total verified work because prior verified structure was reusable, not because answers were cached.
12. Meta-generalization: an improved discovery policy must outperform its predecessor on unseen task families not used to tune the policy.

## Private evidence grades

- E0: concept only.
- E1: unit-level correctness.
- E2: bounded canary demonstration.
- E3: held-out same-family advantage.
- E4: repeated multi-family advantage.
- E5: automatic structural transfer within one formal super-family.
- E6: cross-domain transfer through explicit proof-carrying adapters.
- E7: repeated cross-domain transfer with adversarial negative controls and full cost accounting.
- E8: evidence of compounding cost reduction across a sealed sequence of task families.
- E9: replicated compounding under independent verifier separation plus at least one reality-settled outcome.
- E10: sustained private frontier-grade evidence across broad task distributions, with repeated cross-domain transfer, independent replication, calibrated failure, reality settlement, and no unresolved evaluator gap. E10 is not equivalent to ASI, unlimited compute, or proof of a singularity.

## Mandatory refusal conditions

Ω must refuse E10 if any of these remain true: hidden holdouts are absent; the generator can access grader logic or answers; improvements vanish when compiler and verifier costs are included; cross-domain transfer requires manual answer injection; only one benchmark family is represented; verifier confidence is below generator capability; results depend on source contamination; claimed gains disappear under negative controls; replication fails; or no reality-settled evidence exists.

## Privacy rule

Evidence remains private to the founder-controlled UberBond research environment unless the founder explicitly authorizes disclosure. Privacy does not lower the evidentiary threshold. A private result must still be reproducible, sealed, provenance-bound, and independently verifiable inside the private environment.

## 10/10 evidence criterion

The score is earned only when all required dimensions are green simultaneously. No averaging can compensate for a zero in leakage resistance, verifier independence, cross-domain transfer, replication, or reality settlement.
