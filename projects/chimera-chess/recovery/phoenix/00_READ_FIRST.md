# CHIMERA recovery: read first

**Branch:** `recovery/chimera-phoenix-total-transfer`
**Project:** `projects/chimera-chess/`
**Base:** the full history of `ccr-9399d410-lphg3o` up to `87f6b5d`, plus the runtime assets in `recovery/phoenix/assets/`. Every asset has a SHA-256 in `SHA256SUMS` and `MANIFEST.json`.

## NOT recovered: Codex work after `87f6b5d`

None of the following existed in the environment that made this transfer, nor on GitHub, so it could not be transferred:
- Codex commit `f65025f5e8e76bbbdb10bf8e9486108491836e40`
- the ~600 MB Codex checkpoint
- the incremental bundle's prerequisites
- the frozen confirmation gauntlet: 2/50 vs Stockfish 19 at 180+2, 25 paired openings, its journal and frozen binaries

Recover these only from Codex's own workspace. Do not rebuild a candidate and present it as the frozen one.

## Start here

- `HANDOFF_CODEX_OMEGA.md` covers state, percentages, defects and next steps. Read it before anything else.
- `STATUS_V13.md` and `CHIMERA_FULL_REPORT.md` cover history.
- Source:
  - `chimera/omega/` holds the CODEX220 runtime.
  - `native/chimera.cpp` is the native engine.
  - `canon/` holds the registries (CODEX220, CORE167).
  - `canon/pdf_sources/` holds the PDFs.
- Tests are in `tests/`. Evidence (games, PGNs, traces, calibration) is in `evidence/`.

## Restore and run

```sh
cd projects/chimera-chess
python3 recovery/phoenix/restore.py          # Maia model, oracle cache, datasets, native binaries (hash-verified)
sh native/build.sh                           # or use the restored x86-64 binary
pip install chess==1.11.2 numpy onnxruntime==1.29.0
python3 tools/omega/check_codex220.py
python3 -m chimera.omega.uci                 # setoption name Profile value PDF_STYLE_V5
```

Stockfish comes from the OS package `stockfish 16`. Stockfish 19 is not included.
