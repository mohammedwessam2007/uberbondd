# PREREG PDF_FAITHFUL benchmark (registered before any PDF_FAITHFUL game; a single UCI smoke move was seen: f3g5 in the Two Knights)
Architecture exactly as documents A/B: Stockfish (16; 19 unavailable, C-DEP-SF19) MultiPV=16 at sf_time_sec 0.12 s (scaled by
clock) as tactical truth, Maia3-5M human policy, all executable motifs + arbitration + gate (floor -45, max_cp_drop 135) + Skeptic.
PDF claims tested (document A §6.3, manual §6.2): vs Stockfish UCI_Elo=2685 "4.8/10 (4-2-4)"; draw rate 14-20%; per-ply compute
105-205 ms (excluding the restricted #210 delay; here WITH Maia, replies and Skeptic included).
Run: PDF_FAITHFUL vs sf:2685, 60+0.6 (PDF gauntlet uses 180+2; shortened, recorded), 5 openings x 2 = 10 games, isolated.
Then PDF_FAITHFUL vs ref:2 (frozen V8), 8 games. Report actual W-D-L, CI, draw rate, ms per ply distribution, motif activity.
