# NEU205 ONE — v12 reconstructed engineering candidate

Current scope and recovery gates: [V12 Codex execution receipt](docs/V12_CODEX_EXECUTION_RECEIPT_2026-11-05.md).
The native Qwen candidate uses the original Java evidence index and a verified model document,
with bounded prefill and generation cancellation. Real host JNI inference and synthetic answer-path
checks have run; private-book accuracy and physical Android execution remain unmeasured.
Claude's private v12 source, frozen 437-question run, original textbook and original signing key
were not recovered in this environment. Do not resume that run from reconstructed source or
represent the unsigned packaging probe as an offline release. See [native build instructions](docs/V12_NATIVE_BUILD.md).

The following v11 receipt is historical lineage, not a claim about a signed v12 artifact.

# NEU205 ONE v11 — private engineering candidate

Signed Android candidate with native offline Whisper, offline Android speech, full-book evidence
and authenticated loopback Qwen integration. Qwen is the sole answering model. Original apps and
source are preserved. No phone was installed or permission changed.

V11 adds source-preserving active memory, bounded Qwen memory tools, stem-first MCQ support,
signed atomic study-pack imports with rollback, read-only model identity verification and thermal
handling. The experimental memory path remains default-off pending real Qwen evaluation.
See `docs/V11_EXECUTION_RECEIPT.md` for current scope, measured results and external gates.

**Release blocked:** the actual Qwen GGUF and physical OnePlus were not available. Real Qwen
answer correctness, actual ARM64 runtime execution, acoustic latency, thermal/battery behavior
and the phone's offline audio path are unverified. Synthetic ASR still misses a medical term.
The app is half-duplex; long-press interrupts a turn, but spoken barge-in is not implemented.

- `docs/ANDROID_IMPLEMENTATION.md`: behavior, architecture, builds and limits.
- `docs/PHONE_ACCEPTANCE.md`: three owner actions, physical tests and rollback.
- `docs/NEU205_EVIDENCE_API_V1.md`: recovered frozen Claude interface.
- `backend/README.md`: private pairing, actual GGUF verification and opt-in startup.
- `docs/SNAPDRAGON_ACCELERATION.md`: pinned official CPU/GPU/NPU investigation.
- `docs/DEPENDENCIES_AND_CUSTODY.md`: provenance, licenses and original hashes.
- `receipts/`: scoped test/review evidence. Synthetic/protocol results are not medical validation.

Build the private APK with `tools/build-android.sh` after preparing the documented official
toolchain and private assets. It does not change an original model or install on a device.
The supplied candidate was built twice with identical signed bytes. The signing key is separate
from source. The delivery manifest records the authoritative APK hash and certificate fingerprint.
The v11 delivery does not export the signing private key.

Run backend tests with `python -m unittest discover -s backend/tests -v` and measurement/build
helper tests with `python -m unittest discover -s tools -p 'test_*.py' -v`. Gradle 8.9 runs Android
Robolectric/lint checks; standalone SDK37.2 tools build the actual target37 signed APK.

This task uses an isolated existing workspace; do not create extra Git worktrees unless requested.
Do not publish the private delivery, textbook, audio, models, signing material or pairing tokens.
