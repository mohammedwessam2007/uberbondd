# PREREG CHIMERA Omega gauntlet (registered before any gauntlet game; only the 2-game smoke test was seen: 0-2, 0 illegal, 0 forfeits)
Harness: tools/match.py (python-chess legality + harness-owned clock; cutechess-cli unavailable in this environment).
TC 60+0.6, 8 openings x 2 colours = 16 games per pairing, --jobs 2, nothing else running (other jobs SIGSTOPped).
Pairings: C WHOLE_MIND vs A ref:2 (frozen V8); D NO_MEMORY, E NO_CREATIVE, F NO_MOTIFS, G NO_NEURAL vs ref:2; I WHOLE_MIND vs sf:2000.
(B "native without new motifs" = native:3:rscale=50 vs ref:2, already measured at 40+0.4: 21-10-17, +29.)
Hypotheses: H1 WHOLE_MIND is weaker than ref:2 (expected: motif overrides cost up to 135cp per move by the PDF's own max_cp_drop).
H2 ablation F (NO_MOTIFS) scores higher than C (motifs cost strength). H3 0 illegal moves and 0 crashes in all games.
Strength numbers are on the relative scale vs ref:2 / Stockfish UCI_Elo only, never FIDE.

## AMENDMENT 1 (written while pairing C was in progress, before ANY ablation/Stockfish game was played)
Measured cost ~6 min per game pair (Python orchestrator + Maia + reply searches + Skeptic). To fit the session, ablations D/E/F/G
and I (vs sf:2000) are reduced to 4 openings x 2 colours = 8 games each, same TC 60+0.6, same harness. C keeps 16 games.
Small samples: ablation differences are reported with CIs and treated as exploratory unless the CI excludes 0.
