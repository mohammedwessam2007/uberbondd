# Qwen answer layer v1 — model, evidence budget and latency (host evidence, 2026-11-03)

Qwen is the only answer generator. Retrieval supplies verbatim passages; Qwen answers or says
NOT_IN_BOOK. All numbers: host x86 4 vCPU, llama-cpp-python 0.3.36 (native AVX2/AVX-512 build),
greedy decoding, max 96 tokens, `/no_think`, KV cache reset per question. **Not phone numbers.**

## Models tested (all downloaded from Hugging Face, SHA-256 verified against Hub LFS metadata)
| model | source | sha256 | host prefill / decode tok/s |
|---|---|---|---|
| Qwen3-0.6B Q8_0 | Qwen/Qwen3-0.6B-GGUF | 9465e63a…b031 | — / — (TTFT p50 3.8 s) |
| Qwen3-1.7B Q8_0 | Qwen/Qwen3-1.7B-GGUF | 061b54da…cb1a | ~42 / ~9 |
| Qwen3-4B Q4_K_M | Qwen/Qwen3-4B-GGUF | 7485fe6f…fdf5 | ~31 / ~6 |
| Qwen3.5-4B Q4_K_M | unsloth/Qwen3.5-4B-GGUF (arch `qwen35`) | 00fe7986…11a4 | ~33 / ~5 |
The owner's phone `qwen.gguf` remains MODEL_ID_UNVERIFIED (run `retrieval/gguf_identity.py` on it).

## DEV results — independent, config-blind grading (45 supported + 30 unsupported)
| configuration | correct | partial | wrong | refused | unsupported refused | false answers | TTFT p50 / p95 |
|---|---|---|---|---|---|---|---|
| 1.7B · hybrid · 110-word sentences | 31 | 4 | 4 | 6 | 29/30 | 1 | 9.4 / 12.8 s |
| 1.7B · ColBERT · 110-word sentences | 31 | 4 | 4 | 6 | 27/30 | 3 | 9.5 / 12.7 s |
| 1.7B · hybrid · 5 chunks | 35 | 5 | 2 | 3 | 27/30 | 3 | 18.0 / 23.6 s |
| 4B · hybrid · 110-word | 31 | 5 | 6 | 3 | 28/30 | 2 | 11.4 / 15.6 s |
| **3.5-4B · hybrid · 110-word** | **33** | 3 | 4 | 5 | **30/30** | **0** | 12.0 / 15.7 s |
| 1.7B · ORACLE evidence (3 chunks) | 32 | 4 | 0 | 9 | 27/30 | 3 | 10.6 / 14.1 s |
Automatic (strict phrase) DEV scores, for reference only: 0.6B 6/45 correct, 34 refused; 3.5-4B with ColBERT evidence 32 correct / 10 wrong (vs 31 / 9 with hybrid) — no gain.

## Findings
1. Evidence size drives latency almost linearly (prefill-bound). 110 verbatim words ≈ 2× faster
   than 5 chunks; 5 chunks gains ~4 correct answers for 1.7B but doubles TTFT; 220 words was worse.
2. With gold evidence the 1.7B still refuses 9/45 → remaining errors are model capability, not retrieval.
3. Pretrained ColBERT improves retrieval R@1 (.767 vs .620) but did not improve Qwen answers.
4. No model meets the pre-registered ≤5 % confidently-wrong bar on DEV (best 8.9 %).

## Phone latency implication (analysis, not measurement)
Host TTFT 9–12 s at ~30–40 prefill tok/s. To reach the owner's ≤2.5 s p50 target the phone must
prefill ~350–400 prompt tokens in ≲2 s (~200 tok/s) — plausible only with GPU/NPU offload
(llama.cpp OpenCL/Hexagon) or a cached system-prompt prefix; CPU-only on the phone is UNKNOWN and
must be measured. Recommended prompt assembly: system prompt as a reusable KV prefix + ≤110-word
verbatim evidence (`EvidenceIndex.compactSentences`) + question; stream the first sentence to TTS.

## TEST (held-out, run once with the frozen configuration f89d3e2)
See `docs/QWEN_TEST_RESULT_v1.md` when complete.
