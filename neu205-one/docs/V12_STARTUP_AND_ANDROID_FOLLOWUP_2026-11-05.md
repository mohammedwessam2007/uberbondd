# V12 autonomous continuation — startup cancellation and Android qualification

This continues the reconstructed candidate at `a6985eab538d374c9de978b3cc6fa6d1eb8cd404`.
It does not recover Claude's private v12 or change the frozen evaluation's status.
The owner's continuation instruction required autonomous execution without delegating ordinary
technical work back to the owner. No new owner approval or transfer request was made.

## Concrete defect repaired

Stop previously invalidated output and aborted inference, but the startup GGUF verification and
llama.cpp model-loading work had no shared cancellation flag. A stopped session could continue
that expensive startup before discarding its result. Each session now captures its own atomic
startup flag, Stop sets that flag, GGUF verification observes it, and llama.cpp's load-progress
callback checks it. A model that finishes loading concurrently with cancellation is destroyed
before it can be activated. Restart does not clear the previous session's cancellation flag.
JNI load-progress references use scoped global references and attach/detach callback threads
when necessary. The descriptor remains read-only and is closed on failed/cancelled activation.

The real GGUF host smoke test checks both pre-cancelled startup and cancellation during loading,
then successfully loads one model for inference and prefill/decode cancellation. No two models
run concurrently. Latest single host observations:

- Startup stop-to-loader-join: **499.375 ms**.
- Prefill stop-to-worker-join: **8.741 ms**, zero late callbacks.
- Decode stop-to-worker-join: **0.334 ms**, zero late callbacks.

These are host plumbing observations, not Android p50/p95 or medical correctness scores.
The supported synthetic answer and unsupported aspirin-dose refusal both executed again;
context overflow and cancellation-before-generation remained rejected.

Current stripped ARM64 JNI SHA-256:
`5952d5661a35648ab7d21f0f004916bcac1811f49b0222ff6faa7429ee40ca4a`.
All four ELF LOAD segments remain aligned to `0x4000`. The first reconstruction receipt's
previous JNI hash and cancellation observations are historical results from that prior build.

## Android work performed autonomously

The official emulator and API35 default x86_64 system image were downloaded and checked against
Google's published archive checksums. An Android x86_64 JNI component was compiled from the
same pinned source for isolated emulator testing; phone builds still default to ARM64.
`NEU205_TEST_ABI=x86_64` is explicit test configuration, not a phone release setting.

The existing acceptance instrumentation is now wired into Gradle with an explicit test namespace
and compatible manifest. Both debug app and instrumentation APKs compile. An opt-in native probe
loads the actual library, rejects missing models repeatedly through JNI, checks cancelled startup,
and retains the existing UI/microphone-denial checks. No microphone permission is granted.
The standard Android debug signer is used only for isolated test APKs; it does not replace or
recover the original release signer. The standalone instrumentation builder still injects its
package into a generated manifest for the non-Gradle route.

No KVM device is available. The current official emulator requires explicit software-TCG opt-in;
this was enabled using its supported local environment flag. One bounded TCG boot reached ADB
but did not reach `sys.boot_completed=1` within 180 seconds (182.358 seconds including bounded
ADB polling overhead). The owned emulator process was stopped, and no APK was installed on any
physical device. **Instrumentation execution remains NOT PASSED.** Building an instrumentation
APK and reaching ADB are not Android-native inference evidence. No repeated boot loop was used.

## Recovery and CI evidence

An authenticated GitHub Codespaces query returned `total_count: 0`. Available downloads/shared
recovery directories contain no private NEU205 backup. There is no connected private-storage
retrieval tool. No authentic frozen questions, key, predictions, book/ASR assets or release signer
were newly recovered. The original run's actual completion remains UNKNOWN; no answers or score
were reconstructed from narrative reports. The absence of reachable bytes is recorded as missing
custody, not as an owner task or a successful recovery.

Both scoped NEU205 checks passed on the preceding commit. The broader core/deterministic suite
failed in exactly the same eight named tests as its verified base `d96abec4`: two generated-canon
checks, two paid-dispatch protocol tests, one HTTP-freezing test, and three root startup-context
checks. Actual base and candidate CI logs were compared. No unrelated UberBond code or tests
were modified to turn those failures green.

Final regression, packaging and exact source/remote receipts are recorded privately in the
continuation manifest. The original full-book evaluation, medical grading, same-signer offline
release and actual OnePlus audio/thermal/resilience qualification remain unverified. No private
study assets, keys or weights were committed; no merge, public asset upload or paid API was used.

## Final local regression receipt

`testDebugUnitTest`, `lintDebug`, and ARM64 `assembleRelease` passed with the real model
explicitly enabled for the opt-in synthetic answer-path test: **51 passed, two private-ASR
checks skipped, zero failed**. Lint has zero errors/fatals and five legacy core locale warnings.
The standalone native smoke passed startup, supported/refusal, prefill/decode cancellation,
pre-start cancellation and overflow checks. Host and Android ARM64/x86 JNI builds succeeded.
Both the debug app and custom instrumentation APKs built successfully; their execution remains
unqualified because the emulator did not finish booting.

Two complete unsigned ARM64 packaging builds are byte-identical at SHA-256
`4bfde3e01d8edb84c8284655f80f476b03307748b643a23d166f79b4004c7328`.
The APK alignment check passed with 16 KiB native-page alignment. The private packet contains
source recovery and test receipts, not an installable offline release. The original release
signer and private assets remain unavailable, and no replacement release identity was created.
Known reported private short commit references also did not resolve through the authorized
repository commit API (HTTP 422); this does not prove that another private container never held
them. Their original bytes and the sealed evaluation remain unrecovered.
