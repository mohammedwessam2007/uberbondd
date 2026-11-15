# NEU205 PHOENIX checkpoint v04 — intelligence track (2026-11-03)

**Status words:** SOURCE BUILT · HOST TESTED (retrieval + Evidence API). NOT INTEGRATED, NOT PHONE
TESTED, NOT RELEASE QUALIFIED. **No Qwen answer has been generated or scored anywhere** — Qwen
weights are not reachable from this container (owner gate below).

## Recovery (done)
- Branch `ccr-62ebe621-64xxfa` (this session's designated push branch; the contract's suggested
  `neu205/knowledge-20261103` was not created). Commits this session: 8825cc7 (Android hardening
  snapshot, pre-existing uncommitted work preserved), a60aadf (pre-registration), 448d55f (Evidence
  API + harness), 6fb874b (hybrid route + report), plus this checkpoint commit.
- Owner backup reassembled from PART_1+PART_2 = 38,908,112 bytes (sha `a21ba31a…bb9`), CRC OK,
  internal manifest 35/35; book sha `c3298e8c…0940` re-verified. Contains no phone GGUF and no
  ColBERT weights (its own README says so).
- Prior hybrid lab reproduced (12 tests: 11 pass/1 skip; 16-probe BM25 6/12/15) before changes.

## Measured (host x86, CPU)
| item | result |
|---|---|
| Blind exam, frozen 719a587 engine (LIMITED-BLIND) | 23/120 (19.2 %, CI 13.1–27.1); book-supported 22/97; forced-choice 47/120; stem-only 5/120; 26 confident wrong; 9 keys unverifiable (A023, A029, A096, A107, B001–B005) |
| Book probes baseline (old engine, TEST 443) | 75 correct / 71 wrong / 297 missed; 107/107 unsupported refused |
| Retrieval TEST R@5 / R@10 / p95 | hybrid BM25+bge-int8 .851 / .903 / 52 ms (default); +cross-encoder .930 / .946 / 1.4 s; BM25 .835 / .894 / 1.2 ms |
| Exam evidence recall (NONBLIND diagnostic, BM25) | gold passage in top-5 for 71/97 book-supported items, top-10 82/97 |
| Evidence API Java | 18/18 tests; BM25 parity 150/150; WordPiece 150/150; hybrid 149/150 |
| GGUF identity reader | 2/2 tests (synthetic header) |
| llama.cpp runtime | llama-cpp-python 0.3.36 built locally (private scratch) |

## Not run / unknown
Qwen (any size) answers, TTFT, tok/s; oracle-evidence Qwen test; phone Qwen identity
(MODEL_ID_UNVERIFIED); pretrained ColBERT, EmbeddingGemma 2, Qwen3-Embedding; Android execution
of the evidence/ORT code; phone latency/RAM/thermal.

## Owner-only blockers (≤3)
1. **Network allowlist (≈2 min, $0):** Claude Code cloud environment → environment menu → Edit →
   Network access → add `huggingface.co`, `cdn-lfs.huggingface.co`, `cas-bridge.xethub.hf.co`
   (keep "Allow package managers" ticked). Unblocks official Qwen3 GGUFs (SHA-256s already pinned
   from public metadata), mxbai-edge-colbert, EmbeddingGemma, Qwen3-Embedding.
2. **Phone Qwen identity ($0, ≈5 min, read-only):** in Termux run
   `python gguf_identity.py ~/NEU205_OneTap_Starter/models/qwen.gguf --no-hash` (stdlib only, reads
   the header, changes nothing) and paste the JSON — or attach the GGUF privately.
3. (Codex track) phone install approval for the integrated APK.

## Resume
Attach `NEU205_INTELLIGENCE_v04_PRIVATE.zip`, then:
`python3 retrieval/qwen_eval.py --gguf <qwen.gguf> --work <bundle>/ret --probes <bundle>/probes/probes_p*.json --split dev --evidence oracle --out q_dev_oracle.json`
(then `--evidence retrieved`, then TEST once; then the exam with a Qwen MCQ prompt on a frozen build).
