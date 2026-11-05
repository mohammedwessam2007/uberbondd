# NEU205 ONE | Ω∞ Finish-Line Alternative | 2026-11-06

**Status:** source-grounded investigation + one implemented zero-dependency aggregate triage tool, 10 locally passing unit tests; **no model/code speedup, new medical accuracy, install, or release has been demonstrated**.

## Authority and source

Owner wants OnePlus 15 Android 17: one-tap Start, truly offline full 299-page book study tutor; natural + whispered phone-microphone input, local Qwen, source-backed medically correct responses spoken through built-in speaker, follow-ups, immediate Stop, no additional monetary cost. Aim >=90% on independently reviewed novel supported book questions, <=2% confidently wrong (numeric confidence not present), >=95% refusal of unsupported questions; aspiration first correct audible word within ~2.5s warm. The original archive and private evidence must remain private; no forced source rewrite, launch, phone install or paid route.

Live authoritative source: GitHub `mohammedwessam2007/uberbondd` draft PR #1605, branch `neu205/codex-v11-20261104`, checked commit `4e8e3444d695f8281a5662e68f1b70e4b1403921`; the committed V12 report is `neu205-one/docs/V12_NEW_437_EVALUATION_RESULT_2026-11-06.md`.

The new 437-question frozen-run *report* says 275/336 correct, 28/336 partial, 22/336 incorrect, 11/336 supported refused, and 101/101 unsupported refused; AI-source-reviewed not clinician certified; raw private grading packet unavailable here. Host text latency p50 31.94s; first speech clause p50 29.55s. The current source has a later speech-token decimal fix with no new blind score.

## Actual source-level bottlenecks independently inspected

- `android/app/src/main/cpp/qwen_jni.cpp` hard-codes `mp.n_gpu_layers=0` (CPU only), `cp.n_ctx=2048`, `cp.n_batch=cp.n_ubatch=64`, up to four threads, and greedy sampling; handles 180 tokens per reply.
- `qwen_jni.cpp` calls `llama_memory_clear(llama_get_memory(e->ctx),true)` before *every answer*, then replays **every** prompt token in 64-token chunks. Correct isolation, but lost prefix reuse and repeated work. Qwen3.5 is hybrid recurrent-attention; naively retaining cache risks contamination and incorrect answers.
- `NativeBrain.java` fetches up to five passages from the source index; when over 2048-token context, it removes older conversation turns and then lower-ranked passages, potentially discarding key qualifiers/relationships.
- `NativeBrain.load()` validates the entire selected GGUF on startup and loads the model. This makes a background one-time preparation/resident session worth studying, but no bypass of signed hashes or revocation.
- `ConversationService.java` uses a full utterance -> Whisper -> retrieval -> LLM -> sentence/TTS path. `SpeechClauses` waits for a complete sentence and can delay first spoken word. The evaluation did **not** measure real phone acoustic onset.
- `UtteranceSegmenter` uses energy thresholds; whispered anatomical speech may be missed. Synthetic ASR already misrecognized a medical phrase.

## New architecture: Proof-carrying two-speed speech

1. **Compile evidence, not answers.** Retain original book pages/hash. Precompute a wholly local graph of *verified source spans* with subject/relation/object, location, negation, qualifiers, numbered/list structure and context windows. Store every node's **verbatim passage ID + original PDF page + exact digest**, never a fabricated extracted quote. Ambiguous OCR/figure-only content must be labeled unavailable. This is an evidence index, **not an exam answer lookup or a replacement for Qwen**.
2. **Two Qwen answering routes using the SAME real reasoning model.** Fast route: short, precisely matched source spans and low-risk definitions, with a concise direct answer. Deep route: relationships, contradictions, why/how, multi-step physiology, uncertain source evidence and follow-ups, with broader source expansion and additional scrutiny. Train route selection on *development* cases; constrain both modes by the actual book. No speculative emergency medical instructions.
3. **Offline verifier prior to unqualified speaking.** Split generated output into atomic factual claims, verify that each is supported by the selected original span; detect polarity, laterality, pathway, nerve, artery, medication, exceptions and numbers. If support fails, ask clarification or explicitly state uncertainty rather than assert a potentially harmful claim. A small verifier adds overhead, so benchmark it and only enable when calibrated; exact substring overlap is not semantic proof.
4. **Concurrent speech pipeline without hallucinated shortcuts.** Run endpoint prediction and tentative keyword retrieval during partial speech; confirm final transcript before the answer. Feed TTS when the *first complete, source-validated meaningful clause* is ready, not on arbitrary punctuation or filler. Whisper remains the baseline; test a separately isolated streaming ASR candidate (sherpa-onnx) on **real consenting whisper and medical terms**. Run parallel candidates in development only; select by term-critical WER, time, battery and heat, not synthetic improvements.
5. **Measure before acceleration.** Instrument 7 stages locally and without recording private content: microphone endpoint, ASR, exact retrieval, native tokenizer/prefill, first Qwen speech clause, TTS queue, and **physical first correct audible word**. Keep a per-scope privacy-preserving receipt and prevent host timing from masquerading as acoustic timing.
6. **Benchmark accelerator choices on OnePlus 15.** Isolated CPU baseline; compare Snapdragon-compatible OpenCL/Vulkan/Hexagon NPU *only where pinned llama.cpp version supports the architecture and build*. Verify actual device/backend IDs; do not assume GPU faster. Try 4-versus-6 thread experiments, prompt size, n_batch, quantized KV, low-risk prefix reuse with recurrent-state tests, resident warmup and 4B vs 2B (if fully source-grounded). Measure p50/p95 first **correct audible** word, source accuracy, battery and thermal over 30 minutes. Any failed backend reverts to CPU without overwriting the known candidate.
7. **Break the signer bottleneck without impersonating a release.** Keep original app/signer immutable. Prepare an entirely new *sandbox application ID* and separate test-only certificate for owner-approved installation; only use test-signed, pinned book assets and phone microphone/notification permissions. This can enable a physical prototype even if original production signer is missing, but it is explicitly **not** the original authenticated release. Do not install without permission. Keep release identity blocked until legitimate signing custody is recovered or the owner makes an explicit, documented migration choice.
8. **Eval is version-bound.** The 437 set is now exposed to its authors/reviewers; use it for root-cause DEVELOPMENT, never as a new blind score. A fresh clinician-reviewed, source-hashed cohort must cover all 299 pages including originally excluded DEV pages, supported and unsupported, and test medical confusions. Keep full denominator; clinical correctness and latency must both pass. Numeric confidence remains unavailable unless explicitly instrumented/calibrated.

## Arithmetic and first falsifier

- Target on 336 supported: `ceil(0.90*336) = 303`, meaning **28 current misses must become fully correct**.
- `floor(0.02*336) = 6`; reviewer-marked assertive errors = 22, meaning **16 flagged errors must be corrected or prevented**. Turning a wrong answer into a refusal does *not* improve the correct-answer numerator. This establishes the required joint optimization rather than trading false claims for more abstentions.
- Recorded host first complete clause is 29,550ms median; 2,500ms aspirational limit implies **at least 11.82× reduction on that component alone**, plus ASR and real TTS time. No guaranteed hardware speedup.
- Falsifier for proposed two-speed route: if the fast route loses qualifiers or increases assertive errors in any medical-stakes stratum, **disable it**, even if it gets faster. If accelerator does not win paired real-phone time/heat with unchanged accuracy, **revert**.

## Small, actual implemented tool

`triage_results.py`: validates *aggregate-only* evaluation counts and provenance, calculates exact gap sizes and speedup, refuses nonsensical metrics/unknown review types, and **never certifies a release from host measurements**. `test_triage_results.py`: 10 real local unit tests passed 2026-11-06. `v12_aggregate.json`: reports the published **AI-graded** V12 aggregates, not a newly regraded source or private row data.

Usage: `python -m unittest -v test_triage_results.py`; `python triage_results.py v12_aggregate.json`.

## Prioritized execution and reversal

**Experiment 1 (highest priority):** instrument and benchmark *actual* JNI stage times on the same model/phone or host with isolated matched conditions. Record `n_gpu_layers=0`, cache clear and first-clause wait as known source facts; do not guess percentages attributable to each.

**Experiment 2:** benchmark validated prompt-prefix caching and GPU/CPU/HTP backends *one variable at a time* in an isolated build. Test 30-turn carryover + cancel/restart + wrong-corpus and aborted load, Qwen's recurrent cache correctness. Restore original checksum-pinned CPU code on any correctness failure.

**Experiment 3:** use preserved exposed 437 per-item grading packet if privately available to make a cause-by-cause error matrix (retrieval, context clipping, ASR, negation/laterality, source ambiguity, model unsupported hallucination). Implement source-grounded improvements and rerun **DEV only**. Then freeze a truly new clinical holdout.

**Experiment 4:** isolate a *different application ID* test build and run real OnePlus speech/thermal/acoustic acceptance only after explicit authorization, no change to original Termux or old app.

External technology grounds: original Qwen3.5-4B vendor model card and non-thinking template; llama.cpp official Snapdragon backend documentation; k2-fsa sherpa-onnx Android streaming ASR; OnePlus 15 official Snapdragon/Adreno specifications. These demonstrate **capability or availability**, not performance on this specific phone.

## Principles actually applied

Read local V7 890-source list (all headings present) and V8 52-card atlas; relevant original IDs **#0058** error economy (group the 61 misses), **#0139** latency eraser (parallel stages and avoid replay), **#0146** knowledge packet (source+claim+provenance), **#0148** knowledge router (route evidence dynamically), **#0349** formal verification layer (explicit claim/source invariants), **#0168** ignorance map (unknown figure-only/book gaps). Relevant atlas: **Ω47/15** fast quality-preserving execution, **Ω49/18** Boyd OODA, **Ω50/27** measured output, **Ω50/28** reversible options, **Ω51/34** dependency graph, **Ω51/35–36** provenance/key security, **Ω52/46** formal checks. No 52/52 methods claim and no full validation of all 890 original bodies.

**Permissions and truth:** code/protocol experiment only; original private study text, device and production main untouched; no funds spent. Until an actual phone test and clinical new holdout exist, state `PHONE_NOT_TESTED`, `MEDICAL_RELEASE_BLOCKED`, `ACOUSTIC_TARGET_NOT_PROVEN`.