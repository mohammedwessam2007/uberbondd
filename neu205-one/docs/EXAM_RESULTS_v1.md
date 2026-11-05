# NEU205 EOM historical paper — results (aggregate only; per-item data owner-private)

Paper: Neuro-205, 28 Nov 2024, 115 MCQ + 5 matching = 120 response items (84 marks, weighting
unverified). Answer-free transcription by an evaluator agent; key built and checked against the
book by a separate evaluator agent after predictions were frozen. 111/120 keys verifiable
(A023, A029, A096, A107 and B001–B005 not verifiable; counted as not correct in /120).

| run | engine | blindness | raw /120 | 95 % CI | book-text-supported | committed wrong | abstained |
|---|---|---|---|---|---|---|---|
| Baseline (preserved) | 719a587 deterministic sentence engine | LIMITED-BLIND (engine frozen before any item was read) | **23 (19.2 %)** | 13.1–27.1 | 22/97 | 26 | 69 |
| Baseline, forced choice | same | same | 47 (39.2 %) | 30.9–48.1 | 44/97 | — | 0 |
| **Qwen system v1** | f89d3e2: Qwen3.5-4B Q4_K_M + BM25/bge hybrid, top-3 chunks | **LIMITED-BLIND, post-exposure** | **74 (61.7 %)** | 52.7–69.9 | **69/97 (71.1 %, CI 61.4–79.2)** | 12 | 29 |

Buckets (Qwen v1): text-supported 69/97; ambiguous 2/8; outside-book 3/6; figure-required 0/9
(5 abstained — no figure is available to a voice/text assistant). Item transitions vs baseline:
55 newly correct, 4 newly incorrect, 19 correct in both, 42 incorrect in both.

## Honest labelling
- **Post-exposure:** the Qwen system was designed after the baseline's aggregate score, failure
  taxonomy and three item snippets were seen. No item-level tuning, no exam text in any index or
  prompt, predictions frozen and hashed (`7fb03074…` primary) before scoring. It is not a fresh
  blind measurement and must not be compared with the baseline as an independent held-out gain.
- **Not book-only:** the MCQ prompt allows Qwen to fall back on general anatomy/physiology
  knowledge when passages are insufficient; part of the score may come from pretrained knowledge
  (and pretraining contamination with similar questions cannot be excluded).
- **84-mark extrapolation** (74/120 × 84 = 51.8) is hypothetical: item weights are not established.
- Host latency per MCQ p50 20.8 s / p95 49.2 s (includes reasoning tokens; not a phone or speech
  latency).
- Section B (matching): 0/5 scorable — the paper has no verifiable highlights for B001–B005.
