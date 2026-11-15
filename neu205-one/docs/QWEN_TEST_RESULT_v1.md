# Qwen answer layer — held-out TEST result (run once, frozen f89d3e2)

Configuration: Qwen3.5-4B Q4_K_M (sha256 00fe7986…11a4) · BM25 + bge-small int8 RRF evidence ·
110-word verbatim sentence budget · greedy, max 96 tokens · host x86 4 vCPU (not phone).
Items: 443 supported + 107 unsupported probes from three independent authors (pages 1–299).
Grading: independent agent, rubric fixed in advance, book text available; outputs frozen and hashed
before grading (`07e69a06…0481`).

| measure | result | pre-registered bar | verdict |
|---|---|---|---|
| supported correct | **268/443 = 60.5 %** (95 % CI 55.9–64.9) | ≥ 80 % | **FAIL** |
| supported wrong (confident) | **48/443 = 10.8 %** (CI 8.3–14.1) | ≤ 5 % | **FAIL** |
| supported partial / refused | 43 / 84 | — | — |
| unsupported correctly refused | **105/107 = 98.1 %** | ≥ 95 % | PASS |
| host TTFT p50 / p95 | 11.3 s / 14.2 s | — | not a phone figure |

By book third (correct/partial/wrong/refused): p1–100 82/19/16/26 · p101–200 93/12/21/27 ·
p201–299 93/12/11/31.

Context: the original deterministic engine on the same 443 TEST items scored 75 correct / 71 wrong
under the stricter automatic scorer (not independently re-graded; not directly comparable).

## Serious errors found by the grader (examples)
- Parkinson's drug treatment answered with dopamine blockers (phenothiazines) — dangerous inversion.
- Nerve at risk with the inferior thyroid artery: external laryngeal (correct: recurrent laryngeal).
- Larger terminal branch of the ICA: "middle meningeal" (correct: middle cerebral).
- First-order neuron for facial proprioception: spinal ganglion (book: mesencephalic nucleus).
- Hyporeflexia attributed to UMN lesions (UMN lesions cause hyperreflexia).
- Unsupported false answers: platysma blood supply answered with a nerve; tracheostomy rings asserted.

## Interpretation
The answer layer is far better than the previous engine and refuses out-of-book questions
reliably, but at 10.8 % confidently wrong it is **not safe as a medical study source** under the
owner's own bar. DEV evidence (oracle control) says the dominant remaining cause is model
reasoning, not retrieval. Not release-qualified.
