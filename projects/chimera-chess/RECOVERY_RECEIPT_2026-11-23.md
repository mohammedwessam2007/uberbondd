# CHIMERA — Opus takeover recovery receipt (2026-11-23 UTC)

## G1: Exact Codex V6 runtime — RECOVERY BLOCKED

Searched in this session, with the result for each:

| Location | Result |
|---|---|
| Uploaded attachments (4 files) | Takeover ZIP `318b68bd…` (SHA-256 `fa513c52…c09d`), prompt ZIP `773c905d…` (`348c12ef…86f7`), and two prompt `.txt` copies. **No V6 checkpoint ZIP and no Android ZIP.** |
| Whole container filesystem (`find / -iname '*chimera*'`, `*maia*`, `*searchless*`, `*.onnx`) | Only the uploads, unrelated UberBond `capability-chimera` files and onnxruntime sample models. |
| Git remote `mohammedwessam2007/uberbondd` (all refs) | No CHIMERA chess branch. The `astra/*` branches are unrelated UberBond work. |
| Nested historical ZIPs (`ASTRA_V5/V6/V7` packages) | Instruction and evidence packages, **not** the executable (as the handoff itself warns). |

Not recovered, so not claimed: the V6 source, `verify.sh`, `run-uci.sh`, `test_v6`, the V6 exports `maia5.onnx` / `searchless9.onnx`, native binaries, 128 V6 game PGNs (9,882 plies / 7,132 boards), the V6 ledger, the Android ARM64 ZIP, and the Phase 1 checkpoint ZIP (`47a55d34…50d4`).
The V6 claims stay **Codex claims pending replay**. The readable V6 evidence (clean-check log, REPRODUCE.md, creative.json, endgames.json) is kept byte-identical under `canon/handoff_2026-11-24/03_V6_CODEX_EVIDENCE/`.

## G0: Archive continuity — VERIFIED PASS

- The handoff `90_INTEGRITY/verify_file_hashes.py` reports **44/44** files verified, both in scratch and in the repository copy.
- `CHIMERA_OMEGA_V4_MASTER_167_ID_REGISTER_2026-11-23.txt` has SHA-256 `c6cae3f0cd1e658196d3ca7d053c0e57025e3fdd064e3a3f0eafb568fdbdb149`, which equals the manifest entry. `tools/ledger.py` re-asserts this hash on every run.
- The whole handoff is preserved under `canon/handoff_2026-11-24/`: canon, Phase 1 and V6 evidence, the v0 source and ZIP, the research kit, historical handoff ZIPs and the takeover prompt.

## What V7 is (and is not)

V7 is **new work built in this session**. It is not the recovered V6 and does not replace it. It is a classical tactical searcher plus the Artist–Architect–Skeptic layer, with a verified Maia3-5M policy component. If V6 is ever recovered, it should be compared with V7 under `tools/match.py`, and neither should be relabelled as the other.
