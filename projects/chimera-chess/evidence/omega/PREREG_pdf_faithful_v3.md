# PREREG PDF_FAITHFUL_V3 (iteration after seeing PDF_FAITHFUL: vs sf2685 0-6-4, 6/6 draws = threefold repetition; vs V8 0-3-5;
# motif overrides on 251/481 moves; median 910 ms/ply)
Changes: (1) #1/#177 fire on re-entering a seen position (2-fold) and are applied in centipawn units unscaled (PDF: -120 cp);
(2) motif_scale 0.35 -> 0.15; (3) reply_k 4 -> 3, reply_nodes 30k (latency). All motifs remain enabled.
Run: PDF_FAITHFUL_V3 vs sf:2685, 60+0.6, 10 games (5 openings x 2), isolated; then vs ref:2 8 games.
H1 draw rate by repetition < 6/10; H2 score > 3/10; H3 overrides 10-35% of moves (motifs still decide); H4 0 illegal/forfeits.
