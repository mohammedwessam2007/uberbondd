# Snapdragon investigation and compatibility gate

Official upstream inspected and pinned: llama.cpp
`28b812d6cb9cfe569d368c2774c3886ad4fe10e8`.

- [Official Snapdragon guide](https://github.com/ggml-org/llama.cpp/blob/28b812d6cb9cfe569d368c2774c3886ad4fe10e8/docs/backend/snapdragon/README.md)
- [Hexagon operation/quantization checks](https://github.com/ggml-org/llama.cpp/blob/28b812d6cb9cfe569d368c2774c3886ad4fe10e8/ggml/src/ggml-hexagon/htp-kparams.cpp)
- [Qwen 3.5 implementation](https://github.com/ggml-org/llama.cpp/blob/28b812d6cb9cfe569d368c2774c3886ad4fe10e8/src/models/qwen35.cpp)

The official backend supports CPU, Adreno OpenCL and experimental Hexagon. The inspected Hexagon
code includes Q4_K/Q5_K/Q6_K checks and gated-delta-net/SSM operation paths. Their existence does
not prove that every tensor shape, actual Qwen architecture, quantization, vendor driver and
OnePlus firmware combination works. It would be incorrect to declare this Qwen unsupported, or
to promise an NPU speedup, from the product name alone.

The actual phone SoC, Adreno driver, HTP architecture, thermal behavior and installed GGUF identity
were unavailable. No GPU/NPU benchmark was run. No backend, model or phone installation was changed.

The deliverable includes a separately built ARM64 Android CPU runtime from this pinned source,
official stable NDK 29, API31, C++ static runtime, OpenMP/OpenCL/Hexagon disabled. Its presence is
cross-compilation evidence, not phone execution or model compatibility evidence. The original
working Termux CPU runtime remains the default until a replacement passes real acceptance.

Before an owner-authorized comparison, hash the exact original GGUF, identify its architecture,
quantization and chat template, and retain that identity receipt. Inspect the actual runtime's
device list and available vendor libraries without changing them. Use the same prompts, context,
generation length and model bytes for each backend; warm up separately; retain crash/failure
receipts and fall back to the original CPU runtime after any incompatibility. Do not convert or
replace the original model merely to fit a backend. Compare smaller Qwen variants only as separate
private experiments, with independently scored medical correctness and no automatic promotion.

`tools/benchmark_qwen.py` requires an explicit model SHA and verified identity before running a local
llama-bench binary. It performs no ADB operations, installations or server bindings. Run it only
after the owner authorizes execution on the device. The benchmark's compute throughput is distinct
from ASR latency and physical speaker latency. Phone measurements must include 30 warm turns,
5 cold starts and sustained thermal/battery/RAM observations before any performance claim.
