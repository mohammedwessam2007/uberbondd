# NEU205 ONE — PHOENIX checkpoint v0.3 (2026-11-03)

**Verdict: SOURCE BUILT + HOST TESTED · APK PACKAGING BLOCKED (tool permission) · PHONE TEST PENDING · RELEASE BLOCKED.**
Not a working-phone claim. No device was touched; no money spent; nothing course-derived pushed
(this repository is **public**).

## Where things are
- Code: `neu205-one/` on branch `ccr-62ebe621-64xxfa` of `uberbond2007/uberbondd` (code only).
- Owner-private (never in git): study pack `kb.json` (sha `23dbb84a…2e2c`, 1,287 units / 798
  topics / 300 pages, built from text-only PDF sha `c3298e8c…0940`), device assets (Whisper-small
  q8: encoder-dyn `e35ea7cb…2c`, decoder `fcfc6100…24`, tokens `0233c339…8f`), course-derived
  test expectations, evidence logs. Delivered to the owner as a private bundle; must be
  re-supplied to a new session (see Resume).

## Architecture (selected on evidence — see RECOVERY_MATRIX.md)
One APK, package `ai.neu205.one`, minSdk 31 / targetSdk 36, **no INTERNET permission**.
`Start` → foreground mic service → AudioRecord 16 kHz (VOICE_RECOGNITION + AEC/NS if offered) →
v8-donor adaptive endpointing (600 ms) → Whisper-small via ONNX Runtime 1.31.1 (encoder window
max(8 s, utterance+1 s), greedy KV decode) → deterministic book retrieval + bounded context →
Android TTS restricted to an installed offline English voice → back to Listening. Half-duplex
(mic muted while speaking + 350 ms tail). Generation tokens drop every late callback after Stop.
Qwen/Termux are not dependencies.

## Gate status
| Gate | Status | Evidence |
|---|---|---|
| G0 recovery | DONE (v0.2 source still absent) | docs/RECOVERY_MATRIX.md |
| G1 baseline | DONE for v6/v8 (host); v0.2 not rebuildable without its source ZIP | v8 backend 18/18, v6 backend 27/27, v8 recall 17/17 (re-run 2026-11-03, localhost only) |
| G2 host E2E | DONE (host) | WAV→Whisper-small→Java engine on 10 synthetic clips: 2 correct, **0 false answers**, 5 correct abstain, 3 missed |
| G3 app | SOURCE COMPILES vs API 37 + ORT 1.31.1; **APK not packaged** | javac clean |
| G4 speech accuracy | HOST-ONLY, narrow | small q8, 8 s window: WER 0.164, p50 0.96 s (x86 4-core); tiny unusable; **real speech / phone UNKNOWN** |
| G5 acoustic latency | NOT RUN | needs phone |
| G6 reliability | HOST state-machine only | Stop races, rapid 20× Start/Stop, late callbacks, mic failure: pass |
| G7 UI | SOURCE ONLY | no screenshot without a device/emulator |
| G8 release | BLOCKED | aapt2/d8/apksigner execution not permitted in this container |
| G9/G10 phone | NOT RUN | needs owner install |

Host test counts (exact): public suite 25/25; private KB suite 54/54; mel parity vs numpy
max |Δ| 3.3e-6; segmenter 10/10; tokenizer decode = Python BPE; ILO held-out (92 compound
book-objective questions): 39 answered, 31 in the correct chapter, 53 clarified/abstained.

## Known defects / risks (not hidden)
1. ASR accuracy on real medical speech unknown; espeak-synthetic clips are a weak proxy.
2. The Java Whisper decoder loop has not been executed (only its Python twin); first phone run
   is its first execution.
3. Model provenance: Whisper weights come from npm `sts-whisper-small` (Xenova ONNX export,
   npm integrity sha512 recorded); HF original unreachable here, so equivalence is unverified.
4. Sentence-tier retrieval can answer a topically adjacent fact for compound questions.
5. TTS "start" timestamp is not audible onset. ColorOS background/thermal behaviour unknown.

## Resume
`cd neu205-one && tools/test_core.sh <private>/kb.json <private>/kb_expectations.tsv` then, once
build tools are permitted, `tools/build_apk.sh` (env vars documented in the script).
