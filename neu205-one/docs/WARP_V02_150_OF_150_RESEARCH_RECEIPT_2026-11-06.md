# NEU205 WARP v0.2 | High-recall source rescue | 2026-11-06

## Decision in one line

**150/150 historical source-page candidates recovered**, in an offline precompiled two-route page index. **NOT** 150/150 top-five passages, medically correct answers, or genuine unseen performance. The experimentally more efficient route is now *candidate discovery*, while source-span selection, reasoning and semantic entailment are unresolved.

## Custody, original evidence, and a benchmark correction

- The original owner-supplied 299-page PDF was read **privately**, verified using SHA-256 `c3298e8c5f7f807604be10f7376d67f05eb315dd982276263e8f6ad2e8e70940`.
- The original 1,695 passage corpus passed its SHA-256 validation against `d886e87513dc930df05f827682acafb69da8957a919d3d27ea770b35dba427d5`, including all per-passage source hashes.
- The 150 historical `dev` supported source-derived probes (the original 3 strata: 50/51/49) were used. Their source quotes / page labels are PRIVATE and are NOT bundled, published or sent to Github. The newer v12 437-question medical exam, answers and sealed grading data were not read or reused.
- One of the 150 quotations was **not a literal substring of a single baseline corpus chunk**, even after punctuation normalization, but its normalized text **does exist in the original PDF page 237**. This is a genuine chunk/format boundary issue, not an absent PDF fact. All 150 probes' normalized reference quotations were found on their declared original PDF pages. Exact printed characters may differ; the semantic equivalence of normalized text is NOT automatically attested.
- The 150 questions are **already exposed DEV**. All follow-on modeling, rank fusion and design changes that consult these results are exploratory. **No independent held-out accuracy claim.**

## What was researched (public technical sources; no vendor promises treated as local tests)

1. **Qwen3-Embedding-0.6B** and **Qwen3-Reranker-0.6B**, official Qwen implementation and technical report: https://github.com/QwenLM/Qwen3-Embedding ; https://huggingface.co/Qwen/Qwen3-Reranker-0.6B . These are real downloadable embedding and query-document reranking models, not yet installed/tested on the OnePlus. Qwen's published general benchmark scores are not NEU205 benchmark scores.
2. **Contextual Retrieval**, Anthropic's 2024 source-bound contextual BM25+dense+cascaded-reranking research: https://www.anthropic.com/research/contextual-retrieval . Its reported error reductions derive from Anthropic's evaluation data, not our private PDF.
3. **ColBERTv2** late-interaction token-level neural retrieval: https://aclanthology.org/2022.naacl-main.272/ and https://github.com/stanford-futuredata/ColBERT . Consider only if its query encoder, memory, power and accuracy beat the simpler cascade on the phone.
4. **2026 controlled biomedical retrieval ablation**: https://arxiv.org/abs/2605.02520 . Cross-encoder reranking helps precision in that study; naive multi-query expansion can introduce noise.
5. **2025 MedGraphRAG**: https://aclanthology.org/2025.acl-long.1381/ . Candidate relations must never be considered medical fact merely because an LLM extracted them.

## Actual v0.2 algorithm and implemented tests

The code-only `warp2_offline_page_index.py` verifies the original PDF digest, extracts all 299 text pages **once** (offline compilation), and constructs two sparse normalized TF-IDF inverted indexes, both with deterministic ranking and no pretrained model:

- Character **word-boundary 3–5-grams** to recover formatting, morphology and spelling variants.
- Whole-word **unigrams/bigrams** to rescue repeated medical phrases and combinations.

At query time, only matching postings and numeric scores are processed. The original PDF is not reopened and its full text is not rescanned. Each channel contributes 20 page candidates; the deduplicated set is ordered with reciprocal rank fusion. Source page SHA-256 and bounded exact span citation APIs are included. Every answerability/semantic gate is explicitly **NOT VERIFIED**; no statement is converted to an authoritative medical answer.

Thirteen synthetic tests passed in local `unittest` (source pin, source/page integrity, immutable snapshot, exact quote hash, invalid bounds, cancellation, same-source span, bounded input, non-entailment markers, deterministic retrieval). The original workbook remains untouched.

### Freshly executed exposed-source benchmark

| Metric | Actual result | Meaning |
|---|---:|---|
| Gold quotations present after formatting normalization in original PDF | **150/150** | Original source coverage, **not** index retrieval |
| Correct gold page in top 1 fused rank | **101/150** | Candidate source-page rank |
| In top 3 | **128/150** | Candidate source-page rank |
| In top 5 | **139/150** | Still **11 misses** |
| In top 10 | **144/150** | Candidate source-page rank |
| In top 20 | **148/150** | Candidate source-page rank |
| In overall bounded union (up to 40 pages) | **150/150** | **High-recall candidate pool ONLY** |
| Mean unique candidate source pages per question | **28.69** | 299 original pages; maximum 39 |
| Index construction on host | **~0.9 seconds** | Once per source/extractor revision |
| Host lookup p50/p95, run 1 | **2.63/5.11 ms** | No model, ASR, TTS, or phone |
| Host lookup p50/p95, run 2 | **3.74/6.92 ms** | CPU scheduling and cache vary |

**IMPORTANT:** Candidate pages are NOT poured into Qwen, and 28.69 pages per query is a *large* intermediate pool. The system still needs a high-precision atom/span ranker. This code was explicitly designed for offline host research, not as a ready Android Java/NNAPI/Qualcomm implementation.

### Failure experiment deliberately retained

When a simple lexical sentence picker was applied to the five highest-ranked pages, only **32/150** entire expected quotations appeared in its five selected excerpts. This is a stark falsifier: **perfect candidate recall does not equal correct minimal evidence or safe answer generation.** A follow-up research-only sliding window can raise quote presence, but spending ~320 words per page exceeds the practical 2,048-token Qwen context for five pages. It is not the shipping solution.

## Next invention: indexed warrants + neural listwise proof reranking

**Stage A: high-recall source locator, implemented.** Keep baseline BM25 and existing 1,695-passage Java EvidenceIndex unchanged. Maintain PDF-page rescue as an optional, independent, content-signed secondary route, compiled offline from the original user-private PDF.

**Stage B: compile word-offset evidence atoms ONCE.** Each source unit carries heading chain, exact source offsets, page hash, sentence/paragraph context, laterality/negation/number/temporal qualifiers, and reversible adjacency to parent. Never invent missing relation edges. Store private atoms in a signed/versioned local study pack. Duplicated facts on different pages retain distinct provenance and exceptions.

**Stage C: query intent and two-stage re-ranking.** Parse question for target relation, subjects, negation, side, count, exception and follow-up reference. Retrieve up to 40 candidate page IDs using the cheap index; intersect with precompiled 11,237 existing source units and retrieve the smallest high-recall atom shortlist. Use Qwen3-Reranker-0.6B or validated ColBERT **only on small candidate windows**, and compare actual fixed-index clinical QA, latency, memory and battery against CPU BM25. A broad 0.6B reranker invocation for 40 full pages could be slower than the original model, so benchmark a two-stage funnel first.

**Stage D: proof contract.** A medical assertion must be supported by an *independently reviewed* relation including direction, exception/negation and page-exact evidence, or an independently calibrated semantic entailment verifier. String hash checks establish source identity and literal quotation only. Proposed LLM relations remain `UNVERIFIED_CANDIDATE` until reviewed; conflicted or figure-only material triggers qualified uncertainty/refusal. No legal or medical guarantee of zero hallucinations is made.

**Stage E: answer/phone acceptance.** Before changing NativeBrain defaults, preregister fresh medically authored unseen syllabus questions spanning all 299 pages and wrong-side/wrong-direction/negation/out-of-syllabus traps. Preserve 100% denominator and independent clinician review. Measure supported full correctness ≥90%, confidently wrong ≤2% when measurable, unsupported refusal ≥95%, and actual OnePlus microphone-to-first-audible-word p50 ≤2.5s / p95 ≤5s separately. Those are aspirational release targets, **not observed outcomes**.

## Highest value falsifiers

1. Original 150 probes are DEV. A method tuned until it gets 150/150 on these questions may simply memorize their source-page mapping and cannot certify generalization. A true unseen independent test is indispensable.
2. The candidate pool contains up to 39 pages; if neural reranking of ~40 pages costs seconds, the fast index has not solved the audible-latency goal.
3. Slight spelling correction is not valid proof of an ion, side, dosage, number or anatomical relation. Canonical normalization is **evaluation-only**; the output source quote must be exact bytes with pinned offsets/hashes.
4. Figure-only source information may remain absent in a text-only PDF. Absent source is UNKNOWN, not evidence for an invented answer.
5. Citation + model consensus is not clinical entailment. Refuse unsupported assertive facts; count false refusals in the supported denominator.

## Privacy and deployment receipt

This deliverable is **source code + synthetic tests + aggregate metrics + this specification only**. The private PDF, its extracted pages, human/AI-authored DEV questions, source quotations, sealed v12 437 evaluation, passwords, keys, and model weights are not distributed. Nothing was installed on OnePlus, merged, paid for or deployed; the new runtime has not been benchmarked on a device.

Receipt: Applied Ω51 zero-trust source digests, Ω52 falsification, Ω50 metric denominators, Ω49 bounded OODA experiments; relevant founder #0139, #0146, #0148 and #0349 source-backed method; screened only relevant subset, not full 52/52 or 890/890 | Rules R02/R03/R07/R08/R09/R10/R11/R12 | Evidence: verified PDF, private historical benchmark and 13 standalone tests; NOT clinical performance.
