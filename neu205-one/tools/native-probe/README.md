# Native stage timing probe

`NativeTimingProbe.java` runs synthetic fixed prompts, without textbook or exam
inputs, through the actual JNI `NativeQwen`. It verifies the pinned GGUF SHA,
uses four CPU threads, and alternates short/long/long/short prompt lengths.
It then cancels on the first byte piece and runs a recovery turn. Cache clearing
and greedy decoding remain unchanged. Output includes prompt/output digests,
not raw responses. Use private output paths and preserve each run.

Compile this tool together with `NativeQwen.java`, `StreamingUtf8.java` and
`SpeechClauses.java` using JDK 17 or newer. Build `libneu205_qwen.so` from the
current `qwen_jni.cpp` and the SHA-pinned llama.cpp checkout via the existing
CMakeLists, or relink against the existing verified host static libraries.
Never silently load an older JNI library: it lacks the additive timing method.

Example after compilation, with verified private model/native library paths:

```sh
umask 077
java -Djava.library.path=PRIVATE_NATIVE_DIRECTORY -cp PRIVATE_CLASSES \
  ai.neu205.one.NativeTimingProbe PRIVATE_MODEL.gguf \
  > PRIVATE_UNUSED_RESULT.jsonl 2> PRIVATE_UNUSED_NATIVE.log
```

Native timing array: tokenization microseconds, prefill microseconds (including
state clear), single-token decode microseconds, first byte microseconds from
generation start (`-1` if absent), total generation microseconds, prompt tokens,
emitted token pieces, Java callback microseconds. Sampling and piece-conversion
work are included in total but not single-token decode. All times are monotonic.
Snapshots are read after generation while holding the Java generation monitor.
Before any generation, all snapshot fields are zero.
No prompt/answer text is retained in native timing fields.

The Java clause measure is first complete **synthetic** clause, not an independently
verified answer or physical audible audio. The first turn has cold generation
state following model load; later turns reuse model/context allocation while
clearing inference memory. This is not a phone cold-start or clinical benchmark.
Four samples cannot estimate reliable p95 or medical accuracy. The cancellation
case cancels after the first callback, not during prefill, and is not a full
asynchronous interruption test. Preserve errors instead of counting them as fast
answers. Do not change model threads, batching, sampling or cache semantics merely
because a shorter prompt is faster.

Additional bounded modes (same model verification and state clearing):

- `--soak30`: 30 sequential synthetic short turns in one loaded model/context;
  each line includes host RSS in KiB when `/proc/self/status` is available.
- `--cancel-prefill`: observe stage 1, wait 100 ms, verify stage 1 still active,
  cancel from the other thread, require worker join within 10 seconds, then run
  a recovery turn. A cancelled generation with no tokens is labeled `no-output`,
  never a completed answer. Its empty output and phase observation must be
  checked with the separate cancellation record.

Append the mode after the model filename. Choose fresh private logs for every
run. These modes measure Linux-host behavior and do not measure phone thermals,
battery, acoustic latency, or medical reliability. A single cancellation does
not establish a p95 or maximum device interruption time.
