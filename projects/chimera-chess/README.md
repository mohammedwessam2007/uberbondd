# CHIMERA (V8 research milestone) — offline chess engine

**Start with `RESUME_HERE.md` and `STATUS_V9.md` (then `STATUS_V8.md`).** The default engine is now the V8 native C++ core (`./run-uci.sh`, source `native/chimera.cpp`). Everything below documents V7, which remains runnable and unchanged as the baseline. Read `RECOVERY_RECEIPT_2026-11-23.md` and `STATUS.md` for V7 history.

**What V7 is.** V7 is new code. It is **not** the Codex V6 runtime, which was not recovered.
It has four parts:

- `chimera/search.py`: a classical tactical searcher with a hard wall clock.
- `chimera/creative.py`: the Artist–Architect–Skeptic layer plus a persistent plan memory (opt-in).
- `chimera/maia.py`: the Maia3-5M human policy network, run offline through ONNX Runtime.
- `chimera/uci.py`: the UCI front end.

The original 167-ID canon and all handoff evidence are preserved byte-for-byte in `canon/handoff_2026-11-24/`. The V7 status of every ID is in `canon/LEDGER_V7_167.csv`.

## Replay commands (run from this directory)

```sh
pip install chess==1.11.2 numpy onnxruntime==1.29.0 zstandard   # versions used in this session
sudo apt-get install stockfish                                    # Ubuntu 16-1build1 was used as the oracle/opponent
sh tools/fetch_models.sh                                          # Maia3-5M ONNX, pinned SHA-256 (optional for Tactical play)

python -m unittest -v tests.test_v7                               # 15 tests
python -m chimera.uci                                             # attach to any UCI GUI
python tools/match.py --a chimera:Tactical --b sf:1600 --tc 40+0.4 --jobs 3 --out evidence/matches/tactical_vs_sf1600
python tools/build_creative_bench.py /path/to/puzzles_head.csv evidence/creative/bench.json
python tools/creative_bench.py evidence/creative/bench.json out.json 2.0 Tactical,Creative,CreativeMaia
node tools/maia3js_parity.mjs fens.json > ref.json && python tools/maia_parity.py ref.json parity.json
python tools/latency_bench.py evidence/latency_host.json
python tools/ledger.py
```

**Puzzle source.** The puzzle input for `build_creative_bench.py` is the first 4,000,001 bytes of `https://database.lichess.org/lichess_db_puzzle.csv.zst` (CC0). Fetch it with `curl -r 0-4000000`, then stream-decompress it. The SHA-256 of that byte range is recorded in `evidence/creative/bench.json`.

## Rollback

Everything lives in this directory on branch `ccr-9399d410-lphg3o`. Nothing outside `projects/chimera-chess/` was changed. To roll back, delete the directory or revert the commit.
