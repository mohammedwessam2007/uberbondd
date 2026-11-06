# NEU205 v12 — Claude sealed result + combined Claude/Codex handoff (2026-11-06)

Public, code-only. Questions, answers, keys, book text, model and APKs stay owner-private.
Grades are provisional AI source reviews, **not clinician validation**.

## 1. Claude's frozen v12 sealed evaluation (the run Codex could not recover)

- Set: 336 supported + 101 unsupported, authored by 3 isolated agents (pages 61–299; 1–60 reserved),
  every quote re-verified against fresh `pdftotext`, frozen before any solver run
  (manifest SHA-256 `3b4eafd277e5c4eab216ea10d8f73211d5db3246147abba9adc41bd4f009a134`).
  This is a different set from Codex's 437 (also 336+101 by coincidence).
- Config frozen at Claude-local `cbf1804` (backend == v12 commit, clean diff): Python companion
  `bridge.py` baseline path, 5 BM25 passages, v12 prompt + gate NONE<.25/WEAK<.45, Qwen3.5-4B
  Q4_K_M `00fe7986…`, llama.cpp `c6a0ff1`, ctx 2048, CPU, `--cache-ram 0`.
- 437/437 predictions, one run header, 0 infrastructure rows, 41 evidence-gate refusals; sealed
  file SHA-256 `e2c0fe0748ff1ceed4d121a648ee0174f7cfca82cc647ef4e7b5879c234ea5f9`, locked before
  unblinding. Run survived two container restarts by resuming only missing ids.
- Four independent blinded graders (shared rubric, no solver/config access):

| Gate | Target | Result |
|---|---|---|
| Supported fully correct | ≥303/336 (90%) | **296/336 = 88.1%** (Wilson 95% 84.2–91.1) — **FAIL by 7** |
| Confidently wrong | ≤6/336 (2%) | **4/336 = 1.2%** — PASS |
| Unsupported refused | ≥96/101 | **101/101** (96.3–100) — PASS |

  Also: 23 partial, 13 supported abstentions. Sensitivity: 3 unsupported answers rejected a false
  premise instead of saying "not in the book"; counting them as false answers gives 98/101 (still pass).
  Empty gate refusals were counted as refusals (the app speaks a not-found message for them).
- Host latency (text pipeline, not phone/acoustic): TTFT p50/p95 8.28/10.39 s; total 11.61/15.41 s.
- This set is now exposed; it must not be reused as a blind test.

## 2. DEV evidence behind v12 (blinded paired, 150 supported + 40 exposed-unsupported)

baseline (pre-v12) 119 correct / 8 wrong / 39 refusals → v12 124 / 5 / 39; 8 items improved, 3
correct→partial, 0 new wrong. v12.1 (8 passages) rejected: no gain, +39% TTFT.

## 3. Combined state with Codex's work

| Area | Codex (public) | Claude | Combined decision |
|---|---|---|---|
| Native in-app Qwen JNI | `qwen_jni.cpp`, abort-callback cancel, 53 Android tests, unsigned reproducible APK | own JNI (`9437e7a`, local) | **Use Codex's**; Claude's JNI retired as duplicate |
| Corpus pin | updated to v05 `d886e875…` | approved-set fix | Codex's version kept |
| Prompt/gate | native used pre-v12 prompt | v12 measured on DEV + sealed | **v12 prompt ported into Codex `NativeBrain`** (this branch) |
| Accuracy | own 437 set, native baseline-style: 275/336 (81.8%), 22 wrong, 101/101 | own 437 set, v12 companion: 296/336 (88.1%), 4 wrong, 101/101 | Different sets — not a paired comparison; consistent with DEV: v12 cuts wrong answers |
| Retrieval research | WARP v0.2/v0.3, Atlas reranker (rejected), packing sweeps | k=8 rejected | Not promoted |
| Eval tooling | sealed_source_eval v2 (400/100 floor) | runner, blind packets, compiler | Both kept |

## 4. Remaining (honest)

1. Supported accuracy 88.1% < 90%: largest classes PARTIAL (23) and ABSTAIN (13). Improve on DEV only,
   then a **new** sealed set (Codex's 757-row draft pool needs dedupe/review first).
2. v12-in-native is ported but its native answers are not yet re-measured (host JNI run needed).
3. Release signing identity unavailable; no ARM64 signed release of the merged tree.
4. No physical OnePlus 15 test: mic → Whisper → Qwen → speaker latency, Stop, thermal, 30-turn.
5. Clinician review of any accuracy claim.
6. Claude's GitHub push returns 403; this branch travels as patches/bundle.

## 5. v13b (adopted after the sealed run; measured on EXPOSED items only)

Failure analysis of the 40 sealed misses: PARTIAL answers dropped a second required element although the
gold page was retrieved (brevity rule); 6/13 abstentions had the gold page (over-literal refusal); 7/13 were
retrieval misses. Blinded paired grading (one independent AI grader) on 100 exposed supported items (all 40
misses + 60 random correct controls) and 70 exposed unsupported items:

| Variant | Correct | Partial | Abstain | Wrong | Refusals | TTFT median (host) |
|---|---|---|---|---|---|---|
| v12 (frozen sealed config) | 54 | 29 | 13 | 4 | 69/70 | 8.0 s |
| v13 (complete + looser refusal) | 70 | 11 | 9 | **10** | 69/70 | 9.5 s — **rejected (wrong x2)** |
| **v13b (complete only for multi-part, add nothing, strict refusal)** | **65** | 19 | 12 | **4** | 69/70 | 9.1 s — **adopted** |

v13b is in both `backend/bridge.py` and native `NativeBrain`. This is NOT a new blind score: the items are
exposed and include the targeted failures. A fresh sealed set is required to claim the 90% gate.

## 6. Merged signed APK (owner-private, not in Git)

Codex tree + Codex JNI (`libneu205_qwen.so`, NDK r29 29.0.14206865, llama.cpp c6a0ff1, 16 KiB aligned)
+ v13b native prompt + Whisper-small + verified corpus `d886e875…`. `tools/build-android.sh`, two clean
builds byte-identical: SHA-256 `5818ba782b48e07423949d6bf5ad6d664679712e8c270cde7d75d310c53fa06a`;
apksigner v3 verifies; signer cert `a566937a…` (Claude private candidate key — NOT the unavailable original
lineage). Host JNI real-model smoke (`NativeQwenSmoke`) PASS: grounded answer, refusal, startup/generation
cancel, overflow refusal. The GGUF is not in the APK: it must be imported/placed on the phone per
`tools/ANDROID_PRIVATE_IMPORTS.md`. Not installed on any phone.
