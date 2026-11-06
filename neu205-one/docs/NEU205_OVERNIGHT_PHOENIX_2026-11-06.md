# NEU205 overnight checkpoint — 2026-11-06

**Verdict: improved but blocked.** This is an incremental research branch, not a
release or a new medical evaluation. The parent is draft PR #1608 at
`d0b46d15da3ebbab1ba8fa7969baedc4747f5c06`; live main at startup was
`dc832b700fda03196960e63fba38557a96c4f853`. Existing PR #1605 and #1608
branches were not rewritten. The source-only changes are independently reversible.

## Assets and custody

The private original PDF had 299 pages and SHA-256
`c3298e8c5f7f807604be10f7376d67f05eb315dd982276263e8f6ad2e8e70940`;
the 1,695-passage corpus SHA-256 was
`d886e87513dc930df05f827682acafb69da8957a919d3d27ea770b35dba427d5`;
and the 2,740,937,888-byte Qwen GGUF SHA-256 was
`00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4`.
The private PDF, corpus, model, historical questions, keys, predictions and
reviews remain outside Git. The original release signer was not changed.

## Experiments and decisions

1. WARP3 now restricts window scoring to sorted candidate-page ranges using
   binary search over the precompiled postings. Its query normalization is
   unchanged. In a paired, alternating-order host run on the **exposed** 150
   historical DEV questions, original and bounded scoring selected identical
   window IDs on 150/150 queries and had zero candidate-window score mismatches.
   Both included the full normalized source quote for 127/150 (84.67%; Wilson
   95% interval 78.04–89.56%). Full scoring p50/p95 was 15.909/36.674 ms;
   bounded scoring was 6.356/13.231 ms in the preserved secure receipt. A second
   run measured 13.248/25.778 ms versus 5.978/10.850 ms. This is research retrieval latency,
   not Android, end-to-end voice, semantic entailment, or medical correctness.
   All 23 misses had the quote in a window of a retrieved candidate page but
   not in the selected packet; the coverage gate remains failed. The 600-word
   limit is not a verified 2,048-token native prompt budget. Existing WARP code
   manifests are historical snapshots of the parent commit, not hashes of the
   modified files in this branch.
2. NativeBrain uses strict incremental UTF-8 decoding for streamed byte pieces,
   preserving split multibyte characters and cancelling on malformed bytes.
   A synthetic 1,960-byte, 196-piece host microbenchmark averaged 0.273 ms for
   the old repeated decoding and 0.016 ms for the new decoder over 1,000
   iterations. This small decoder-only finding does not demonstrate any change
   in model or speech latency. JNI recurrent-state clearing and cancellation
   remain in place; no unverified cache reuse was enabled.
3. The host MCQ adapter had selected a source-omitted answer as an exception.
   Recognized negative stems now abstain, including the forced-letter output,
   because absence or a nearby negator does not establish an exclusion. This
   intentionally also abstains when an exception is actually supported. The
   positive lexical heuristic is still not a semantic verifier, and this host
   adapter change is not a NativeBrain answer-quality result.
4. Synthetic adversarial tests demonstrate that an exact substring can omit
   its original negation and still be a source substring. The gate labels this
   `SOURCE_SUBSTRING_ONLY`, never semantic entailment or medical validation.

The previous native Qwen evaluation remains the latest actual answer result:
275/336 fully correct (81.85%, Wilson 95% 77.37–85.60), 28 partial, 22
incorrect, 11 supported refusals, and 101/101 unsupported refusals (Wilson 95%
96.34–100%). Review was AI-only and provisional. These questions are now DEV.
The older host total p50/p95 was 31.94/39.86 s and first complete clause
29.55/37.33 s; neither is phone acoustic latency. No new independent, sealed
400+100 evaluation, expert review, confidence calibration, native prompt-token
coverage or new model-answer comparison has been completed.

## Verification and inherited CI

- `python -m unittest discover -s backend/tests -v`: 60 passed.
- `python -m unittest discover -s tools -p 'test_*.py'`: 81 passed.
- `python -m unittest discover -s evaluation -p 'test_*.py'`: 16 passed;
  retrieval identity tests: 2 passed.
- `cd tools/omega_atlas && python -m unittest -v test_warp3_adversarial_quotes`:
  5 passed.
- `PATH=/workspace/neu205-tools/jdk/jdk-21.0.13+9/bin:$PATH bash tools/test_core.sh`:
  25 passed, one private test group skipped, and four new synthetic checks passed.
- Android Gradle `testDebugUnitTest lintDebug --offline` with the full JDK and
  local SDK: 62 tests, 1 skipped, no failures; lint passed. The initial attempt
  with the system JRE failed because its `jlink` was absent; rerunning with the
  existing full JDK succeeded.
- PR #1608's deterministic CI failed eight repository-wide tests. The exact same
  eight test names failed in the live-main deterministic CI run, including
  canon freshness, finance, policy and startup-audit tests. The unrelated tests
  were not changed. A local attempt could not reproduce their assertions
  because `embedded-postgres` was not installed in this worktree.

## Sandbox and next actions

A separately signed, private **x86_64 emulator-only** debug APK was built with
application ID `ai.neu205.one.sandbox`, SHA-256
`9708ffc3ab2cd0cfcfc196b579863509c46073d4c564511619c7c2b703f6c257`.
It embeds private assets and must not be published. Its local test certificate
is distinct from the unavailable original release signing identity. There was
no physical phone connected and no installation on an owner's phone. An x86
test APK is not an ARM64 release. A forced second build with the same toolchain
and test key produced the identical APK hash; this is same-environment
repeatability, not an independent release rebuild.

An isolated x86_64 software emulator reached ADB, but Android first boot never
completed. The first installation failed because the package service was not
ready; the retry transferred the APK but failed inside the initializing package
manager. No app startup, JNI, cancellation or device latency test ran. The
isolated emulator and its private ADB server were subsequently stopped.

Four independent authoring workers began a new private question set after the
candidate code commit. The first four drafts contain 506 total questions, but
are **not a frozen evaluation**: supported questions are unevenly distributed
across source pages, unsupported questions are mostly missing-patient-data
variants, and one question exactly overlaps a previously exposed question under
case-folded punctuation-normalized matching. Paraphrase and conceptual overlap
have not been ruled out. Separate supplementary drafts and an aggregate novelty
audit are in `/workspace/neu205-private/overnight-eval-20261106/`; they are
unreviewed, potentially ambiguous, and must not be published. A reviewer
reported that an initial quotation screening had used the wrong page range;
that screening is invalid and no completed semantic review has been established.
The draft preregistration is not a freeze, no new candidate
inference has run, and no scores may be derived from these drafts. Future work
must account for question overlap, page/figure coverage, unsupported diversity,
independent semantic review, blinded grading and every fixed denominator.

Next: improve selection of the 23 exposed DEV misses without promoting DEV to
blind evidence; freeze a disjoint independently authored and reviewed test before
candidate inference; measure actual native prompt evidence and end-to-end
latency. Compare alternatives including a real local reranker if resources and
licensing permit; no such reranker has yet been benchmarked. Verify compiled
index persistence, corruption and rollback before any Android integration.
Do not enable the research retrieval or claim the requested release gates until
independent accuracy, safety, provenance and actual device measurements pass.
