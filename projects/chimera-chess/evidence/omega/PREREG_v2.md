# PREREG WHOLE_MIND_V2 (registered before any V2 game)
Diagnosis from the gauntlet: NO_MOTIFS also lost 0-1-7 -> the runtime starves the native search (MultiPV 16 at ~120-240k nodes,
~0.3-0.85 s of Python/Maia/reply/Skeptic overhead) rather than motifs alone causing the loss.
Change: native root search gets 60% of each move's clock with MultiPV 4; Artist, all motifs, Maia, reply evidence (k=3) and the
Skeptic stay active. PDF preset gate values unchanged (floor -45, max_cp_drop 135).
Run: WHOLE_MIND_V2 vs ref:2, 60+0.6, 4 openings x 2 = 8 games, isolated. Then WHOLE_MIND_SOUND (prereg already filed).
H1: V2 scores higher than WHOLE_MIND (0/16). H2: motifs still change >= 10% of decisions in V2. H3: 0 illegal / 0 forfeits.
