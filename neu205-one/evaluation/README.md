# Independent sealed source evaluation

`sealed_source_eval.py` contains integrity checks and arithmetic for externally
supplied, independently reviewed grades. It contains no book passages, medical
questions, answers, private paths, or solver configuration. Keep all actual
questions, gold, predictions and grading rationales in the private evaluation
workspace. Do not commit them to this repository or include them in APK assets.

The evaluator must author source-backed questions without inspecting solver
prompts, configuration, predictions or earlier held-out/exposed question sets.
Reserve development source pages before authoring the sealed set. Freeze the
question-only file, private key and preregistration before running the solver.
Question-only rows contain exactly `id` and `question`; MCQ options belong in
the question text. Identifiers must not disclose answerability. The runner
should supply only `question` to the answering system.

Example commands use shell variables pointing to private artifacts:

```bash
python evaluation/sealed_source_eval.py validate \
  --gold "$EVAL_GOLD" --questions "$EVAL_QUESTIONS" \
  --pages "$BOOK_PAGES" --pdf "$BOOK_PDF" --development-cutoff 60

python evaluation/sealed_source_eval.py freeze \
  --gold "$EVAL_GOLD" --questions "$EVAL_QUESTIONS" \
  --pages "$BOOK_PAGES" --pdf "$BOOK_PDF" --development-cutoff 60 \
  --preregistration "$EVAL_PREREGISTRATION" --manifest "$EVAL_MANIFEST"
```

Validation checks exact quotations and quote/page/source hashes against page
JSONL, and checks the quotation again against a fresh PDF layout extraction
with whitespace normalization only. It requires `pdftotext` from Poppler. An
unsupported question has a missing-input/scope rationale and a literal absence
audit, never an invented supporting quotation. Literal absence is not itself
a semantic correctness test. Freeze uses exclusive creation and refuses to
overwrite a manifest. Preserve the frozen manifest's hash separately.

Prediction rows are `{id, answer, status, confidence}`. `status` must be
`completed` for usable answers. Confidence is an optional number in `[0,1]`,
supplied before grading; missing confidence is unavailable, never assumed zero.
An optional first-line header has exactly `run` and `config_sha256` fields.
Only that single header is recognized; unknown or repeated metadata lines are
rejected. Its configuration hash is retained as runner metadata, rather than
independently rederived by this tool. Freeze the complete original prediction
file before exposing the gold to an independent reviewer. Supply a failed row
for every missing, failed or timed-out execution; empty outputs remain errors.
Exact ID/count coverage is required, so dropped items cannot improve a score.
Do not select a successful retry.

Grade rows require `id`, `label`, `reviewer_id`, `reviewer_qualifications`,
`review_method: "independent_source_review"`, `rationale`, and
`prediction_file_sha256`. The reviewer must read the actual response and source
evidence. Labels are `correct`, `partial`, `incorrect`, `refusal`, and `error`.
Successful unsupported handling is `refusal`. Missing or failed predictions
must have `error`. This program does not infer these labels, judge medical
correctness, verify reviewer credentials, or treat a model as a clinician.

```bash
python evaluation/sealed_source_eval.py seal-predictions \
  --questions "$EVAL_QUESTIONS" --key-manifest "$EVAL_MANIFEST" \
  --predictions "$EVAL_PREDICTIONS" --manifest "$EVAL_PREDICTIONS_MANIFEST"

python evaluation/sealed_source_eval.py grade \
  --gold "$EVAL_GOLD" --questions "$EVAL_QUESTIONS" \
  --preregistration "$EVAL_PREREGISTRATION" --manifest "$EVAL_MANIFEST" \
  --predictions "$EVAL_PREDICTIONS" \
  --predictions-manifest "$EVAL_PREDICTIONS_MANIFEST" --grades "$EVAL_GRADES"

python -m unittest discover -s evaluation -p 'test_*.py'
```

The provisional thresholds are supported correctness >=90%, supported
confidently wrong <=2% (confidence >=0.80), and unsupported refusal >=95%.
Partial answers do not count as fully correct. The report includes fixed
denominators, missing predictions/confidence and descriptive Wilson intervals.
The target sample is 300 supported plus 100 unsupported. A smaller purposive
sample cannot satisfy that release gate, even with perfect results. Same-page
questions are clustered, so binomial intervals have practical limits.

Every result stays provisional without independent clinical review. The
`full_release_gate_passed` field deliberately remains false: this tool cannot
verify clinical review, Android audio integration or physical-phone acceptance.
Synthetic script tests verify integrity/arithmetic only and are never counted
as medical accuracy or inference evidence.
