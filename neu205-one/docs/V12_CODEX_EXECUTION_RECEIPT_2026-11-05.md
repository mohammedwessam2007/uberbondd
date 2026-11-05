# Codex v12 execution receipt — 2026-11-05

Source basis: public mission branch `d96abec44097b98701fb7be0921b39ee74232e26`, draft PR #1605.
Original checkout `dc832b700fda03196960e63fba38557a96c4f853` was clean and left unchanged.
A separate worktree was used. The verified complete-history preservation bundle has SHA-256
`976e186d2f92128c5d7a643b58d202780fc5b39f603ff763f7f46efdc4dfeea4` and is held privately.

## Recovery and evaluation

`CLAUDE_PRIVATE_WORKTREE_UNAVAILABLE`: reported `cbf1804` and the other reported local v12
commits were not recovered from available Git objects, authorized workspace/home/scratch files,
or uploaded/private recovery directories. No authentic frozen questions, key, manifest or
prediction JSONL was found. **Rows recovered and verified here: 0; original run completion:
UNKNOWN.** This does not contradict or independently verify Claude's reported historical 354.
No missing rows were fabricated, no sealed key was opened, and no new evaluation was authored
without the original textbook. Actual medical correctness remains **NOT MEASURED**.
The original PDF/corpus, Whisper assets and original signing identity were also unavailable.

## Executed engineering work

- Reconstructed in-process ARM64 Qwen JNI using official pinned llama.cpp, the existing Java
  EvidenceIndex, signed model receipts, seekable read-only document custody, and corpus binding.
  This is not claimed to be Claude's frozen v12 source or prompt configuration.
- Added abort callbacks and 64-token prefill chunks, generation cancellation, generation-gated
  speech, exact token-context checks, bounded output and explicit truncation failure.
- Repaired signed corpus import acceptance: the pinned original PDF and APK signer remain
  authoritative; signed corpus/member/manifest digests must agree. Bundled bytes remain pinned.
  Pack preparation verifies the actual original PDF before signing a derived serialization.
- Reused byte-identical canonical Java audio classes instead of compiling duplicate copies.
  Added strict split-UTF-8 handling, split reasoning-tag filtering, and original-signer release
  refusal. MIT llama.cpp attribution is included in packaged assets.

## Verified computation and dependencies

The running published environment reports unrestricted public networking **enforced**.
GitHub, API, Google SDK, Maven, Gradle, Hugging Face and its regional download CDN were reachable.
Two CDN root probes returned 403; those denials were preserved and not bypassed. The real model
successfully downloaded through the supported proxy with TLS verification.

Model: `unsloth/Qwen3.5-4B-GGUF`, immutable Hub revision
`e87f176479d0855a907a41277aca2f8ee7a09523`, `Qwen3.5-4B-Q4_K_M.gguf`,
2,740,937,888 bytes, SHA-256
`00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4`.
Actual GGUF metadata confirms `qwen35`, Q4_K_M, 426 tensors and chat template SHA-256
`7f0e529032c25183bcd66c7f238da2d377f43be754a94e2725a58c4e16d2ed67`.

Official llama.cpp: `c6a0ff11a0fe16ac1a2eb569190934593a2b3670` (MIT).
Official NDK 29.0.14206865 and SDK archives were checked against publisher metadata;
Temurin JDK archive was checked against its publisher SHA-256. Tools are user-owned;
no platform guards or credential values were changed. No paid APIs or purchases were used.

The stripped ARM64 JNI library SHA-256 is
`2533eea019f9a2dfe00347b231ae118b276034683cf68eaaf055cce936306395`.
All four LOAD segments have alignment `0x4000`; dependencies are Android libc/libm/libdl.
Native ARM64 execution on Android is not implied by this cross-build.

Real host JNI synthetic probes produced a supported oxygen-sensing answer and an aspirin-dose
refusal. In the probe that waits 100 ms after observing native work underway, Stop-to-worker-join
was **10.959 ms during prefill** and **0.223 ms during generation**, zero late callbacks.
These are single host observations, not p50/p95 measurements or phone timings.
Context overflow and cancellation before start were rejected, and context reuse after abort ran.
The full NativeBrain.answer path also ran with the actual model and a synthetic passage,
including retrieval-gated and overlapping-term model refusals. None of these are medical scores.

## Validation and release limits

Backend: 60 passed. Tooling: 21 passed. Evaluation protocol: 16 passed.
Java core: 25 passed, one private-KB group unavailable. Java Evidence API: 18 passed.
Android framework: 53 discovered, 51 passed, two private-ASR checks skipped.
Lint passed with zero errors/fatals and seven warnings (legacy core locale and ARM64-only
ChromeOS notices). Two complete unsigned engineering APK builds were byte-identical at
41,158,434 bytes, SHA-256 `cd45fe263ac62d03e12785c8e108d45115ab6aef1c3eed5783807f63b224fe70`.
The packaged JNI matches the verified stripped library, its MIT notice is present, and
`zipalign -c -P 16 4` passed. These APKs contain no private book/Whisper assets and are not
signed releases. No emulator or physical instrumentation pass is claimed. Earlier failed setup/test-expectation logs remain
private, including the corrected expectation that a retrieval refusal has no cited pages.

The original-signer release command exited 2 with:
`Original candidate signing identity unavailable; release build blocked`.
No replacement signing key was minted. No signed reproducible offline release exists from this
execution. Any unsigned APK built here is a packaging probe without private book/Whisper assets.
ADB reported no connected devices; `/dev/kvm` was absent. **PHONE_NOT_TESTED**.

Recovery of authentic private assets/signing custody is the next external gate. Then perform
signed reproducible builds, genuine frozen-run recovery/provenance audit or a separately sealed
new evaluation, independent grading, and authorized actual-phone acceptance. Never append this
reconstructed candidate's predictions to the absent original run. See `V12_NATIVE_BUILD.md`.
