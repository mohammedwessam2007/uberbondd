# WARP3 bounded window scoring: research receipt

WARP3 is still an opt-in host research implementation. Its word budget is not the native Qwen token budget, its excerpts do not establish entailment, and this change does not claim medical accuracy or Android performance.

The previous implementation first chose page candidates, then scored window postings across the entire window index and discarded scores outside those pages. Window IDs are compiled in contiguous page ranges. The new scorer uses binary search in sorted postings to accumulate only IDs in the chosen ranges, while retaining global query normalization and original scores. Page text is still compiled once; page/window source hashes are unchanged. Valid pages must contain non-whitespace text, so every candidate page has at least one indexed window. Empty or whitespace-only pages are rejected.

A paired alternating-order test used the same 150 **historical exposed development** questions, 120-word windows, 40-word stride, up to eight windows and a 600-word packet. Full-index and bounded scoring selected identical window IDs for all 150 questions; every candidate-window score matched, and both contained the normalized full reference quotation for **127/150**. Among the 23 misses, all had the complete quote in at least one window on a retrieved candidate page. This classification does not distinguish ranking, overlap suppression or packet-budget effects. It does not establish complete evidence, qualifier retention, question answerability, factual correctness or independent performance.

On this host the paired run measured lookup p50/p95 **15.909/36.674 ms** for full scoring and **6.356/13.231 ms** for bounded scoring. Timing includes page lookup and packet construction, excludes index construction, model inference, speech and Android, and varies with host scheduling. A separate earlier paired run measured 13.248/25.778 and 5.978/10.850 ms respectively. These are not end-to-end latency receipts.

A small exploratory per-page cap comparison using the same exposed DEV and 600-word budget found cap 1: 121/150; cap 2: 127/150; caps 3 and 4: 128/150. That one-case difference is insufficient to establish generalization and the default remains unchanged. No fresh blind test was conducted.

Reproduce the paired aggregate locally with the owner-supplied private archive:

```sh
python neu205-one/tools/omega_atlas/benchmark_bounded_warp3.py \
  --private-zip /workspace/neu205-private/delivery/original-private-book-archive.zip \
  --output /workspace/neu205-private/receipts/warp3-bounded-paired-secure-20261106.json
python -m unittest discover -s neu205-one/tools/omega_atlas -p 'test_*.py'
```

The output path must not already exist; choose a new private path for every run. The benchmark writes aggregate-only output with exclusive creation and mode 0600. It reads private source questions and quotations locally and must not publish them. Existing `WARP_V02_CODE_ONLY_MANIFEST.json` and `WARP_V03_CODE_ONLY_MANIFEST.json` are historical snapshots: their original source hashes do not describe these modified research files. They have not been rewritten.
