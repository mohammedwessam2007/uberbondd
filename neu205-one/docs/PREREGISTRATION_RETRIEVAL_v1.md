# Pre-registration — NEU205 evidence retrieval tournament v1 (2026-11-03)

Written and committed BEFORE any new retrieval strategy is run on the held-out TEST split.

## Data
- Probe sets by three independent authoring agents (they never saw engine code or the exam):
  pages 1–100 (228 items), 101–200 (240), 201–299 (232) = **700 items**: **593 supported**
  (443 test / 150 dev), **107 unsupported** (all test). The earlier "681" total in a progress
  message was an arithmetic error; the files contain 700.
- Owner-authored unsupported DEV set: 30 items (calibration of abstention only).
- The historical exam is NOT used here.

## Gold evidence
A chunk *supports* a probe if, after lowercasing and whitespace normalisation, it contains the
probe's verbatim `source_quote`, or contains ≥ 85 % of the quote's content tokens (quotes that
cross a chunk boundary). Probes with no supporting chunk count as chunking failures (reported).

## Metrics (per split)
Recall@1/5/10/20 of ≥1 supporting chunk, MRR@20, page-hit@5 (chunk page span ±1 of any gold
page), per-part (pages 1–100 / 101–200 / 201–299), host p50/p95 query latency, index RAM/disk,
model load time.

## Selection rule (decided on DEV only)
1. Primary: highest DEV Recall@5.
2. Ties within 2 points: lower host p95 latency, then smaller model.
3. A neural component is admitted only if it adds ≥ 3 points DEV Recall@5 over BM25 alone.
4. The chosen configuration is then run ONCE on TEST; TEST numbers are reported, never tuned on.

## Release thresholds (retrieval layer, host)
- TEST Recall@5 ≥ 0.85 and Recall@10 ≥ 0.90 for "evidence layer adequate for Qwen".
- Host p95 retrieval ≤ 150 ms (phone must be re-measured; host is not phone).
Failing these is reported as failing; thresholds will not be lowered after seeing TEST.

## Answer layer (Qwen) — thresholds fixed now, run when weights are available
- Supported TEST: correct ≥ 0.80; confidently wrong ≤ 0.05.
- Unsupported TEST: refusal ≥ 0.95.
- Oracle-evidence run (gold chunk given) reported separately to split retrieval vs reasoning errors.

## Addendum A (2026-11-03, before any Qwen answer evaluation)
New candidate after weights became reachable: genuine mxbai-edge-colbert-v0-17m (official ONNX,
projection matrices verified equal to official safetensors, tokenizer parity 350/350 with the
reference library). DEV: R@1 .767, R@5 .940, R@10 .960, p95 82 ms. Under rule 2 it ties the
hybrid (R@5 within 2.0 points) and loses on latency, so the **retrieval default stays BM25+bge**.
Answer-level decision rule (fixed now): run the same Qwen model/prompt on the same DEV items with
(a) hybrid evidence and (b) ColBERT evidence; adopt ColBERT only if it improves Qwen DEV correct
answers by ≥ 3 points without more confident-wrong answers. The winner (and only the winner) is
then run once on TEST. Qwen model choice: the model with the most DEV correct answers among
those with ≤ 5 % confident-wrong on supported and ≥ 90 % refusal on DEV unsupported; ties → faster.

## Decision record (after independent DEV grading, before any TEST answer run)
Independent, config-blind grading of 450 DEV answers (6 configurations × 75 items) replaced the
automatic phrase scorer, which misjudged answers in both directions. Results (45 supported / 30 unsupported):
1.7B hybrid-110w 31 correct / 4 wrong / 1 false; 1.7B ColBERT-110w 31 / 4 / 3; 1.7B hybrid-5 chunks
35 / 2 / 3 (TTFT ×1.9); 4B 31 / 6 / 2; **Qwen3.5-4B hybrid-110w 33 / 4 / 0**; 1.7B oracle 32 / 0 / 3 (9 refusals).
- ColBERT: NOT adopted (no improvement in Qwen correctness, more false answers). The earlier
  adoption note (commit 24ad759) was based on the automatic scorer and is withdrawn.
- No model meets the ≤5 % confidently-wrong bar on DEV (best 4/45 = 8.9 %). The best available,
  Qwen3.5-4B Q4_K_M + BM25/bge hybrid + 110-word sentence evidence, goes to TEST and will be
  reported against the bar as-is.
