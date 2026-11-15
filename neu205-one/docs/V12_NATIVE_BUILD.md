# Reconstructed native Qwen candidate

This is independently reconstructed code at the public mission branch, not recovered Claude
v12 code and not the frozen `cbf1804` configuration. Never use it to append predictions to that
original sealed run. Native study mode retains baseline Java BM25 retrieval. Experimental v11
memory/exam switches require the companion and are rejected when native study mode is selected.

## Build provenance

Use official `ggml-org/llama.cpp` commit
`c6a0ff11a0fe16ac1a2eb569190934593a2b3670` (MIT; attribution included in APK assets),
official Android NDK `29.0.14206865`, CMake >=3.22, and a complete Java 17+ JDK.
No third-party source checkout or binary belongs in this repository.

```sh
LLAMA_SOURCE=/private/llama.cpp \
ANDROID_NDK_HOME=/private/android-ndk-r29 \
NEU205_JNI_OUT=/private/neu205-jni-arm64 \
bash neu205-one/tools/build-qwen-jni.sh
```

The CMake project refuses a different source commit, builds static llama/ggml and C++ runtime,
and links the Android shared library with 16 KiB maximum page size. Inspect **every** ELF LOAD
segment and the packaged APK alignment. ARM64 dependencies in the tested build are only
Android `libc.so`, `libm.so`, and `libdl.so`. Compile success is not Android execution proof.

For host JNI, set `NEU205_JNI_HOST=1`, `JAVA_HOME` and a separate output directory. Run the
standalone real-model smoke test after verifying the complete downloaded GGUF:

```sh
javac -d /private/host-test \
  neu205-one/android/app/src/main/java/ai/neu205/one/NativeQwen.java \
  neu205-one/tools/NativeQwenSmoke.java
java -Djava.library.path=/private/neu205-jni-host -cp /private/host-test \
  ai.neu205.one.NativeQwenSmoke /private/Qwen3.5-4B-Q4_K_M.gguf
```

The smoke test independently verifies the pinned 2,740,937,888-byte SHA-256 before loading.
It checks synthetic supported/refusal probes, cancellation after 100 ms in observed prefill
and generation stages, cancellation before start, context overflow, and context reuse after
abort. Its output is synthetic plumbing evidence, not clinical or private-book accuracy.

Gradle uses the shared canonical core source; duplicate Android audio copies were removed
only after byte equality was checked. Public framework tests require no private assets.
The real `NativeBrain.answer()` test is opt-in with `NEU205_HOST_JNI_DIR` and
`NEU205_NATIVE_SMOKE_MODEL`. It verifies the real GGUF, uses one synthetic evidence passage,
and tests generation, retrieval refusal and model refusal with overlapping retrieval terms.
Do not run another model or heavy build alongside these inference checks.

```sh
cd neu205-one/android
NEU205_HOST_JNI_DIR=/private/neu205-jni-host \
NEU205_NATIVE_SMOKE_MODEL=/private/Qwen3.5-4B-Q4_K_M.gguf \
bash gradlew --no-daemon :app:testDebugUnitTest :app:lintDebug
```

Java tools must use the environment's supported proxy and trusted CA store. Preserve TLS
verification. SDK dependencies can be installed in a user-owned directory; root is unnecessary.

## Android packaging and release gate

Gradle can compile the pinned JNI source when `NEU205_LLAMA_SOURCE` is set. Alternatively,
`NEU205_NATIVE_LIBS` may name a private directory containing the verified prebuilt
`arm64-v8a/libneu205_qwen.so`. Use one route, not both. An `assembleRelease` output without
original assets and signing identity is an **unsigned engineering packaging probe**, not an
offline delivery candidate. Standard framework builds omit JNI unless explicitly configured;
Start then fails closed if an imported native model is selected.

The private release entrypoint is `tools/build-android.sh`. It requires the original
`candidate.p12` and password file, complete verified Whisper/book assets, official SDK tools,
and `NEU205_QWEN_LIB` pointing to the verified stripped library. It refuses to create a new
signer. Preserve the original signing lineage and independently verify the certificate,
16 KiB APK alignment, and two complete byte-identical signed builds before delivery.
The separately verified JNI library must be added to that APK; a host library cannot replace it.

Native Start revalidates the signed pack and original PDF identity attestation, hashes and
parses the selected GGUF through the actual read-only seekable descriptor, and keeps it open
while mmap is active. A changed pack requires validating the model again. Nonseekable/cloud
provider documents fail closed; choose a locally available model. Original document bytes
are never copied or modified. The signer attests a derived corpus serialization; both signed
member digests and the 299-page manifest must match. Pack preparation now also requires the
actual checksum-pinned original PDF before signing.

Stop also cancels startup GGUF verification and the native model load-progress callback.
Each startup captures its own cancellation flag; a new Start cannot revive an old load.

Stop and Interrupt invalidate session generations before cancellation; native prefill is
chunked at 64 tokens, with an abort callback inside compute and checks during decoding.
Late ASR/model/TTS outputs remain generation-gated. UTF-8 is assembled across token boundaries,
reasoning markup is filtered across arbitrary token splits, and incomplete reasoning/context
or truncated token budgets cannot become a successful completed answer.

## Recovery, rollback and remaining gates

The full authentic book, original signing material and frozen evaluation are not in the
current workspace. Recovery of those private assets is required before release or evaluation.
Keep them outside Git, Actions, public issues and logs. No medical accuracy score is claimed.

To roll back private assets, Stop first and use Restore previous imported pack; revalidate its
model reference before restarting. To restore application code, use the prior verified APK
with its original signer and keep imported assets/version custody intact. Do not uninstall or
clear app data to work around a signature mismatch. The feature branch is draft-only; no merge
or deployment is authorized. Physical microphone, speaker, offline isolation, RAM/thermals,
30-turn resilience and acoustic timing remain `PHONE_NOT_TESTED` until legitimately connected
and explicitly authorized on the actual OnePlus.
