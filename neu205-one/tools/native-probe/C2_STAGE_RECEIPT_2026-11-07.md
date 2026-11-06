# C2 native stage experiment, 2026-11-07

Base: unified PR #1611 `d3682fe54e65b9dc545847726586dc34845bd134`.
Question: does native prompt prefill, rather than retrieval or Java callback work,
account for a controlled synthetic prompt-length latency difference?

The actual CPU JNI was compiled from the changed source against the existing
static libraries built from clean pinned llama.cpp
`c6a0ff11a0fe16ac1a2eb569190934593a2b3670`. Instrumented host JNI SHA-256:
`125978ba62673c9e41f7a35793c3085522a63a31a75c434bc50f8bd8b35d5500`.
Model SHA-256 was verified by the Java probe before load:
`00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4`.

Host: x86_64 Intel Xeon Platinum 8573C, CPU quota four cores, 32 GiB memory
limit, four model threads, batch/ubatch 64, context 2,048, greedy sampling,
CPU only. Model load took 3.008 s. One model/context allocation was reused,
with inference memory cleared before every generation as before. Order was
short, long, long, short, cancellation, short recovery. All prompts were synthetic;
no textbook, exam question, sealed answer or medical rubric was loaded.

| Metric | Short (71 tokens), n=2 | Long (423 tokens), n=2 |
|---|---:|---:|
| Median tokenization | 1.545 ms | 0.998 ms |
| Median prefill, including state clear | 2.484 s | 14.214 s |
| Median single-token decode phase | 0.864 s | 0.902 s |
| Median first byte | 2.487 s | 14.217 s |
| Median native total | 3.357 s | 15.126 s |
| Completed synthetic clause, individual runs | 3.503, 3.216 s | 16.587, 13.664 s |

All five completed generations, including recovery, produced the exact fixed
synthetic sentence (verified by output digest). Cancellation on the first
callback stopped after one piece, with no decode step after that callback;
native cancellation-generation total was 2.297 s, dominated by prefill which
had already completed. This does not measure asynchronous cancellation during
prefill. Timing invariants passed on all six generations; completed outputs,
raw metrics and model/source/native hashes are privately preserved at
`/workspace/neu205-private/c2-native-timing-20261107/aggregate.json` and
`results.jsonl`. Native logs are private. No private assets were committed.

This experiment supports prefill as the measured bottleneck for these two
synthetic inputs. It does not justify reducing evidence, establish medical
quality or fast phone speech, or measure p95. No context-cache reuse, sampling,
model thread limit, retrieval threshold or production behavior was changed.
First byte is not a verified speech clause. The Java clause metric is synthetic
text completion, not correct/audible output. Sampling/piece conversion is in
native total but outside single-token decode; callback cost is separately counted.

Host build used `/usr/bin/c++ -O3 -DNDEBUG -fPIC -std=c++17` with the JDK and
pinned llama/ggml includes, linking the existing `jni-host` static llama/ggml
libraries. Java compilation includes NativeQwen, StreamingUtf8, SpeechClauses
and NativeTimingProbe. The exact run command was:

```sh
timeout 240 /workspace/neu205-tools/jdk/jdk-21.0.13+9/bin/java \
 -Djava.library.path=/workspace/neu205-private/c2-native-timing-20261107 \
 -cp /workspace/neu205-private/c2-native-timing-20261107/classes \
 ai.neu205.one.NativeTimingProbe \
 /workspace/neu205-private/models/Qwen3.5-4B-Q4_K_M.gguf
```

Choose new private output files before any repeat; do not overwrite the receipt.
Rollback: remove the additive timing method, native fields/timers and probe; no
model or index artifacts were altered. Status: measured host experiment only.

## Separate private ARM64 sandbox build

A new private copied-source build used the updated JNI timing API, only
`arm64-v8a`, package `ai.neu205.one.c2sandbox`, and a newly generated local test
signer. The original signer and previous test signer were untouched. Two offline
Gradle builds, the second with `--rerun-tasks`, produced the same 263,071,852-byte
APK SHA-256:
`dd29298ea9c32a716bdf06087727e5be2ba9b975212359ccf337ccd412f8a2c0`.
APK Signature Scheme v2 and zipalign checks passed; native ELF LOAD segments have
16 KiB alignment and export the new NativeQwen timing method. Updated ARM64 JNI
SHA-256 is `ef27c5fdd23cb4fe61812831e93fa39cdb8074f44fdd07babf79ce4b54ff6110`.
Test certificate SHA-256 is
`7430e3fea0a99a9005aa6f955b74a7cd6e048314f1b6892e79d87db6bf646400`.

Private build/source/identity receipt:
`/workspace/neu205-private/c2-arm64-sandbox-20261107/receipt.json`.
It records exact copied-source hashes and verified embedded corpus/Whisper hashes.
Private key and password stay only in that restricted directory. The APK embeds
private study assets and must not be published. GGUF is not bundled: this candidate
requires the separately owner-selected, hash-validated local GGUF. The inherited
versionName is still `1.2.0-v12-reconstructed`; this label is not proof of release
lineage. Debug libraries were not stripped by the toolchain. Nothing was installed,
and no ARM execution, phone, acoustic latency, thermal or production claim follows.
This establishes same-environment repeatability, not independent reproducibility.
