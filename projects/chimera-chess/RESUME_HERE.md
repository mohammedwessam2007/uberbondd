# RESUME HERE (CHIMERA): mission INCOMPLETE, frontier as of V12

1. `git fetch origin ccr-9399d410-lphg3o && git checkout ccr-9399d410-lphg3o && cd projects/chimera-chess`
2. `sh native/build.sh && g++ -std=c++17 -O2 -DNDEBUG -pthread native/ref/chimera_v8_996f592.cpp -o native/ref/chimera-v8-ref`
3. `python -m unittest tests.test_v7 tests.test_native`. Expect 34 OK.
4. `python tools/build_v12_ledger.py && python lab/04_check_completion.py canon/LEDGER_V12_167.json --root .`. Expect 167 accounted and 0 errors; the release check exits 2 by design (0 validated).
5. Read `STATUS_V12.md`, then the queue `lab/EXPERIMENT_QUEUE_V12.json` (Q1–Q11, exact commands) and the pre-registrations in `evidence/v12/PREREG_*.md`.

## External data (regenerable, not in git)

| Data | Location | Source |
|---|---|---|
| Puzzles | `/tmp/puzzles16.csv` | `curl -r 0-16000000 https://database.lichess.org/lichess_db_puzzle.csv.zst`, then stream-decompress |
| Broadcasts | `/tmp/bc` | `https://database.lichess.org/broadcast/lichess_db_broadcast_YYYY-MM.pgn.zst`, 2021-01..2026-11 (CC0); then `python tools/build_named_corpus.py /tmp/bc lab/style_corpus` |
| NDK | `/tmp/ndk` | `https://dl.google.com/android/repository/android-ndk-r27c-linux.zip` (local build use only) |

## Next command (Q2: the evaluator's remaining bottleneck is search-tree growth, not evaluation quality)

```sh
python tools/match.py --a native:3:rscale=50:file=nnue/v12/eval_v4_residual.bin --b ref:2 --tc 40+0.4 --jobs 2 --out evidence/v13/matches/eval4R50_vs_ref_40s
```

Run it with nothing else running, under a new pre-registration. In parallel, implement node-limited SPSA retuning of the RFP/futility/LMR margins for EvalVersion 3.
