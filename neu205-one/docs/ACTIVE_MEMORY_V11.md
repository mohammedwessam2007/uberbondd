# Optional v11 source memory

This adds source retrieval and bounded typed tools. Qwen remains the only answer generator. The baseline Evidence API and baseline default remain available. This is deterministic layout grouping, not a verified medical graph: adjacency and shared words do not establish supply, containment, causation, or clinical entailment.

## Private compilation and deployment

`tools/compile_memory_v11.py --help` documents the verified original PDF, page text, baseline corpus and manifest inputs. The compiler requires all 299 pages, preserves exact source spans and hashes, and refuses replacement of an existing version. Do not commit source assets or private outputs. The actual compiled index has 1,711 capsules, 84,298 source words, and zero omitted non-whitespace source characters. The original PDF and baseline corpus digests remain unchanged.

For the owner-approved Termux deployment, copy the verified index and its manifest into the isolated companion directory as `.private/active-memory-v11.sqlite` and `.private/active-memory-v11.sqlite.manifest.json`. The existing fixed launcher detects these two fixed local paths; it accepts no arbitrary app arguments or network destinations. Importing into Android private storage alone does not make a file available to Termux. Owner transfer/setup is required. Existing source assets and services are preserved.

Actual compiled SQLite: 10,821,632 bytes, SHA256 `9bbdad7f7eeadcaf23518319d7e9eb2ee7704bdd43c5be89f0005ac98ed0a310`. Its manifest SHA256 is `8505360f55d5c5fb8948b41bd301a64c0c1cd50ff5ab204ef6e79502e04cb323`. The manifest binds the original PDF SHA256 `c3298e8c5f7f807604be10f7376d67f05eb315dd982276263e8f6ad2e8e70940` and baseline corpus SHA256 `2f7874d9aec84e85567c21bb6b2bd291a3a1ea6237d8bdabfa216628a166f5be`.

CLI deployments may pass `--active-memory PATH --active-memory-manifest PATH`. `--memory-mode v11` explicitly changes the default; it fails readiness if the index is unavailable. Default is baseline. `--memory-words` accepts 110, 160 or 220 (160 default). `--memory-tools` explicitly enables experimental Qwen tool planning; default is off because real-model latency and accuracy are unmeasured.

## API compatibility

Authentication, corpus pinning and loopback restrictions are unchanged. `GET /v1/health` contains `active_memory.ready`, `active_memory.schema`, `active_memory.enabled_by_default`, `active_memory.baseline_corpus_sha256`, `active_memory.index_sha256`, and `active_memory.medical_graph_verified:false`. Android must require `active_memory.ready == true` when its v11 switch is enabled. Base health can remain ready with v11 absent because baseline is the default.

`POST /v1/turn` retains the baseline fields and accepts `memory_mode:"v11"`, `mode:"study"` or `"exam_mcq"`, and a bounded opaque `generation_id` such as `android-5`. Missing v11 assets return `ACTIVE_MEMORY_REQUIRED`; corrupt assets fail visibly; there is no silent fallback. Invalid question, topic, corpus, history and generation fields are refused. MCQ option blocks are excluded from initial search. Source-based response-format instructions are generic routing, not prewritten answers.

All streamed events carry `request_id`. Evidence metadata reports index binding, retained primary source, dropped capsule IDs and budget. Whole source units are never cropped to fit a word limit. If the highest-ranked mandatory unit cannot fit, `EVIDENCE_UNIT_EXCEEDS_BUDGET` is returned. The final model prompt still has its independent context budget: oldest whole history pairs and lower-ranked whole passages are dropped; if the question and primary source cannot fit, `CONTEXT_BUDGET` is returned. This may visibly refuse a query rather than remove a medical qualifier.

`POST /v1/cancel` accepts the existing `request_id`, optionally `generation_id`. It cancels model transport, active tools and provisional retrieval. No tool or result from an older generation should be applied by the client. The experimental `/v1/prefetch` accepts corpus digest, generation ID, `stable_prefix`, increasing integer `sequence`, and boolean `stable`. Two stable observations and a 150ms interval are required; prefix revisions invalidate old results. This endpoint only retrieves source. Current Android whole-utterance Whisper does not emit partials, so it does not enable this endpoint or claim partial-ASR speedups.

## Typed tools and cache scope

With explicit `--memory-tools`, Qwen may request `topic.search`, `memory.lookup`, `memory.expand`, `memory.prove`, or `source.page_in`. Planning is capped at two Qwen calls, four tool executions, source-neighbor depth two, and bounded tool output. Only approved returned IDs/pages can be read; no shell, arbitrary path, URL or other model is available. Every planning and final call is context-budget checked, with a shared 90-second turn deadline. `memory.prove` reports exact quote presence and lexical diagnostics; semantic clinical entailment remains `NOT_VERIFIED`. These checks are not a medical claim verifier.

Qwen requests explicitly include `cache_prompt:true` by default. The completion metadata contains `cache_requested`, `cache_hits_verified:false`, and the SHA256 of the actual stable system-prefix bytes. No answer cache, measured KV cache hit, cross-question restored state, speedup, or native acceleration is claimed.

## Measured scope

The private deterministic DEV experiment used only digital pages 1–60 and 120 source-derived location/quote probes. Queries intentionally include source terms. The comparator is Claude's unchanged old sentence-compression algorithm applied to the recovered 1,329-chunk corpus, not the unrecovered original v05 private 1,695-chunk corpus. No v07–v10 donor archives were recovered.

| Word budget | Old sentence quote retained | v11 quote retained | Paired wins / losses | Conservative final-prompt quote retained |
| --- | ---: | ---: | ---: | ---: |
| 110 | 70/120 | 105/120 | 42 / 7 | 97/120 |
| 160 | 70/120 | 111/120 | 44 / 3 | 97/120 |
| 220 | 70/120 | 114/120 | 46 / 2 | 97/120 |

The final-prompt test used the conservative UTF8-byte fallback, not an actual Qwen tokenizer. Its explicit prompt refusals were 5, 8 and 8 respectively; refusals remain in the denominator. Oracle packing is a source-availability diagnostic only. A separate 1,000-query DEV source stress run completed all reads: p50 3.77ms, p95 5.96ms, maximum 15.80ms, process peak RSS 42,356KB on this host. These are host retrieval timings, not model, audio, Android or phone latency.

These results justify an owner-selectable source-retention experiment, not a clinical accuracy gate or automatic default promotion. No sealed evaluation questions or key were read. Qwen model runs, actual tokenization, clinical claim validation, cache hits, device acceleration, phone audio and physical-phone acceptance remain separate unverified gates.
