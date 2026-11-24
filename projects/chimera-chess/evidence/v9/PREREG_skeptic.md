# Pre-registration: independent Skeptic (native option Skeptic), written 2026-11-24T00:17:58Z before evaluation

Mechanism: when the engine's chosen root move is a material offer (native artistic()), and a non-offer alternative exists,
re-search BOTH the offer and the best non-offer alternative with a different evaluator (EvalVersion 1 handcrafted,
or the trained EvalVersion 3 when main search is not V3) and a separate transposition table, at depth max(4, d-3),
inside the remaining hard deadline. Overrule the offer if skeptic_score(offer) < skeptic_score(alt) - 50cp.
Hypothesis: evaluator diversity removes false sacrifices without losing sound ones.

Suites (none used for tuning):
 A. evidence/creative/bench.json: 42 positives + 18 near-identical counterexamples (V7 suite), 1000 ms.
 B. evidence/v8/hard_sac_suite.json: 60 sound hard sacrifices, 300 ms.
Acceptance (all): A false sacrifices with Skeptic <= baseline - 1; A positives solved >= baseline - 1;
B solved >= baseline - 1. Guardrail: 48-game equal-time match Skeptic vs baseline at 10+0.1, point estimate >= -20 Elo.
Failure -> Skeptic stays default off, result preserved.
