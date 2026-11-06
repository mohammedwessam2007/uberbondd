# C2 implementation receipt and continuation

**Status: tested code and measured host experiment; release HOLD.**
User mission kit (seven internal hashes verified) and live issue #1609 comment
6697644044 were read. Input is unified PR #1611 at
`d3682fe54e65b9dc545847726586dc34845bd134`, rechecked before checkpoint.
New worktree `/workspace/neu205-c2`, branch
`codex/neu205-c2-parity-20261107`. Main at startup was `dc832b70`.
Ancestors were preserved; no Claude patches were reapplied.

## Experiment 1: evidence gate parity

Hypothesis: the thresholds diverge despite equivalent coverage definitions.
Both routes use IDF-weighted coverage of distinct normalized query tokens over
heading plus text, with matching short-query/pronoun topic expansion. The Java
route can optionally use other retrieval strategies; parity here is **default
BM25 only**, not hybrid/Atlas/ColBERT or every possible query/tie.

A same-source cross-language regression was first run against the unchanged
thresholds: the intended parity test failed, with four disagreements at eight
specified boundaries. This was preserved as a negative baseline, not called a
successful parity result. Existing thresholds and candidate decisions:

| Coverage | Original native | Original companion | Candidate both |
|---:|---|---|---|
| .19 | NONE | NONE | NONE |
| .20 | WEAK | NONE | NONE |
| .24 | WEAK | NONE | NONE |
| .25 | WEAK | WEAK | WEAK |
| .44 | WEAK | WEAK | WEAK |
| .45 | WEAK | OK | WEAK |
| .49 | WEAK | OK | WEAK |
| .50 | OK | OK | OK |

The candidate takes the stricter intersection: NONE below .25, WEAK below .50.
It is never more permissive than either prior gate on all 1,001 tested grid
points. Empty, nonfinite and out-of-range coverage fails closed. Native queries
in [.20,.25) now refuse; companion queries in [.45,.50) now receive the weak
prompt. **Supported-answer refusal cost and medical benefit are unmeasured**;
this is a conservative deterministic routing change, not clinical calibration.
Rollback is native WEAK_COVERAGE=.20 and companion OK_COVERAGE=.45.

Four paired tests cover all boundaries, invalid coverage, source corruption,
negation, laterality, reversed relations, units, follow-up expansion, source
hashes and approximately equal numeric coverage (Java emits four decimals).
A reversed relation still receives lexical OK: the test explicitly retains
this falsifier. Coverage does not establish entailment, answerability or
confidence. No semantic verifier or medical fast-answer card was fabricated.

An additional 12 fixed, **ungraded** real-corpus diagnostic queries had zero
status, coverage, ranked-source-ID or hash mismatches; both routes returned
9 OK and 3 WEAK, zero NONE. No boundary transition was exercised by that small
sample. It is not a supported/unsupported denominator and cannot prove refusal
quality. It read only the original corpus, not evaluation questions or keys.

Commands (from `neu205-one` unless shown):

```sh
python -m unittest discover -s tools -p test_evidence_gate_parity.py -v
PATH=/workspace/neu205-tools/jdk/jdk-21.0.13+9/bin:$PATH bash tools/test_core.sh
/workspace/neu205-tools/jdk/jdk-21.0.13+9/bin/java -cp build/core:build/test ai.neu205.one.evidence.EvidenceApiTests
python tools/gate_diagnostics.py --corpus PRIVATE/corpus.jsonl --manifest PRIVATE/corpus.manifest.json --out PRIVATE/UNUSED-receipt.json
```

Private baseline: `/workspace/neu205-private/c2-parity-20261107/`.
Private real-corpus aggregate: `/workspace/neu205-private/c2-gate-diagnostics-20261107.json`.
Corpus SHA: `d886e87513dc930df05f827682acafb69da8957a919d3d27ea770b35dba427d5`.

## Experiment 2: actual native-stage timing

See `tools/native-probe/C2_STAGE_RECEIPT_2026-11-07.md` for exact source,
model/native hashes, hardware, commands, raw private pointers and limitations.
Additive JNI snapshots measure tokenization, prefill including state clear,
decode, first byte, total time, prompt/emitted tokens and Java callback cost.
Java snapshots synchronize with generation. Sampling, CPU threads, batching,
Qwen hybrid memory clearing and cancellation behavior were preserved.

On this Xeon 8573C host with four CPU quota/threads, synthetic short71 versus
long423 token prompts in short/long/long/short order had median prefill
2.484/14.214 seconds, decode .864/.902 seconds, total 3.357/15.126 seconds
(n=2 per length). The five completed outputs including post-cancel recovery
matched the fixed synthetic sentence hash. First-callback cancellation stopped
after one piece and recovery completed. This is not asynchronous prefill
cancellation, a 30-turn stability test, a controlled phone cold start, p95,
semantic correctness, ASR, TTS or acoustic latency. No evidence was removed
from a medical prompt based on this synthetic result. The useful measured
improvement is observability of the dominant prefill stage; no production
latency improvement is asserted.

## Verification

- Backend: 60 passed.
- Tools: 85 passed, including four new cross-language routing tests.
- Core: 25 existing + four negative-MCQ checks passed, one private KB group skipped.
- Evidence API: 18 passed.
- Android offline `testDebugUnitTest lintDebug`: success, 62 tests, one skipped,
  zero errors/failures, lint passed. JAVA_HOME is the local full JDK and
  ANDROID_HOME is `/workspace/neu205-tools/sdk`.
- Parent #1611 scoped source/framework CI passed; broad deterministic CI had
  eight failed test names, exactly matching main job 126807798409 when compared
  with parent job 128191782789. Browser/Postgres passed. Broad CI is not green.

## Continuation and authority

Claude owns independent medical evaluation. No sealed questions, answers,
review keys or fresh exam files were opened, regenerated, graded or tuned on.
Only synthetic source fixtures, fixed ungraded diagnostics and synthetic
model prompts were used. No paid route, purchase, phone install, deployment,
release, main merge or signer replacement was performed.

Next: have Claude measure supported false-refusals and weak-band safety under
this exact policy before any promotion; keep sealed data in Claude's lane.
Extend latency measurement to asynchronous prefill cancellation and a 30-turn
synthetic reuse sequence, then capture supported hardware audio stages only
when permitted. Independent validated relation cards are still absent: hashes
and literal quote matching cannot authorize a confident medical shortcut.

## Additional host cancellation and ARM64 custody

After observing stage 1 continuously across a 100 ms delay, cancellation joined
the worker in **20.516 ms** in one host sample. The interrupted generation
emitted zero tokens, first-byte remained absent, and recovery produced the
expected fixed synthetic output digest. The initial stage-entry-only run was
also preserved; it is not substituted for the stronger delayed-phase test.
Raw results are `prefill-cancel-active.jsonl` under the private timing directory.
This is one synthetic interruption, not a phone p95 or universal bound.

A separate private ARM64 sandbox compiled updated JNI and exported its timing
symbol. All LOAD segments were 16 KiB aligned. Two offline Gradle builds with
rerun tasks produced the same 263,071,852-byte APK SHA-256
`dd29298ea9c32a716bdf06087727e5be2ba9b975212359ccf337ccd412f8a2c0`.
Package: `ai.neu205.one.c2sandbox`; independent test certificate SHA-256
`7430e3fea0a99a9005aa6f955b74a7cd6e048314f1b6892e79d87db6bf646400`.
V2 signature, ARM64-only ABI, updated JNI, corpus/Whisper byte identity and
zipalign checks passed. Native SHA-256
`ef27c5fdd23cb4fe61812831e93fa39cdb8074f44fdd07babf79ce4b54ff6110`.
The APK embeds private textbook/Whisper assets and stays under
`/workspace/neu205-private/c2-arm64-sandbox-20261107/` with its receipt and
separate test key. **Never publish that APK or the key.** GGUF is not bundled;
owner-selected hash-validated model remains required. VersionName is inherited
`1.2.0-v12-reconstructed`, not a release claim. No installation or ARM execution
occurred; same-environment repeatability is not independent reproducibility.
