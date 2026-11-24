# PREREG V13 A4 — slower-clock equal-time match (queued from V12 Q-list)
A: native:3:rscale=50:file=nnue/v12/eval_v4_residual.bin (residual NNUE x0.5)   B: ref:2 (frozen V8 EvalV2)
TC 40+0.4 (40 s + 0.4 s/move), 24 openings x 2 colours = 48 games, --jobs 2, on a 4-core host.
Isolation: every other job (headroom miners, human dataset, discovery probes) SIGSTOPped for the whole match; `uptime`
load and process list recorded before/after in evidence/v13/matches/isolation.txt.
H: Elo(A-B) > 0 with 95% CI excluding 0. Prior from A1 factorial (null-cut rate 0.51 vs 0.57, more nodes at equal depth) and
V12 equal-time results: EXPECT failure (no significant gain). Result is recorded either way.
