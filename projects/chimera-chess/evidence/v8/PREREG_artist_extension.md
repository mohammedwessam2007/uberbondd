# Pre-registration: ArtistExtension (root sacrifice extension), written 2026-11-23T23:27:19Z BEFORE any evaluation run

Hypothesis: extending root moves tagged as material offers by +1 ply finds sound sacrifices
the baseline misses under a fixed clock, without degrading ordinary play.

Primary objective (creative, held-out): strict first-move solve rate on evidence/v8/hard_sac_suite.json
(Lichess CC0 slice 0-16,000,000 bytes, theme 'sacrifice', rating >= 2000, >= 3 solver moves,
SF16 depth 20 confirms first move; disjoint from every earlier suite id), at 300 ms/position,
paired against the same binary with ArtistExtension=false.
Acceptance: (only_ext - only_base) >= 3 AND one-sided sign test p < 0.10.

Guardrail (ordinary chess): 48-game equal-time match (20+0.2, 24 openings x 2 colours) ext vs base;
point estimate must be >= -30 Elo. Otherwise the feature stays default OFF regardless of the suite.

Negative control: the 110-position held-out suite (evidence/v8/heldout_suite.json) at 300 ms; report,
not gated.
