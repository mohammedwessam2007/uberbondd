# NEU205 PHOENIX checkpoint v05 — intelligence track (2026-11-03)

Status: SOURCE BUILT · HOST TESTED (retrieval, Evidence API, Qwen answer layer, exam).
NOT INTEGRATED · NOT PHONE TESTED · NOT RELEASE QUALIFIED (answer-accuracy bars failed on TEST).

## Results (all host)
- Retrieval TEST (443): default BM25+bge-small int8 RRF R@5 .851 / R@10 .903 / p95 52 ms (pass);
  genuine mxbai-edge-colbert-17m DEV R@1 .767 / R@5 .940 (verified weights; no Qwen gain → optional).
- Qwen answer TEST (Qwen3.5-4B, independent grading): 60.5 % correct, 10.8 % wrong, 98.1 % correct
  refusals → correct/wrong bars FAIL, refusal bar PASS. See docs/QWEN_TEST_RESULT_v1.md.
- Exam: baseline 23/120 preserved; Qwen system 74/120 (61.7 %), book-supported 69/97,
  LIMITED-BLIND post-exposure, book+model knowledge. See docs/EXAM_RESULTS_v1.md.
- Models (HF, SHA-verified): Qwen3-0.6B/1.7B Q8_0, Qwen3-4B Q4_K_M, Qwen3.5-4B Q4_K_M,
  mxbai-edge-colbert-v0-17m ONNX. Phone qwen.gguf: MODEL_ID_UNVERIFIED.

## Next highest-value work
1. Reduce confident errors: answer-verification pass (Qwen checks its sentence against the cited
   evidence, else NOT_IN_BOOK), and test Qwen3.5-9B / Qwen3-8B on the same DEV → TEST protocol.
2. Phone measurements (Codex): TTFT with GPU/NPU offload and cached system prefix.

## Owner-only blockers
1. Phone `qwen.gguf` identity (run retrieval/gguf_identity.py in Termux, read-only).
2. Phone install approval for Codex's integrated APK.

## Resume
Attach NEU205_INTELLIGENCE_v05_PRIVATE.zip; models re-download by hash from the URLs in
docs/QWEN_ANSWER_LAYER_v1.md (retrieval/... hfget-style SHA check).
