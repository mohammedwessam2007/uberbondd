# Pre-registration: evaluator v4 (written 2026-11-24T10:14:32Z, before training)
Data: lab/data/v12/eval_v4_merged.tsv.gz, preflight PASS (evidence/v12/data/preflight_v12_merged.json): 304,129 rows,
both sides to move (50.6% white), no game/position split leaks. Biased V11 data NOT mixed in.
Candidates: (R) residual-on-EvalV2 768->128->1; (P) pure learned 768->128->1 (no hand eval at runtime). 2 epochs, seed 1.
Gate 1 (equal nodes 50k, vs ref:2, 48 games): point > 0. Gate 2 (equal time 10s+0.1, vs ref:2, 48 games, nothing else running):
point > +20 AND lower 95% bound > -40 -> promote to default-candidate; otherwise opt-in. Thresholds identical to V11 prereg.

## Results: residual Gate1 PASS (+154 [56,284] equal nodes); Gate2 FAIL (-22 [-125,78] equal time). Pure: Gate1 FAIL (-137).
## Diagnosis (evidence/v12/eval/tree_size_diagnosis.txt, nps_idle.txt): node rate 90-95% of EvalV2, but trees 0.78-2.12x larger
## at fixed depth; eval scale matches (std 434 vs 424). EXPLORATORY variant (added 2026-11-24T10:35:18Z): residual scaled by 0.5.
Same equal-time protocol and threshold; labelled exploratory (not a pre-registered confirmation).

## Exploratory x0.5 result: 20-14-14, +44 [-55,150] at 10+0.1 (point bar met, low bound not).
## CONFIRMATION pre-registration (added 2026-11-24T10:47:26Z, before running): x0.5 damped residual vs ref:2 at 20s+0.2,
48 fresh games (same 24 openings x 2 colours, different time control), idle machine. Promote to default-candidate only if
point > +20 AND lower 95% bound > -40 (unchanged thresholds). Otherwise remains opt-in.
