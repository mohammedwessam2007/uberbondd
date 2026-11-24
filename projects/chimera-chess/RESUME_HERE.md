# RESUME HERE (CHIMERA)

1. `git fetch origin ccr-9399d410-lphg3o && git checkout ccr-9399d410-lphg3o`. Check HEAD against the last commit that touches `projects/chimera-chess/`.
2. `cd projects/chimera-chess && sh native/build.sh && python -m unittest tests.test_v7 tests.test_native`. Expect 22 OK.
3. Read `STATUS_V8.md` (current gates), then `STATUS.md` (V7 history), then `canon/LEDGER_V8_167.csv`.

## Next experiments, ordered by evidence

1. **Evaluation and depth, the strength bottleneck.**
   - The 3 evaluation-limited hard misses (00rjB, 01uWs, 023Uk) and V7's positional-loss diagnosis both point at evaluation.
   - Next step: a small NNUE-style network (768→64→1), trained on positions from `evidence/v8/matches/*.pgn` plus puzzle FENs, labelled by SF16 at depth 10–12. Split by game, then by opening.
   - Gate it with `tools/match.py --a native:3 --b native:2 --tc 10+0.1` (48+ games) and the hard suite.
2. **A real Skeptic.**
   - Make it independent: a different evaluator, either NNUE or the Maia3 value head, verifying sacrifices.
   - Trigger it on criticality: best-move instability across iterations, or score swing above 60cp.
   - Never take time from easy positions.
   - Pre-register it the same way as `evidence/v8/PREREG_artist_extension.md`.
3. **Memory-dependent task suite.** Same board, different histories; this needs a learned plan-state head. Compare it against the PV baseline in `evidence/v8/trace_metrics_sf2800.json`.
4. **Style corpus:** do a licensing review of historical master PGN sources before downloading anything.
5. **Device:** follow the owner action in `native/dist/device_bench.sh`.

## Next command

```sh
cd projects/chimera-chess && python tools/match.py --a native:2 --b sf:2800 --tc 60+0.6 --jobs 3 --out evidence/v8/matches/v8n2_vs_sf2800_60s
```

This is an anchor at Stockfish's own calibration time control.
