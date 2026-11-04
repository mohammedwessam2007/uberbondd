# Android candidate implementation

Package `ai.neu205.one` is separate from the recovered historical packages. This candidate is not release qualified and has not been installed on the owner's phone.

The native Android application uses an `AudioRecord` 16 kHz mono PCM microphone, the recovered Whisper-small ONNX algorithm running in the app through pinned ONNX Runtime, the frozen full-book evidence/Qwen companion on authenticated fixed loopback, and an installed non-network English Android TTS voice. Qwen is the only answer generator. Whisper identifies words; BM25 locates passages. There is no fixed question/answer catalogue in this application.

One Start action requests first-use permissions only when the owner invokes it. The microphone starts only after verified ASR assets, a local Qwen/book readiness check, and an installed offline voice are available. The UI distinguishes preparation from actual Listening. It calibrates the microphone noise floor for 400 ms before displaying Listening. The source VAD retains 300 ms pre-roll after calibration and waits 700 ms for an utterance endpoint, with a 30-second whole-utterance limit. A separate RMS/length gate prevents zero/near-zero audio from reaching the recognizer; this is an engineering noise guard, not proven recognition under all physical noise conditions.

A short tap on the orb stops the session. A long press while running cancels the current request and returns to listening, preserving bounded conversational context. This is **half-duplex**: capture frames are discarded while ASR, answering, or speech is active, including a 500 ms speaker tail. Spoken barge-in is not implemented or claimed. Sentence-complete streaming TTS is a coherence heuristic, not an independent clinical verification of the model's words. The phone's built-in speaker is selected through Android communication-device routing and restored on Stop. Physical routing and audible latency are unverified.

Every asynchronous operation carries a session generation. Stop invalidates it, stops the microphone and offline TTS, disconnects the loopback stream, posts authenticated server cancellation, and terminates the active native ONNX run via `OrtSession.RunOptions.setTerminate(true)`. Native runs are serialized across retained warm ASR sessions. Old microphone capture releases before an interrupted session can create a new recorder. Stream request IDs must match exactly; malformed, oversized, redirected, or stale responses fail closed.

History is held only in memory, with at most six messages, each at most 2,000 characters. User transcripts above the frozen 1,000-character evidence request bound are rejected with a shorter-question message rather than silently dropping qualifiers. Previous user questions provide bounded follow-up retrieval context. Diagnostics export stage names and elapsed-realtime timestamps only. They omit audio, transcript, answer, book passages and pairing keys. Android backup and device-transfer extraction are disabled.

## Companion startup

Settings includes an optional, initially disabled Termux startup integration. After explicit one-time owner permission and setup, Start sends a fixed `RUN_COMMAND` Intent to Termux's documented service, running only its app-private `~/neu205-one/start-companion.sh`. The app never changes Termux settings or grants itself that permission. It sends no pairing key or arbitrary shell text through Intent extras. The isolated launcher owns only processes it creates and never replaces an occupied listener. Existing Qwen ports and originals are preserved. A separately opted-in verified Qwen launch can need up to 150 seconds of readiness polling on a cold start; no cold-start phone timing is asserted.

The manifest's INTERNET permission enables fixed `127.0.0.1:8768` transport. The application never accepts a configurable URL, disables redirects, uses no DNS/proxy for local requests, and rejects all other endpoint strings. Android's cleartext policy allows only `127.0.0.1`. Installed TTS voice metadata must report a local, non-network English voice; airplane-mode physical testing remains required.

## Build and checks

`tools/build-android.sh` uses official SDK platform 37.2, build-tools 37.0.0, JDK 21, and a publisher-checksum-verified ONNX Runtime Android 1.31.1 AAR. It compiles Java, creates DEX, includes the actual ARM64 native libraries, stages only the private full corpus and required ASR assets, normalizes ZIP metadata, aligns at 16 KB, and signs with a separate owner-private candidate key outside the code repository. Set `NEU205_ABI=x86_64` and a separate `NEU205_BUILD_DIR=build/emulator` for an emulator-only derivative. Original model and corpus assets are not modified by the build.

Gradle 8.9/AGP 8.7.3 provides SDK35 Robolectric simulation and lint. The actual signed candidate's standalone compile uses SDK37.2. Dependency verification remains enabled; missing metadata checksums were verified against the publisher rather than bypassed. The build does not require modifying an owner's installed APK or phone.

The framework/unit suite exercises generation invalidation, Start/Stop storms, endpoint preservation, silence/noise, whole-overlong-utterance draining, bounded multi-turn memory, hidden reasoning filtering, coherent speech boundaries, endpoint/redirect/header rejection, WAV framing, first-launch permission refusal, and activity recreation. These are host/framework tests, not microphone or Qwen phone evidence.

`tools/build-instrumentation.sh` builds the separate acceptance runner. On an explicitly selected emulator, install both APKs and run:

```sh
adb -s emulator-5554 shell am instrument -w ai.neu205.one.tests/ai.neu205.one.tests.AcceptanceInstrumentation
```

This runner does not grant permissions. It verifies first-launch permission denial, native activity launch, the Start control, and actionable missing pairing. Its successful execution would not prove physical sound, real Qwen correctness, battery, temperature, medical speech accuracy, or a working OnePlus release.
