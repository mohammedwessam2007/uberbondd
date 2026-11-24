# Pre-registration: trained evaluator (EvalVersion 3, "NNUE-style"), written 2026-11-24T00:09:57Z before training

Net: 768 (12 piece-kinds x 64 squares, side-to-move-relative) -> 128 clipped-ReLU -> 1, float32, trained in numpy.
Data: positions from Lichess puzzle DB (CC0, 16MB slice sha 405fd7fa...) excluding EVERY game (GameUrl) that
contributed a benchmark position (evidence/creative/bench.json, evidence/v8/heldout_suite.json,
evidence/v8/hard_sac_suite.json), plus positions from our archived match PGNs. Labels: Stockfish 16 search score at
depth 7 (Threads 1), side-to-move centipawns, mates clipped to +-2000. Split: by game id hash, 90% train / 10% validation.

Success (all required to make EvalVersion 3 the default):
 1. Validation loss below the EvalV2 baseline's loss on the same validation set (EvalV2 is scored through the same sigmoid loss).
 2. Equal-time match EvalV3 vs EvalV2 (same binary, 10s+0.1, 24 openings x 2 colours, 48 games): point estimate > +30 Elo
    and lower 95% bound > -30.
 3. No suite regression: held-out 110 (1s) and hard-sac 60 (300ms) solve counts not lower by more than 2 each.
Failure: any of 1-3 fails -> EvalVersion 3 stays an opt-in experiment; EvalV2 remains default; failure preserved.
Also reported, not gated: fixed-node match (50k nodes) to separate evaluation quality from speed.

## Attempt 2 (added 2026-11-24T00:25:26Z, after attempt 1 FAILED 0-48; see evidence/v9/failures/nnue_v1_diagnosis.txt)
Change: data = quiet positions (not in check, SF16 d7 best move is not a capture) from native self-play games with 6 random
opening plies (game-disjoint split by self-play game id), plus the quiet subset of match-PGN positions; NO puzzle positions.
Model: residual net, eval = EvalV2 + net (net trained on label - EvalV2 static), file magic CHNNUE2.
Same acceptance criteria 1-3 as attempt 1 (criterion 1 baseline = EvalV2 static on the new validation set).
