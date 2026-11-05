# Handoff to Codex (Android track) — intelligence deliverables v1, 2026-11-03

Branch: `ccr-62ebe621-64xxfa` of `uberbond2007/uberbondd` (the session's designated branch; the
contract's suggested `neu205/knowledge-20261103` name was not created because this session may
push only to its designated branch). Directory ownership: Claude = `neu205-one/core/**/evidence`,
`neu205-one/retrieval/`, `docs/NEU205_EVIDENCE_API_V1.md`, `docs/PREREGISTRATION_*`.
Codex = Android app/audio/lifecycle/packaging. The older `neu205-one/app/` prototype is Claude's
v0.3 donor code; Codex may reuse or replace it but should not expect further edits from Claude.

## Consume
1. Java: copy package `ai.neu205.one.evidence` (+ `ai.neu205.one.core.MiniJson`) — pure Java 11,
   no Android imports, no network. Entry points: `EvidenceIndex.load(corpusJsonl, manifestJson)`,
   `EvidenceIndex.search(Map request, CancellationToken)`, `Response.toJson()`.
2. Assets (owner-private bundle, NOT in git): `corpus.jsonl`, `corpus.manifest.json`
   (`corpus_sha256` is recorded in the private bundle manifest). Verify at load; surface
   `INDEX_CORRUPT` visibly.
3. Tests to run on host before integrating:
   `javac --release 11 -d build/core $(find core/src/main -name '*.java')` then
   `java -cp build/core:build/test ai.neu205.one.evidence.EvidenceApiTests core/src/test/resources/evidence`
   → expect 18/18. Parity with the Python reference: `ParityDump` (150/150 on private DEV).
4. Qwen prompt: see `retrieval/qwen_eval.py` `SYSTEM` + `prompt_messages` (passages numbered with
   page labels, NOT_IN_BOOK refusal token, ≤ 2 spoken sentences, `/no_think` for Qwen3).

## Not verified (do not assume)
- Qwen model identity on the phone: MODEL_ID_UNVERIFIED (use `retrieval/gguf_identity.py` on the
  GGUF to fill it in). No Qwen answer accuracy has been measured anywhere yet.
- Default route decided by the pre-registered tournament (`docs/RETRIEVAL_TOURNAMENT_v1.md`):
  BM25 + bge-small-en-v1.5 int8 RRF. Enable with `EvidenceIndex.attachDense(vectorsBytes,
  vectors_sha256, 384, encoder)`; private assets `dense_bge_q8.bin` + `dense_bge_q8.manifest.json`
  + `bge-small-q8.onnx` + `bge-tokenizer.json`. Implement `DenseIndex.QueryEncoder` with ONNX
  Runtime exactly as `retrieval/encoders.py` BiEncoder (inputs input_ids/attention_mask/
  token_type_ids=0, output last_hidden_state, CLS row, L2-normalise, query prefix
  "Represent this sentence for searching relevant passages: "), tokenising with `WordPiece`.
  Without it, BM25-only still works (TEST R@5 .835).
- Nothing in this handoff has run on Android.

## Update v1.1 — answer layer selected on DEV (independently graded), frozen at f89d3e2
- **Generator:** Qwen3.5-4B Q4_K_M, `unsloth/Qwen3.5-4B-GGUF` file `Qwen3.5-4B-Q4_K_M.gguf`,
  sha256 `00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4`, GGUF arch `qwen35`
  (requires a llama.cpp build that supports qwen35; verified with llama-cpp-python 0.3.36).
  Fallback if phone memory/speed forbids 4B: Qwen3-1.7B Q8_0 (`Qwen/Qwen3-1.7B-GGUF`, sha256
  `061b54da…cb1a`): 31 vs 33 correct on DEV, ~25 % faster on host. Qwen3-0.6B is NOT usable (6/45).
- **Evidence:** `EvidenceIndex` hybrid (BM25 + bge-small int8 RRF), request `max_passages=8`, then
  `EvidenceIndex.compactSentences(question, passages, 110)` → numbered `[n] (p.X-Y) sentence` lines.
- **Prompt:** system text = `SYSTEM` in `retrieval/qwen_eval.py` (keep byte-identical so its KV
  prefix can be cached once per session); user = `Passages:\n...\n\nQuestion: <q>\n/no_think`.
  Greedy decoding, max 96 tokens; if the output contains `NOT_IN_BOOK`, say the book does not cover it.
- **Latency budget reality:** host TTFT p50 ~11–12 s is prefill-bound (~33 tok/s on a 4-vCPU host).
  Phone TTFT must be measured; GPU/NPU offload and a cached system-prompt prefix are the main levers.
- ColBERT Java code (`ColbertIndex`, `ByteBpe`, `attachColbert`) is parity-tested but NOT the default
  (no Qwen-answer gain on DEV under independent grading).
