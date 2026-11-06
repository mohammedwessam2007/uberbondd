# NEU205 WARP v0.3 | Evidence-packet compiler, private development-only receipt

**Decision:** preserve an opt-in window evidence index; DO NOT promote to Android runtime or assert 150/150 correct medical answers. The new code compiles verified word-offset windows and retrieves bounded, byte-verifiable source excerpts without reading the PDF at question time. A neural/clinician-validated entailment gate and phone measurements are not yet available.

## What actually changed

- Resumed WARP v0.2's dual-route sparse page-candidate index (char 3–5 and word 1–2 grams), previously measured to find the original source page in **150/150** historical *development* questions at up to 40 candidate pages.
- Added `warp3_evidence_packets.py`: precompiled page-specific overlapping windows; two sparse window indexes; intersection with page candidates; 1–12 returned windows and 100–1,600-word hard budget; ≤4 windows per page; overlap suppression; deterministic ranking; cancellation and SHA-256 source/excerpt/offset warrants.
- The index exposes **no medical-answer confidence**. Every evidence record says `relation_verified=False` and `medical_accuracy_verified=False`. Questions mentioning laterality, directional or negative cues are flagged for an independent semantic check, not presumed true/false.
- A strict exact-quote gate rejects unquoted paraphrases and changed laterality but cannot certify that even an exact quote *answers the question*. This limitation is deliberate.
- Pure-Python implementation uses standard-library dependencies only, including previous WARP2 implementation. `pypdf` is used only by the offline private PDF extraction/benchmark, not query inference.

## Source and evaluation boundaries

- Original 299-page PDF SHA-256 `c3298e8c5f7f807604be10f7376d67f05eb315dd982276263e8f6ad2e8e70940`, extracted through hash-verified WARP2 private compiler. No private book or probes are in this package.
- Exactly 150 **exposed historical DEV** source-derived questions from the original 3 development strata. The benchmark used private reference quotations **only for aggregate scoring**; no question keys or reference quotations are in source code or GitHub.
- Baseline page-candidate recall is 150/150 at up to 40 pages. WARP3's final window selector has lower recall, because its task is to compress the candidates into a bounded prompt. *No newly blind evaluation and no generated medical answers were measured.*

| Window words | Word budget | Complete quote in first 5 windows | In first 8 windows | Mean packed words | Host query p50 | Host query p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 500 | 118/150 | 118/150 | 488 | 21.0 ms | 38.0 ms |
| 120 | 600 | **127/150** | 127/150 | 578 | 16.1 ms | 29.7 ms |
| 160 | 650 | 128/150 | 128/150 | 612 | 15.2 ms | 27.4 ms |
| 160 | 900 | **132/150** | 132/150 | 858 | 15.6 ms | 27.4 ms |
| 220 | 1,100 | 132/150 | 133/150 | 1,027 | 11.6 ms | 22.6 ms |

Metrics from `/mnt/data/neu205_warp3_lab/benchmark_aggregate.json`, actual local 2026-11-06. Query times exclude building the index and exclude Whisper/Qwen/TTS, Android, semantic verification. The 900/1100-word settings might exceed the final 2,048-token Qwen context after system instructions/history; **not shipping defaults**. Fixed 600-word budget is a research point only, not a device-proven budget.

**Falsifier:** simple phrase/character similarity did not solve the last 23 DEV quote misses within a 600-word packet; a larger snippet did not get near 150/150. No more unsupervised lexical threshold-tuning should be promoted as medical reliability.

## What 2026 research changes

1. **Uncertainty-aware Multi-Granularity RAG** (EMNLP 2026) describes choosing retrieval granularity from reliability signals and parent promotion. This supports combining narrow exact source spans with intact adjacent context rather than indiscriminately enlarging every excerpt. https://aclanthology.org/2026.emnlp-main.2104/
2. **The Bottleneck Is Retrieval, Not Reading** (EMNLP 2026) demonstrates that finding one relevant chunk is not the same as assembling *all* evidence needed for multi-fact questions. Future NEU205 metrics must include answer+evidence and qualifier coverage. https://aclanthology.org/2026.findings-emnlp.2222/
3. **Qwen3-Reranker-0.6B**, official Qwen 2025 model, is a concrete opt-in neural shortlist ranker; it was **not downloaded, instantiated, scored or benchmarked on the phone**. Evaluate only on a constrained 10–30 candidate snippet rerank, with source hashes unchanged, and compare clinical fidelity/latency before use. https://github.com/QwenLM/Qwen3-Embedding
4. **MedRAGChecker** (EMNLP 2026) provides claim-level NLI/KG-compatible verification with empirical error reductions, but is not proof of perfection and was not integrated. https://aclanthology.org/2026.findings-emnlp.399/

## Next implementation gate

**Priority A: independently verified semantically meaningful evidence.** Train/evaluate a small source-grounding reranker, on non-overlapping training items, with negative left/right, origin/insertion, cause/effect, different structure and negation counterexamples. Preserve a fresh question set from outside the development probes and outside the exposed 437 v12 evaluation. Limit rerank to a few evidence-sized windows, not 40 whole pages. Separate relevance, medical relation entailment and answer-generation accuracy metrics.

**Priority B: closed-loop error correction.** Return `NEEDS_MORE_EVIDENCE` rather than a fabricated confident answer if the selected evidence does not support all requested relations. Query again using bounded term expansion or parent/adjacent source under a fixed latency and memory budget. A refusal still counts as an error on a supported question when measuring accuracy.

**Priority C: install/phone gate.** Build isolated, test-signed debug app only with explicit owner authorization; retain original signer and existing installed packages, no forced updates; measure p50/p95 microphone-to-first-correct-audible-word on the actual OnePlus. The prior native Qwen supported-answer result stays **275/336 = 81.8%** until a fresh medically reviewed and independent evaluation is completed.

## Tests and privacy

`python -m unittest discover -p 'test_*.py'` was run on the source-only lab with **30/30** synthetic checks (17 new + 13 inherited). All actual private-source work stayed local; the deliverable contains code, tests, numeric aggregate results and research text only. It does not contain the source PDF, page text, study questions/answers, v12 437 evaluation, GGUF weights, signature/key material or phone files.

**Release:** HOLD. Source integrity ≠ semantic entailment ≠ medical correctness ≠ phone qualification. No net new spend, merge, installation or deployment.
