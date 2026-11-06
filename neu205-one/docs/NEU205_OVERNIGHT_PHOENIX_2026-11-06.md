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
All 1,695 corpus rows passed the existing per-row source-hash and page checks.
The 299-page private evaluation text matched a fresh `pdftotext -layout`
extraction exactly on 299/299 pages. The historical 1,711-capsule v11 SQLite
and its original manifest were not located under the private workspace or in
the recovered book archive; the old receipt is not proof that those files are
present. The historical v11 corpus pin differs from the recovered v05 corpus,
so a newly derived index must have distinct, truthful provenance.
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
   A further nine-variant DEV packing sweep reached at most 129/150 with a
   weaker page prior, changing 68/150 selections. Other variants scored 124–128;
   none was promoted because accuracy, qualifiers and generalization remain
   unmeasured. A separately compiled query-term coverage reranker reduced hits
   to 125/150 (three gains, five losses) and was rejected. See the detailed
   sweep receipt for all results and timings.
2. NativeBrain uses strict incremental UTF-8 decoding for streamed byte pieces,
   preserving split multibyte characters and cancelling on malformed bytes.
   A synthetic 1,960-byte, 196-piece host microbenchmark averaged 0.273 ms for
   the old repeated decoding and 0.016 ms for the new decoder over 1,000
   iterations. This small decoder-only finding does not demonstrate any change
   in model or speech latency. JNI recurrent-state clearing and cancellation
   remain in place; no unverified cache reuse was enabled.
   A separate real-model host `llama-bench` profile used synthetic tokens,
   pinned Qwen, CPU only, batch/ubatch 64, two repetitions, and a four-CPU
   cgroup on an AMD EPYC 9V74. At one thread, 256-token prefill averaged
   19.42 s (13.18 tokens/s) and a separate 32-token decode averaged 5.06 s
   (6.32 tokens/s). At four threads the corresponding values were 5.56 s
   (46.05 tokens/s) and 2.55 s (12.56 tokens/s). A second four-thread run
   measured 1,024-token prefill at 24.46 s (41.87 tokens/s) and a separate
   64-token decode at 5.32 s (12.04 tokens/s). These are isolated synthetic
   phases, not a summed user turn, first-clause timing, or device measurement;
   two repetitions do not establish tail latency. The Android JNI already
   selects up to four threads. The benchmark was llama.cpp `c6a0ff11a` build
   12117, binary SHA-256
   `1dc43a69da3f4cc1862766f2aeecc05512003f0734756b67c2b5f6dbd334cfa9`;
   private raw receipts are under `/workspace/neu205-private/receipts/` in
   `synthetic-qwen-20261106` and `synthetic-qwen-long-20261106`.
   Separately, a paired actual native-pipeline DEV experiment completed four
   exposed supported cases with five passages and then the same four with three.
   Median host text time was 28.832 s versus 21.491 s, and prompt lengths were
   903–1,039 versus 572–692 tokens. The predictions were sealed before grading.
   This small, fixed-order run used separate processes with no controlled warmup;
   it cannot prove accuracy or latency generalization. An independent AI-only
   reviewer graded blinded answers 4/4 fully correct for five passages and
   3/4 fully correct plus 1/4 partial for three. The same review flagged
   potentially unsupported wording in one five-passage answer and two
   three-passage answers, even though one of those responses was graded fully
   correct; those flags and grade categories must both be retained. Citation
   fabrication was initially unknown because all cited pages were not provided
   to the reviewer. A subsequent blinded audit against the PDF classified
   citations as supported in 3/4 five-passage and 2/4 three-passage responses,
   and irrelevant or insufficient in the remaining 1/4 and 2/4 respectively;
   zero were classified as fabricated in this small sample. This is neither
   clinician review nor a fresh blind holdout. The
   shorter path is not enabled by default. Receipts and predictions remain in the private
   `prompt-length-dev-20261106` directory.
   A third run on the same cases used four passages, after the five- and
   three-passage runs, in a separate process. It completed 4/4 with median
   host text time 22.832 s and 734–845 prompt tokens. A different independent
   AI reviewer, blinded to the five/four assignment, rated 4/4 answers fully
   correct for both settings. That reviewer identified at least one supporting
   page for each response but also flagged irrelevant additional cited pages
   in 5/8 responses and a potentially unsupported claim in one baseline
   response. The two citation reviewers used different criteria; their results
   are not interchangeable. Four exposed cases and uncontrolled order cannot
   establish noninferiority or justify changing the production passage count.
   A subsequent counterbalanced 12-case exposed-DEV follow-up has been started
   under `/workspace/neu205-private/prompt-length-dev-12-20261106/`, with a
   hash-pinned preregistration and per-answer journals. It is not the fresh
   757-row draft. Both five- and four-passage settings completed 12/12 and were
   sealed before grading. Median host total was 26.699 versus 25.403 s;
   median first complete clause was 24.348 versus 22.940 s; median prompt
   length was 918.5 versus 786.5 tokens. Four passages were faster on 9/12
   paired cases, with 1.099 s median paired total reduction. Independent
   blinded single-AI review classified both settings as 10/12 fully correct
   and 2/12 partial. Across all 24 responses it flagged three unsupported
   assertive claims, four omitted qualifiers, and extra irrelevant cited pages
   in 19 responses; categories overlap. This exposed DEV result does not
   establish noninferiority, fresh accuracy, or phone qualification.
   The first detached supervisor and Java worker exited
   unexpectedly with zero completed rows and no identified cause; they became
   zombies, and the original journal was preserved. Before resuming any future
   interrupted run, verify both
   the prior supervisor and its recorded Java child are absent and inspect for
   any matching live experiment process; never start a second writer or kill
   unrelated processes. The private `resume-safely.py` checks process state,
   matching workers and lock ownership;
   it was updated to distinguish zombies and started a managed foreground
   resume. Use it only in a managed long-running session, not `nohup`. Seal
   every completed or failed prediction before any
   blinded source review. This research run cannot qualify the phone or release.
3. The host MCQ adapter had selected a source-omitted answer as an exception.
   Recognized negative stems now abstain, including the forced-letter output,
   because absence or a nearby negator does not establish an exclusion. This
   intentionally also abstains when an exception is actually supported. The
   positive lexical heuristic is still not a semantic verifier, and this host
   adapter change is not a NativeBrain answer-quality result.
4. Synthetic adversarial tests demonstrate that an exact substring can omit
   its original negation and still be a source substring. The gate labels this
   `SOURCE_SUBSTRING_ONLY`, never semantic entailment or medical validation.
   WARP3 now also returns and validates half-open UTF-8 byte offsets against
   the extracted page text, alongside its existing character offsets. These
   are explicitly not offsets into the PDF binary. Unicode and altered-offset
   tests cover the binding. A paired exposed-DEV run after this validation
   measured full scoring p50/p95 17.122/31.138 ms versus bounded scoring
   7.687/12.459 ms, with identical selections and 127/150 normalized quotation
   hits in both modes. These are host lookup measurements only.
5. New evaluation freeze manifests bind a minimum target of 400 supported and
   100 unsupported items, and grading checks the targets in the frozen manifest.
   Historical schema-1 manifests retain their 300/100 floor. The tool no longer
   claims it verified sampling, clinician review, or prediction blinding; the
   relationship between CLI targets and the hashed preregistration still needs
   independent review. No new questions have been frozen or graded.

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
- `python -m unittest discover -s evaluation -p 'test_*.py'`: 23 passed;
  retrieval identity tests: 2 passed.
- `python -m unittest discover -s tools/omega_atlas -p 'test_*.py'`: 58 passed,
  including the adversarial quotation and UTF-8 offset cases.
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
unreviewed, potentially ambiguous, and must not be published. Separate draft
supplements bring the provisional inventory to 714 rows citing 255 distinct
digital pages; citation counts are not verified evidence coverage. A reviewer
then drafted questions for 39 additional previously unreferenced pages, bringing
the draft citation union to 294/299 at that snapshot. Four further page-specific
drafts cite pages 2, 53, 57 and 95; the latest private inventory contains 757
draft rows citing 298/299 pages, with page 1 classified as front matter. One
normalized question exactly overlaps a prior exposed set. A private exhaustive
lexical triage against 1,137 historical questions flagged 41 additional
potentially similar prior/draft pairs and 143 within-draft pairs; seven lexical
groups contained 71 of 140 explicitly unsupported draft items. These flags
received provisional independent semantic triage: of the 42 prior/draft pairs,
30 were judged the same question, four substantially overlapping, one partly
overlapping and seven related but distinct. Of the 143 within-draft pairs,
one was judged the same question, 24 related but distinct, and 118 repetitive
unspecified-case templates. Counts are pairs, not unique questions. Decisions
do not authorize automatic exclusion; unmatched paraphrases may still exist.
These heterogeneous drafts still need schema harmonization,
independent item-level review, and question and evidence validation. Figures and
tables need independent visual/source review. The draft count is not a fixed
evaluation denominator. A reviewer
reported that an initial quotation screening had used the wrong page range;
that screening was invalid and subsequently corrected. Provisional AI-only
reviews of the four original batches flagged context problems and repetitive
unsupported cases. In one batch the reviewer accepted 24/127 and rejected
103/127 under strict source-context and distinctness criteria; many rejections
identify incomplete citations rather than false answers. Other review rubrics
have different decision categories and cannot be pooled as a pass rate.
The 251 supplemental drafts received provisional AI-only reviews, with
qualifier, scope, repetition, and figure/table issues flagged; separate repair
proposals remain unreviewed. Neither
review nor exact quotation checks establish clinical correctness. The draft
preregistration is not a freeze, no new candidate
inference has run, and no scores may be derived from these drafts. Future work
must account for question overlap, page/figure coverage, unsupported diversity,
independent semantic review, blinded grading and every fixed denominator.

An additional private authoring pass drafted 24 varied unsupported cases,
separately from the 757-row inventory. An independent provisional AI reviewer
judged 23 to lack the precise requested answer and one to have a textbook-
grounded answer. The reviewer also flagged nine unverified or false premises,
five ambiguous cases, four clear with material caveats, and six clear cases;
several cases overlap by topic. These are reviewer categories, not a final
eligible denominator. The text-only PDF states that illustrations and captions
were removed, so the original figures' appearance is not verified. No item was
silently discarded or promoted to a sealed test.
The author also proposed 10 revisions and 18 additional cases. A separate
provisional review found one of those 28 answerable from the book and flagged
ambiguous wording, unverified premises, caveats and topical overlap among the
rest. All remain private draft material requiring documented selection and
independent adjudication before any freeze.

A separate private readiness inventory covers 959 heterogeneous source and
repair-proposal rows; these are not 959 unique questions. It matched 833 rows
to independent review records and mapped explicit issues to 325 rows, a
conservative lower bound. The remaining rows are on hold, not approved. The
private `selection-readiness-report-20261106-private.md` and accompanying
disposition JSONL preserve source references, outstanding review and known
overlap. They do not establish an eligible 400/100 set or authorize a freeze.

Next: improve selection of the 23 exposed DEV misses without promoting DEV to
blind evidence; freeze a disjoint independently authored and reviewed test before
candidate inference; measure actual native prompt evidence and end-to-end
latency. Compare alternatives including a real local reranker if resources and
licensing permit; no such reranker has yet been benchmarked. Verify compiled
index persistence, corruption and rollback before any Android integration.
Do not enable the research retrieval or claim the requested release gates until
independent accuracy, safety, provenance and actual device measurements pass.


## Final continuation handoff for Claude

Repository draft PR: https://github.com/mohammedwessam2007/uberbondd/pull/1610
Base: `neu205/omega-finishline-lab-20261106` (PR #1608).
Working branch: `codex/neu205-overnight-proof-engine-20261106`.
Worktree: `/workspace/neu205-overnight`. Do not reset the other checkouts or
rewrite either ancestor PR. Inspect live Git/PR head before resuming.

The current decision is **IMPROVED BUT BLOCKED**, not release-ready. Five
passages remain the NativeBrain default. Four passages had a modest host speed
benefit and equal coarse grades on only 12 exposed DEV cases; three passages
lost a full-correct grade in the separate four-case experiment. No shortened
prompt setting was shipped. The independent new evaluation is not frozen;
there is no new 400/100 correctness result. Phone acoustic latency, original
release signer, ARM64 release and physical device qualification remain absent.

A new private source-memory derivation was compiled after confirming exact
299/299 extracted PDF page matches. It has **1,716 capsules**, zero omitted
non-whitespace characters, passes SQLite integrity/source binding, and has SHA
`04cc5d074289d9cd9213c4eb69f1ad0ed4483cf56866997e684ac82786bd49e9`.
It is at `/workspace/neu205-private/active-memory-derived-20261106/` with
`custody.json`. It is a new derivation bound to recovered v05 corpus, not the
unrecovered historical 1,711-capsule file. It has not been enabled or medically
benchmarked. Never substitute its identity for the historical receipt.

The x86_64 sandbox APK was built twice to identical bytes and stayed private.
The later ARM64 sandbox build worker hit a provider usage limit before returning
an artifact; no ARM64 sandbox success is claimed. Continue locally if toolchain
and assets remain available. Never replace the original app signer or install
on the owner's phone without the separate device authorization in issue #1609.

Private artifacts to inspect without publishing their contents:

- `/workspace/neu205-private/prompt-length-dev-12-20261106/`: completed 24
  predictions, preregistration, interrupted-attempt history, hash-bound seal,
  blinded grade file and `unblinded-grade-aggregate.json`. All four segments
  completed; do not rerun or resume this completed experiment.
- `/workspace/neu205-private/prompt-length-dev-20261106/`: separate four-case
  five/three/four comparison, seals, assignments and source/citation reviews.
- `/workspace/neu205-private/overnight-eval-20261106/`: source questions,
  original and revised drafts, per-item independent reviews, semantic novelty
  audit, and selection-readiness report. These include overlapping variants;
  **do not add them together as unique test questions**. The 959-row readiness
  inventory is not a fixed evaluation denominator. Known prior-question overlap,
  unsupported repetition and citation defects must be resolved before freeze.
- `/workspace/neu205-private/receipts/warp3-bounded-byte-offset-20261106.json`:
  latest paired retrieval receipt including UTF-8 provenance validation.
- `/workspace/neu205-private/receipts/synthetic-qwen-20261106/` and
  `synthetic-qwen-long-20261106/`: real pinned-model synthetic throughput.

Next engineering work: independently select and harmonize a defensible disjoint
400/100 set, record every pre-freeze exclusion/repair and stratification gap,
verify all evidence and unsupported scope, then freeze before candidate inference
and seal predictions before blinded grading. Do not tune on new test answers.
Investigate source-window selection and qualifier entailment without converting
literal quote checks into semantic proofs. Build an isolated ARM64 test candidate
and complete permitted emulator/host checks; physical acoustic tests remain a
separate device gate. Preserve all negative results and private artifacts.

No paid API, purchase, main merge, deployment, physical-phone installation or
publication of private source/evaluation/model/signing material was performed.
