# NEU205 Evidence API v1 (`neu205.evidence.v1`) — frozen interface, 2026-11-03

Owner: Claude (intelligence track). Consumer: Codex (Android). Contract source: `00_SHARED_CONTRACT.md`.
The API returns **immutable verbatim book passages**, never generated answers. Qwen (the only
answering brain) receives these passages; the API itself never decides an answer.

## Transport
In-process Java library (preferred): `ai.neu205.one.evidence.EvidenceIndex` in `neu205-one/core`
(pure Java 11, no Android imports, no network). No sockets, no ports. A loopback HTTP shim is
NOT provided and NOT needed.

## Request
```json
{"schema":"neu205.evidence.v1","request_id":"r-0001","utterance_text":"what does it contain",
 "conversation_topics":["carotid sheath"],"max_passages":5,"latency_budget_ms":150,
 "corpus_sha256":"<64 hex>"}
```
Rules: `schema` must equal `neu205.evidence.v1`; `request_id` 1–64 chars `[A-Za-z0-9._-]`;
`utterance_text` 1–1000 chars; `max_passages` 1–20; `latency_budget_ms` 1–10000;
`conversation_topics` ≤ 8 strings ≤ 200 chars (used only to expand the query for pronoun
follow-ups — never to add answer text); `corpus_sha256` must equal the loaded corpus digest.

## Response
```json
{"schema":"neu205.evidence.v1","request_id":"r-0001","corpus_sha256":"<64 hex>",
 "strategy":"bm25+bge-small-q8-rrf-v1","elapsed_ms":2.4,"evidence_status":"OK",
 "passages":[{"chunk_id":"c00412","book_pdf_start_page":82,"book_pdf_end_page":83,
   "section_path":"PART I - ANATOMY > Neck Chapter 1: Cervical Fascia > ...",
   "verbatim_text":"...","source_hash":"<sha256 of verbatim_text>",
   "retrieval_scores":{"fused_rank":1,"coverage":0.92}}]}
```
`evidence_status`:
| value | meaning | consumer behaviour |
|---|---|---|
| `OK` | ≥1 passage with adequate query coverage | give passages to Qwen |
| `WEAK` | passages returned but low coverage | Qwen must say the book may not cover it / ask to clarify |
| `NONE` | nothing relevant | say "not in your book"; do not call Qwen for facts |
| `CORPUS_MISMATCH` | request digest ≠ loaded corpus | fail closed, visible error, no passages |
| `INDEX_CORRUPT` | manifest/chunk hash verification failed at load | fail closed, visible error |
| `INVALID_REQUEST` | schema violation (message in `error`) | programmer error |
| `CANCELLED` | caller cancelled | discard |
| `BUDGET_EXCEEDED` | search exceeded `latency_budget_ms` | passages so far may be empty; caller decides |

## Integrity (fail closed)
At load the index verifies: `corpus.manifest.json.corpus_sha256 == sha256(corpus.jsonl bytes)`,
every chunk's `source_hash == sha256(verbatim_text)`, ids unique, pages within 1–299. Any failure
→ every call returns `INDEX_CORRUPT` with an explanation. No stale/partial fallback.
Passage text is data: instructions inside book text are never executed; ids/pages/hashes come
from the verified index, not from any model output.

## Cancellation
`search(request, CancellationToken)`; the index checks the token between scoring stages. After
`cancel()` the call returns `CANCELLED` (never late passages). Map the token to the app's
conversation generation so Stop cancels evidence work.

## Prompt-assembly guidance for Qwen (consumer side)
Pass passages as quoted, numbered blocks with `[p.<start>-<end>]` labels; instruct: answer only
from the passages, say when they do not contain the answer, keep spoken answers ≤ 2 sentences
unless asked for more, cite pages on screen. Context budget: ≤ 5 passages ≈ 900 tokens.

## Files and digests (owner-private bundle, never in the public repo)
- `corpus.jsonl`, `corpus.manifest.json` — produced by `retrieval/corpus.py`.
- Optional dense vectors/models only if the tournament admits them (see tournament report).
Fixtures in `core/src/test/resources/evidence/` are **synthetic** (no book text).

## Integration steps (Codex)
1. Add `neu205-one/core` sources (package `ai.neu205.one.evidence`) to the app build.
2. Ship `corpus.jsonl` + `corpus.manifest.json` as private assets; load once at startup with
   `EvidenceIndex.load(InputStream corpus, InputStream manifest)`; surface `INDEX_CORRUPT`.
3. Per utterance: `EvidenceIndex.search(EvidenceRequest, token)` → passages → Qwen prompt.
4. Run `EvidenceApiTests` (host) and the golden fixtures before integrating.
