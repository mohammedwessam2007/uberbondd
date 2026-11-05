# New 437-question native evaluation: provisional result

This result is for a **new, separately sealed** source-derived set, not Claude's unavailable
original frozen run. Original book PDF and 1,695-passage corpus were independently hash verified.
The new set was frozen before inference: 336 supported and 101 unsupported questions. Four
isolated authors did not inspect solver code, predictions, historical questions or keys. Four
independent AI reviewers each reviewed other authors' work, giving two source reviews per item;
26 disagreements/flags and a fixed-seed sample of 20 agreements received source adjudication.
All 46 adjudication rows persisted before that worker hit its usage limit; exact coverage,
schema, prediction binding and distinct rationales were subsequently checked locally.
Reviews and keys are provisional AI source reviews, **not clinician validation**.

All 437 unique predictions completed and were sealed before grading. The native pipeline made
357 Qwen generation calls and 80 evidence-gate refusals. No execution failure rows were recorded.
The complete sealed prediction SHA-256 is
`e286844d936c6d82a333a059bdf41c1c4e41c1d3a75f04c9ef86f533984f21ce`;
frozen runtime configuration SHA-256 is
`8e7f3546925d525289915687489a4c4e3f629cf35db9e3fcab03b51c1eb455c3`.

- Supported: **275/336 correct (81.8%)**, 28 partial, 22 incorrect, 11 refusals.
- Unsupported: **101/101 refused (100%)**.
- Reviewers marked all 22 incorrect supported answers as containing assertive wrong claims.
  The model did not export numeric confidence, so the preregistered numeric-confidence gate is
  **unavailable**, not zero. The reviewer assertion flag is a separate provisional measure.
- The 90% supported-correctness goal is **not met**. Unsupported refusal meets its 95% goal.
  Every question remains in its fixed denominator; no predictions or grades were dropped.

These are real model responses and independently reviewed source judgments, not a clinical
certification. Questions are model-authored, purposive and clustered by source page; the scorer
cannot verify clinician credentials. The full release gate remains false. Actual medical accuracy
on different questions, source pages1–60, patients, voice recognition and the phone is unknown.

On the host, text-pipeline total latency was p50 **31.94 s**, p95 **39.86 s**; first complete
speech clause was p50 **29.55 s**, p95 **37.33 s**. These include evidence-gate responses and are
not physical microphone-to-audible-word measurements or OnePlus timings. The model, index, runtime,
question/key manifests and all individual predictions and reviews remain privately preserved.
The original release signing identity is still absent and ADB reports no connected device.
No signed offline release, physical-phone pass, clinical validation, merge or paid API is claimed.

## Subsequent speech-stream repair

The frozen result above measures the prior candidate. A later source change prevents a decimal
split across model tokens (for example, `3.` followed by `5`) from being emitted as two spoken
sentences. Sentence punctuation at a token boundary is held until the next character or end of
stream establishes the boundary. This is a focused streaming repair, not a demonstrated
improvement in medical accuracy. The exposed 437-question set must not be reused as a new blind test.
