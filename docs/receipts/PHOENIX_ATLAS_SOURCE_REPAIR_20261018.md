# PHOENIX Atlas-to-Graph source repair, October 18, 2026

Truth class: LOCAL EXECUTED SOURCE VERIFICATION; not a deployment or supplier promotion.

## Reproduced source defects

- At pre-repair Deep Atlas scale, canonical hashing exceeded the JavaScript maximum string length. The pre-existing streaming SHA-256 fix on PR #1469 addressed that stage.
- With that fix, the exact local pipeline next failed at `scripts/uberbond-repository-deep-atlas.mjs:29`, `JSON.stringify(result, null, 2)`, with `RangeError: Invalid string length`.
- A bounded-memory atomic JSON writer resolved that persistence failure. Before adjusting structural expansion, the Deep Atlas contained 1,640,597 details and produced a 557,940,058-byte JSON artifact; the next Ultimate Graph `readFile(..., 'utf8')` failed with the same RangeError.
- Reducing structural-key expansion alone to 2,048 details per file retained all supported source text chunks, but 521,021 details still exceeded the Ultimate Graph canonical digest string limit.

## Implemented repair and scope

- Canonical SHA-256 digests are streamed for both Deep Atlas and Ultimate Graph; test fixtures pin their stable-byte compatibility.
- Deep Atlas and Ultimate Graph persistence use bounded, atomic, per-leaf secret-redacted JSON streaming. JSON syntax is retained and no custom `toJSON` hooks execute.
- Per-file detail expansion is capped at 512, with text chunks indexed before optional structural declarations. Capped files remain explicit in `structuralDetailCappedFiles`; their full-file digests and chunk pointers are retained. This is bounded structural indexing, **not** complete extraction of every JSON key.
- Per-file content-chunk accounting no longer rescans all prior detail rows.
- No third-party donor code, provider calls, spending, messages, deployment, credential changes or payment effects were used.

## Local independent acceptance

On the 4,694-artifact local source snapshot, Deep Atlas returned `ok=true`, 4,548 parsed text files, 267,097 indexed deep details, 10,988 content chunks, 188 explicitly structural-capped files, zero reported truncated files. Ultimate Graph returned `ok=true`, 278,860 nodes, 1,146,007 edges, zero orphan nodes, zero missing artifacts, zero missing feature atoms and zero missing deep features. Both completed without JavaScript string-length errors. The graph is a structural index, not proof of live capability.

The complete 1,560 recovered research designs comprise the original 1,304 plus 256 verified Wave 4 records. The 243 public GitHub URL strings normalize to 240 untrusted repository identities. Research acquisition is not operational supplier approval or autonomous capability deployment.

## Remaining gates

Re-run tests and canonical readiness against the committed source head; require exact-head GitHub CI and independently inspect hosted Vercel status. If a hosted provider quota prevents preview, label it as provider infrastructure, not source success. No merge of a genuinely failing source check.
