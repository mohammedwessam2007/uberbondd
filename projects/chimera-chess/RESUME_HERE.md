# RESUME HERE (CHIMERA): mission INCOMPLETE, frontier as of V13

1. `git fetch origin ccr-9399d410-lphg3o && git checkout ccr-9399d410-lphg3o && cd projects/chimera-chess`
2. `sh native/build.sh && g++ -std=c++17 -O2 -DNDEBUG -pthread native/ref/chimera_v8_996f592.cpp -o native/ref/chimera-v8-ref`
3. `python -m unittest tests.test_v7 tests.test_native tests.test_oracle`. Expect 37 OK.
4. `python tools/build_v13_ledger.py && python lab/04_check_completion.py canon/LEDGER_V13_167.json --root .`. Expect 167 accounted and 0 errors (0 validated; 20 newly attempted, 9 passed).
5. Read `STATUS_V13.md` (then `CHIMERA_FULL_REPORT.md` for V7-V13), the queue `lab/EXPERIMENT_QUEUE_V13.json` and `evidence/v13/PREREG_*.md`. The deterministic oracle cache `lab/oracle_cache.sqlite` is regenerable (gitignored).

## External data (regenerable, not in git)

| Data | Location | Source |
|---|---|---|
| Puzzles | `/tmp/puzzles16.csv` | `curl -r 0-16000000 https://database.lichess.org/lichess_db_puzzle.csv.zst`, then stream-decompress |
| Broadcasts | `/tmp/bc` | `https://database.lichess.org/broadcast/lichess_db_broadcast_YYYY-MM.pgn.zst`, 2021-01..2026-11 (CC0); then `python tools/build_named_corpus.py /tmp/bc lab/style_corpus` |
| NDK | `/tmp/ndk` | `https://dl.google.com/android/repository/android-ndk-r27c-linux.zip` (local build use only) |

## Next command (Q1: null-move behaviour under the residual net is the measured mechanism of the equal-time gap)

Implement a null-move variant for EvalVersion 3, then:

```sh
python tools/eval_search_factorial.py evidence/v14/eval/factorial_null.json 40 10 200000
```

Then pre-register and run an isolated 20s+0.2 match. Second (Q2), find the verification horizon: oracle-best hints solve only 4/51 at 200k nodes.
