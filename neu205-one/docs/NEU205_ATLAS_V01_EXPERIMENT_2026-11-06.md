# NEU205 Atlas v0.1 | opt-in lexical-proximity retrieval experiment

Status: **experimental, NOT default, NOT release-ready**. This is a strict code-only experiment built atop the owner's hash-verified, original 299-page source corpus. It is not a semantic medical relation graph. This report does not expose any private book text, past questions, grades, patient data, model files or signing identity.

## Objective and mechanism

The legacy Java in-process `EvidenceIndex` already verifies `corpus.jsonl` and every passage's SHA-256, uses the baseline BM25, and optionally allows dense/ColBERT ranking. The native phone route currently selects ordinary BM25. The `AtlasReranker` operates **only after** BM25 has produced candidates and, when explicitly enabled, reranks unchanged original row IDs with bounded diagnostics:

- IDF-weighted question-term co-occurrence **inside one intact source sentence**, not just anywhere in a paragraph.
- Query-term distance inside that source sentence, favoring co-located evidence over unrelated word bags.
- General lexical cues for anatomical relation terminology (supply, innervation, drainage, origin/insertion, boundaries/direction). They do **not** establish a subject-predicate-object relationship or medical entailment.
- BM25 remains the dominant component. No question/answer memorization, no external embeddings, no secondary model, no internet, no new payment or change to the verified corpus.
- No text is generated, patched or rewritten. SHA-pinned original source passages and citations flow through the existing evidence API unchanged. No new source chunks or derived clinical facts are committed.

`EvidenceIndex.enableExperimentalAtlas()` is the **only** activation mechanism. It is not invoked by production `NativeBrain`, launchers or Android settings. It refuses activation when dense/ColBERT strategies have been attached. It preserves the frozen default strategy `bm25-v1` and the existing coverage/refusal logic. On cancellation it returns no ranked candidates.

## Actual verification (November 6, 2026)

The historical owner-private v05 book archive was re-read and verified against its manifest. Recovered corpus SHA-256: `d886e87513dc930df05f827682acafb69da8957a919d3d27ea770b35dba427d5` (1,695 original, source-hash-verified passages, all 299 pages represented). No private bytes were pushed to GitHub.

**Historical DEV-only (pages 1–60):** 30 supported source-derived probes (NOT the newer 437-question holdout, NOT fresh blind, NOT medical accuracy):

| Top-five retriever | Exact source-quote present | Source page present |
| --- | ---: | ---: |
| Original BM25 | 24/30 | 26/30 |
| Optional Atlas lexical rerank | **25/30** | **27/30** |

The Java implementation reproduces these exact aggregate counts on the original verified corpus. Two changed DEV probes had positive outcomes; neither identified regression in these two diagnostics. The entire result is small and non-independent; larger, unseen development and then newly sealed clinical evaluation are essential.

Benchmarked Python host retrieval only, five repeats across those 30 DEV queries: plain BM25 p50 **0.144 ms**, p95 **0.897 ms**; Atlas p50 **0.785 ms**, p95 **2.487 ms**. Different runtime and hardware from Android. These are *not* Qwen inference, first-audible-word, or phone figures.

**Tests:** 18 Python source/hash/cancellation-free excerpt/integrity tests; 11 Java synthetic reranker checks. The Java compiler successfully built the actual original `Bm25`, `EvidenceIndex`, `MiniJson`, `DenseIndex`, `ColbertIndex` classes and opt-in Atlas. The Java full-book DEV diagnostic completed and reproduced the Python counts. This does **not** certify all Android or host regression suites.

## A rejected shortcut: premature sentence compaction

In the same 30 DEV probes, simply selecting short sentence windows from BM25 top-ten passages preserved the exact oracle supporting quote only **20/30**. Top-five intact passages preserved **24/30**; top-ten intact passages were able to retrieve **28/30**, but often exceeded a plausible 2,048-token Qwen context budget. Naively shortening evidence would therefore be an unsafe regression. The optional Python `excerpt()` is for diagnostics and explicit source-span verification only; it is NOT integrated into the Android answer path.

Expanding the Atlas top-five hits with immediate same-section neighbors improved quote availability to 27/30 but increased average source words from about 460 to 836 across DEV queries. It is not enabled. More context is not automatically more correct; model-context and latency checks must precede adoption.

## Next falsification experiment

1. Pin a larger previously unseen source-retrieval DEV set. Compare **paired** exact-quote/page recall, distractor sensitivity, negative/lateral relations, coverage calibration and whole-qualifier retention. Do not tune against the already-exposed 437-question medical evaluation.
2. Measure rerank overhead and memory on the actual OnePlus, and re-run existing Evidence API/Java/Python parity, Android Robolectric/lint checks. Keep baseline selectable.
3. With clinical graders and a **new** frozen QA holdout, measure fully correct, assertive medical errors, unsupported refusals, latency and thermal stability **as end-to-end outcomes**, not as retrieval proxy metrics. Original V12 result remains 275/336 fully correct and 22 reviewer-marked assertive errors, not improved by these experiments.
4. Only promote after source provenance invariants hold, no meaningful unsafe regression occurs and independent medical/phone acceptance criteria pass. Otherwise leave feature disabled and roll back the experiment branch. No original signing identity, private keys, paid inference, phone installation, public course upload or merge is authorized.

## Run (requires owner-private assets; local only)

Python, using the 1,695-passage v05 corpus and historical DEV probes outside Git:

```bash
python -m unittest -v test_atlas.py
python atlas.py --corpus /PRIVATE/corpus.jsonl --manifest /PRIVATE/corpus.manifest.json --dev-probes /PRIVATE/probes_p001_100.json
```

Java, in the existing project source tree (code-only synthetic checks plus optional private DEV check):

```bash
javac ai/neu205/one/core/MiniJson.java ai/neu205/one/evidence/*.java
java ai.neu205.one.evidence.AtlasRerankerTests
java ai.neu205.one.evidence.AtlasDevDiagnostics /PRIVATE/corpus.jsonl /PRIVATE/corpus.manifest.json /PRIVATE/probes_p001_100.json
```

Do not publish the private files, private command output or logs containing user paths. The diagnostic prints aggregate counts only. No new blind accuracy, phone deployment, signed APK or on-device proof is claimed.

## Scope of source authority and founder ideas

Relevant original founder IDs actually consulted: **#0058** (error discovery before harm), **#0139** (latency dependency restructuring), **#0146** (source-provenance knowledge packet), **#0148** (knowledge routing), **#0349** (machine-checkable invariants). Operational application is limited to source hash checks, bounded lexical source evidence, paired falsification and explicit test receipts. These historical source ideas are a design rationale, not proof of medical correctness. Ω51 source/zero-trust checks and Ω52 falsification/verification; Ω46 harm-aware clinical caution. The full 52-roster was available but 52/52 were not applied.

**Receipt:** R02 originals preserved, R03 source verification, R04 measurable indexing, R07 matched baseline falsifier, R08 block unsafe clinical inference, R09 no phone/paid effects, R10 exact test outcomes, R11 reversible PHOENIX experiment, R12 truthful status. Experimental code only; no release/medical outcome.
