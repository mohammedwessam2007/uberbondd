# Retrieval tournament v1 — results (2026-11-03, host x86 4-core, onnxruntime CPU)

Pre-registration: `docs/PREREGISTRATION_RETRIEVAL_v1.md` (commit a60aadf, before any TEST run).
Corpus: 1,695 structure-aware chunks (110 words, 30 overlap, section path, page span, source hash)
from the 299-page text-only book (private; corpus_sha256 recorded in the private bundle).
Probes: 700 items from three independent authoring agents = 593 supported (150 DEV / 443 TEST)
+ 107 unsupported. (An earlier progress message said "681"; that was an arithmetic error.)
3/443 TEST probes have no supporting chunk (quote spans >85 % across a chunk boundary) and
count as misses for every strategy.

## Prior work reproduced before changes
Recovered `NEW_HYBRID` (owner backup, manifest 35/35 OK): 12 tests (11 pass, 1 skipped);
16 developer probes BM25+RRF top-1/5/15 = 6/12/15 at ~2.5 ms; book-trained Word2Vec MaxSim
6/12/15 at ~17 ms — matches the earlier report; not promoted.

## DEV (150 supported) — selection data
| strategy | R@1 | R@5 | R@10 | R@20 | MRR | host p50 / p95 ms |
|---|---|---|---|---|---|---|
| BM25 | .560 | .853 | .913 | .947 | .698 | 0.3 / 2.3 |
| bge-small fp32 | .593 | .880 | .933 | .947 | .715 | 40 / 67 |
| bge-small int8 | .573 | .880 | .920 | .947 | .703 | 24 / 48 |
| all-MiniLM-L6 int8 | .547 | .787 | .867 | .940 | .651 | 12 / 24 |
| RRF BM25+bge fp32 | .620 | .920 | .967 | .973 | .751 | 40 / ~60 |
| **RRF BM25+bge int8** | .620 | .920 | .973 | .980 | .751 | 36 / 56 |
| RRF BM25+MiniLM | .627 | .893 | .973 | .980 | .747 | 16 / ~25 |
| BM25 → cross-encoder top-30 | .733 | .913 | .947 | .947 | .818 | 1,093 / ~1,300 |
| RRF(bge int8) → cross-encoder | .740 | .953 | .980 | .980 | .833 | 1,115 / ~1,350 |

## TEST (443 supported) — run once
| strategy | R@1 | R@5 | R@10 | R@20 | MRR | page@5 | p95 ms | thresholds (R@5≥.85, R@10≥.90, p95≤150) |
|---|---|---|---|---|---|---|---|---|
| RRF(bge int8) → CE (rule-1 pick) | .725 | **.930** | .946 | .950 | .809 | .968 | 1,399 | recall pass, **latency FAIL** |
| **RRF BM25+bge int8 (default)** | .585 | **.851** | .903 | .944 | .704 | .941 | **52** | **pass** |
| BM25 (baseline) | .528 | .835 | .894 | .930 | .660 | .932 | 1.2 | recall FAIL |

R@5 by part, default config: p1–100 123/143, p101–200 131/153, p201–299 123/147.
Two configurations were evaluated on TEST (disclosed): the rule-1 winner failed the latency
threshold, so the best latency-compliant DEV configuration was also run.

## Decision
- **Default evidence route: BM25 + bge-small-en-v1.5 int8, RRF (k=60).** Only config passing all
  pre-registered retrieval thresholds on held-out TEST (narrowly: R@5 .851 vs .85).
- Cross-encoder rerank: **optional accuracy mode**, +7.9 R@5 points, ~1.1–1.4 s host; admit only
  if measured phone latency fits the speech budget.
- MiniLM: rejected (worse than bge at similar cost). bge fp32: no gain over int8.
- Models (owner-private, third-party npm repackagings of Xenova exports; upstream bge snapshot
  `ea104dac…` recorded; independent upstream hash check impossible here — HF unreachable):
  bge-small int8 `bf490cda…cc63` (33.8 MB), tokenizer `d241a60d…5c66`; dense vectors
  1,695×384 float32 = 2.6 MB (`c4368516…7b6d`).
- NOT RUN (weights unreachable from this container): mxbai-edge-colbert 17M/32M, EmbeddingGemma 2,
  Qwen3-Embedding-0.6B / Reranker, SPLADE. No claim is made about them.

## Java port (Android-ready, in-process)
`ai.neu205.one.evidence`: BM25 parity 150/150 identical top-10; WordPiece ids 150/150 identical;
hybrid top-10 149/150 identical (one rank-1/2 swap on an RRF near-tie from float32 vs float64
accumulation). The ONNX query encoder runs on device via ONNX Runtime (already in the app);
its Android execution is NOT yet tested.

## Not proven by this report
Answer accuracy (needs Qwen), phone latency, phone RAM/thermal, spoken-question robustness.
