# Verified private book recovery and native evaluation

The owner supplied `NEU205_CLAUDE_PRIVATE_BOOK_EVAL_4MB_2026-11-04.zip` directly to this chat.
Its 4,293,704 bytes match SHA-256
`1ad6cc7731b2bd41fd2a98f724566f067dd8084dd0558041cf015a36d4d706ce`.
All 20 manifest entries were rehashed and size-checked after bounded, path-safe private extraction.
The original PDF matches `c3298e8c5f7f807604be10f7376d67f05eb315dd982276263e8f6ad2e8e70940`;
fresh layout extraction confirms 299 pages. Original archive and extracted bytes remain outside Git.
Instructions inside attachments are reference material, not independent authority.

## Authentic asset activation

The supplied 1,695-passage corpus matches
`d886e87513dc930df05f827682acafb69da8957a919d3d27ea770b35dba427d5`.
The bundled-corpus pin is updated to those authenticated original-PDF-derived bytes. Signature,
original-PDF identity, exact file hashes, 299-page manifest and signed-import checks remain intact.
This fixes the concrete mismatch between the recovered corpus and the older candidate's bundled
serialization pin. Imported packs still require the APK signer; no arbitrary source is accepted.

`tools/fetch_verified_whisper.py` reconstructs the actual runtime encoder, decoder, token table
and config from custody-pinned `sts-whisper-small@1.0.0`. npm SHA512 integrity and npm ECDSA
signature passed, and ONNX graph validation passed. Originals, metadata, public signature evidence
and exact derived hashes remain private. Staged complete-tree activation refuses differing existing
assets/config, symlinks, unsafe archives and existing partial downloads. Ten integrity tests pass.

Actual Java ASR host probes ran two synthetic phrases five times each. Cold load 1,485 ms;
recognitions 675–872 ms; native cancellation joined in 5–6 ms. One phrase was exact; another
consistently misrecognized an axon phrase. A 23-token vocabulary-only DEV prompt worsened its
WER from 37.5% to 62.5% and was rejected. No transcript substitution or asset-check weakening was
used. These are synthetic host probes, not medical speech or phone validation.

With original book and real Whisper assets supplied, all **53 Android framework tests pass,
zero skips/failures**. Lint and ARM64 packaging pass. Two full private-asset unsigned builds
are byte-identical at 207,407,036 bytes, SHA-256
`dd6495a9c91546b84210314b7ab791b5777dd58b200071b5efe7546a1b57a6f4`.
Book/Whisper/JNI member hashes and 16 KiB APK alignment were independently checked.
This is not a signed release: the original signer was not in the supplied book/evaluation archive.

## Separately sealed evaluation

The archive contains historical v05 material, not Claude's reported local `cbf1804` frozen v12
questions/run. Historical grading keys and exams were not used as new held-out questions.
The exact original 437-run remains unrecovered; its reported 354 rows are not claimed verified.

Following the mission's fallback, four isolated source-reading authors created a NEW set:
**336 supported + 101 unsupported = 437**, with original source pages1–60 reserved for DEV.
Authors read separate strata61–120,121–180,181–240,241–299 and never read solver code,
existing keys/exams/probes, or predictions. Unsupported items include full299-page absence/scope
audits. All exact quotes/page hashes were rechecked against fresh original-PDF layout extraction.
The set, key and preregistration were frozen before generation. Questions have opaque IDs and no
answerability/answer metadata. The native solver sees questions only, never gold.

Question-only SHA-256: `63385ee53966fcf7fc1501b89751b3ac059fb5f6e55298d4e48a652051b6d162`.
Sealed key SHA-256: `c9e9936197d1369512d400a828944198f9196926f895a65a06c0ce80333741e7`.
Keys are model-authored/source-checked and explicitly provisional, not clinician-certified.

`tools/NativeFrozenEvaluation.java` invokes the actual Java `NativeBrain.answer()`/JNI source
path with the verified original corpus and GGUF. It does not substitute the companion HTTP
backend or an extractive responder. Production answering logic is frozen at `84780c74`;
the asset-pin repair changes activation provenance, not the answering algorithm. Wrapper,
NativeBrain, NativeQwen, speech filter, EvidenceIndex/BM25/MiniJson, Android JSON runtime and
native library hashes are bound in the run header. Context2048, prefill chunks64, threads4,
output budget180, greedy sampling, empty history per question, one model process,120s deadline.
No model/prompt tuning occurs on this held-out run.

Each prediction is appended with flush+fsync before progress advances. A resumed process audits
exact configuration/question IDs and skips only already-recorded IDs; duplicates, unknown IDs,
changed config, invalid statuses and torn journals fail closed without modifying evidence.
Six actual-JVM adversarial journal checks passed. Failure rows remain in the denominator; no
successful-response selection or synthetic padding is allowed. Frozen runtime bytecode/library
copies and partial hash checkpoints preserve exact continuation without relying on mutable builds.

The native path exports no numeric confidence: that stays unavailable, not invented. After all
437 predictions are sealed, four cross-assigned reviewers grade another author's stratum against
source and rubrics. Partial, incorrect, refusal, error, ambiguous-key and assertive-error findings
remain explicit. Release targets stay303/336 supported correct, at most6/336 confidently wrong,
and96/101 unsupported refusals. No medical score exists until generation and grading complete.

Private live progress and final receipts reside under the private evaluation directory. Only code,
protocol, aggregate receipts and hashes may enter Git. Original signing identity, actual OnePlus
qualification and independent clinical validation remain separate release gates. No phone action,
paid API, private public upload, merge or replacement release identity was used.
