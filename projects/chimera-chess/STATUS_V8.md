# CHIMERA V8: gate status (session of 2026-11-23/24, research milestone, NOT the finished CHIMERA)

- **Branch:** `ccr-9399d410-lphg3o`. Started from `12705a720dc7d35dafb0ffe5daa0d44c18cd601f`.
- **Interim commit:** `0a99ae8827118af049c6f581a2a3ebf8227bd634`. The final SHA is in the commit log.
- **Scope:** `projects/chimera-chess/` only.
- **Every number** below is a file in `evidence/v8/` (or `evidence/` for V7).
- **Rating:** UNRATED (FIDE / human-equivalent).

## What changed

1. **Native core (C++17), now the default UCI engine (`run-uci.sh`).**
   - Profiling (`evidence/v8/profile_v7_python.txt`) showed V7 at about 7.6k nodes/s in a middlegame, 44% in evaluation and the rest in python-chess overhead.
   - The native core runs at about 2–2.9M nodes/s on this host, roughly 100× faster.
   - **Language choice:** C++ over Rust, because the compiler was available, the Android NDK is C++-native, and ONNX Runtime has a C++ API.
2. **EvalVersion 2:** mobility, weighted king-attack units, blocked and king-distance passed pawns. EvalVersion 1 is a literal port of V7's evaluation, kept for ablation.
3. **Hard-deadline time manager** with a soft (iteration-start) gate and a hard abort. Checked every 256 nodes, with a 10ms default `MoveOverheadMs`.
4. **ArtistExtension:** a root sacrifice extension. It was pre-registered, failed, and is off by default.
5. **Whole-game PV traces in the match harness,** plus cognition metrics computed from them.
6. **Held-out suites** from CC0 Lichess puzzles, disjoint from the V7 benchmark, plus the ARM64 static build and the device harness.

## Gates

| Gate | Status | Evidence |
|---|---|---|
| G0 Provenance | **VERIFIED_PASS** | V4 register SHA-256 `c6cae3f0…b149` matches in both the repo and the V8 package; 167 rows traceable in `canon/LEDGER_V8_167.csv` |
| G1 Baseline | **VERIFIED_PASS** | V7's 15 tests pass at `12705a7`; V7 is untouched and still runs via `python -m chimera.uci` |
| G2 Engine strength vs V7 | **VERIFIED_PASS** (vs V7 only) | `matches/v8n2_vs_v7tactical_40s.*`: 24–0 at an equal 40s+0.4 clock |
| G3 Defence / tactics suite | **VERIFIED_PASS** on this suite (near ceiling) | `heldout_v8_vs_v7_1000ms.json`: 107/110 vs 87/110 (detail below) |
| G4 Artist–Architect–Skeptic | **VERIFIED_FAIL** (ArtistExtension); V7 AAS still fails | `PREREG_artist_extension.md`, `hard_sac_ext_vs_base_300ms.json` (50/60 vs 50/60), `hard_sac_miss_diagnosis.txt` |
| G5 Strategic memory | **PARTIAL**: measured baseline only | `trace_metrics_sf2800.json`: reply prediction, plan continuation, replan after surprise, all from PVs. There is no learned plan state and no memory-dependent task suite |
| G6 Trained style | **NOT_ATTEMPTED** | No grandmaster corpus collected; licensing review pending |
| G7 Sixth Instinct | **NOT_ATTEMPTED** | No concept-discovery experiment |
| G8 Mobile | **PARTIAL**: cross-build and parity pass; **PHONE NOT TESTED** | `native/dist/` (detail below) |
| G9 Reproducibility | **PARTIAL→PASS for V8 scope** | Exact commands below; suites have pinned source hashes; Maia via `tools/fetch_models.sh` |
| G10 167-idea preservation | **PASS (preservation)**; 0 fully demonstrated | `canon/LEDGER_V8_167.csv` (counts below) |
| G11 Humanization | **NOT_ATTEMPTED** | — |
| G12 Final ambition | **NOT_PASSED** | — |

G2 detail:
- Equal-time evaluation ablation: EvalV2 vs EvalV1 is +137 Elo, CI [+39, +262], over 48 games at 10s+0.1.
- Fixed nodes (50k): +44, CI [−55, +150], over 48 games.

G3 detail:
- 110 held-out positions at 1s per move.
- Paired: 20 positions solved only by V8, 0 only by V7.
- By theme: defensiveMove 28 vs 23/30, quietMove 20 vs 14/20.
- The suite is near ceiling for V8.

G8 detail:
- The static ARM64 build reproduces x86 perft and fixed-depth bench results exactly under `qemu-aarch64-static` (`native/dist/PARITY.txt`).
- Host latency, idle machine, 120 positions (`latency_native_host.json`): movetime 80 → P50 48.0, P95 70.4, P99 70.6, max 70.8ms; movetime 250 → max 240.8ms; movetime 1000 → max 993.1ms; 0 violations at every setting. Cold load P50 21.8ms. The under-load run gave max 70.3ms (`latency_native_host_under_load.json`).
- No device numbers exist.

G10 detail: 9 archive-only, 2 source-missing (#143, #144), 2 verified-fail, 5 measured baselines, 3 measured via general search, 4 new bounded trials, and the rest carried from V7.

## Strength against Stockfish 16 anchors (Ubuntu 16-1build1, Threads 1, Hash 16, UCI_LimitStrength)

V8 native at EvalV2. Openings: 24 (12 from V7 plus 12 new families), both colours. The harness owns the clock.

| Opponent | TC | Games | W–D–L | Score | Elo diff, 95% CI |
|---|---|---|---|---|---|
| SF16 UCI_Elo 2400 | 20+0.2 | 48 | 23–18–7 | 66.7% | +120 [+23, +241] |
| SF16 UCI_Elo 2800 | 20+0.2 | 48 | 3–23–22 | 30.2% | −145 [−273, −48] |

Pooled MLE over 96 games: **2585, 95% CI 2504–2666 on Stockfish 16's own limited-strength scale** at 20s+0.2 (`evidence/v8/pooled_estimate_v8.json`). It sits near the 2500–2600 target, but **it is not that target**. That target is human-equivalent classical strength, which this does not measure; do not quote it as one.

Falsifiers against reading these as playing strength:
- Stockfish's limited-strength scale is self-calibrated by its developers at a different time control. It is not tested here against humans.
- 20+0.2 favours a fast searcher.
- 48 games give wide intervals.

**No FIDE or human-equivalent rating is claimed.** The 2500–2600 human-equivalent target remains unmeasured.

## What failed (kept visible)

- **ArtistExtension** (pre-registered): no difference on 60 hard held-out sacrifices.
  - Diagnosis: 7 of the 10 misses are depth-limited (solved with 1–10s) and 3 are evaluation- or pruning-limited (00rjB, 01uWs, 023Uk).
  - A root +1 ply cannot fix either class.
- **V7 creative layer:** still fails, as recorded in `STATUS.md`.
- **First native deadline test failed** (96ms). The cause was a test that sent `go` before `readyok` during cold initialisation. It is fixed by the UCI handshake, and cold load is now measured separately.

## Exact commands

```sh
sh native/build.sh                                   # host binary (g++ 13.3, -O2)
python -m unittest -v tests.test_v7 tests.test_native  # 22 tests
python tools/match.py --a native:2 --b chimera:Tactical --tc 40+0.4 --openings 12 --jobs 2 --out X
python tools/match.py --a native:2 --b native:1 --tc 10+0.1 --jobs 2 --out X
python tools/match.py --a native:2:nodes=50000 --b native:1:nodes=50000 --tc 600+1 --jobs 2 --out X
python tools/match.py --a native:2 --b sf:2400 --tc 20+0.2 --jobs 3 --out X
python tools/build_heldout_suite.py /tmp/puzzles_head.csv evidence/v8/heldout_suite.json   # 4MB slice
python tools/build_hard_sac.py /tmp/puzzles16.csv evidence/v8/hard_sac_suite.json         # 16MB slice
python tools/suite_run.py evidence/v8/heldout_suite.json out.json 1000 native:2 chimera:Tactical
python tools/suite_run.py evidence/v8/hard_sac_suite.json out.json 300 native:2:art native:2
python tools/trace_analysis.py evidence/v8/matches/v8n2_vs_sf2800_20s.jsonl native:2 out.json
python tools/native_latency.py out.json 80 250 1000
aarch64-linux-gnu-g++ -std=c++17 -O2 -DNDEBUG -pthread -static native/chimera.cpp -o native/dist/chimera-linux-arm64-static
python tools/ledger.py
```

Puzzle slices: `curl -r 0-4000000` (SHA-256 `859a76f7…0513`) and `curl -r 0-16000000` (SHA-256 `405fd7fa…21ee`) of `https://database.lichess.org/lichess_db_puzzle.csv.zst` (CC0). Then stream-decompress with `zstandard`.
