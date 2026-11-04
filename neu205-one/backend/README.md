# NEU205 local companion

This interim companion supplies authenticated local Qwen streaming and a shim around Claude's frozen Evidence API. It never downloads models or contacts external inference. Android may run Whisper ONNX locally and submit `/v1/turn`, or use `/v1/voice` with an explicitly configured local whisper.cpp executable/model. The phone must already have a legitimately paired, explicitly started companion: the APK cannot silently access Termux private files.

## Start (owner-private asset paths)

Use Python 3.10+. No Python runtime dependencies. Keep the original PDF, corpus, model and pairing token outside the source tree. Generate an owner-only random pairing token file locally; import the same token into app Settings. Never commit it. Do not replace existing token files without deliberate rotation.

```
python backend/bridge.py --corpus /private/corpus.jsonl \
  --manifest /private/corpus.manifest.json \
  --pdf /private/NEU205_Neuroscience_Text_Only.pdf \
  --token-file /private/companion.token \
  --model-identity /private/qwen-identity.json
```

For companion ASR add `--whisper-cli /private/bin/whisper-cli --whisper-model /private/ggml-small.en.bin`. This is whisper.cpp GGML format, not ONNX. Native Android Whisper ONNX needs no server ASR configuration.

The fixed Qwen endpoint defaults to numeric loopback `http://127.0.0.1:8080`. Start the existing verified Qwen llama-server with an explicit Qwen alias and loopback-only host before starting a turn. Inspect the existing listener first; never kill or bind over it. The companion binds `127.0.0.1:8768` and exits if occupied. It does not overwrite Termux or model assets. Optional explicitly approved fixed Qwen startup is described below. Before startup, run `python backend/prepare_model_identity.py /private/qwen.gguf --out /private/qwen-identity.json`. This hashes and inspects the actual GGUF without changing it; it refuses non-Qwen architecture, missing chat template, and absent tensors. It never overwrites a receipt. Configure the controlled Qwen deployment alias to `qwen-<first 12 SHA256 hex>` from this receipt. The service re-verifies full SHA at startup and refuses inference without it. Health distinguishes `qwen_weights_verified` (local file) and `server_weight_binding_proven:false` (the server's alias alone cannot independently prove which file it loaded). Record the exact llama-server launch command and actual model path in owner-private device acceptance.

`GET /v1/health` returns HTTP503 until corpus, local Qwen and server ASR are available. A client that has itself verified native ASR assets sends `X-NEU205-Native-ASR: true`; this bypasses only the server-ASR requirement and returns `native_asr_asserted:true` separately. It is not proof that native inference succeeded.

## Wire contract

All requests require `Host: 127.0.0.1:8768` and `Authorization: Bearer <token>`. Browser Origin requests are refused. No CORS. No redirects, environment proxy handling, arbitrary endpoint paths, off-device hosts, or remote DNS. No audio, question, book or bearer logging.

* `POST /v1/evidence`: exact frozen request in `docs/NEU205_EVIDENCE_API_V1.md`; exact immutable evidence response/status. Corpus digest is SHA256 of `corpus.jsonl`, **not** PDF SHA256.
* `POST /v1/turn`: JSON `{request_id,utterance_text,corpus_sha256,conversation_topics:[],history:[]}`. Bounded history roles user/assistant only. New turns cancel previous active inference. NDJSON `evidence`, `token`, `done`, `error`. Evidence event has `pages` and `source_pages`; error includes `code,message`. Thinking/reasoning fields and thinking tags are withheld.
* `POST /v1/voice`: PCM16 mono 16kHz WAV (45s maximum), `Content-Type: audio/wav`, `X-Request-Id`. Optional `X-Conversation-Topics` JSON array. Returns initial `transcript` event then same pipeline. Input files and transcript temp files deleted after decode.
* `POST /v1/cancel`: JSON `{request_id}`. Sets cancellation, shuts local Qwen socket, terminates local ASR process. Client must invalidate generation, stop microphone/TTS, close stream and send cancellation. Disconnect alone is observed on the next stream write; explicit cancellation is required for prompt termination during stalled inference.

## Validation and limitations

```
python -m unittest discover -s backend/tests -v
```

Synthetic fixtures test protocol, cancellation, checksum refusal, full-page coverage, request validation, wrong hosts, browser origins, malformed model markup, thinking redaction and missing assets. These do not validate medical answers, real Qwen generation, physical audio or phone latency. The BM25 source is copied unchanged from Claude commit `448d55f0497f7f41932869edf30084419574752a` (`neu205-one/retrieval/bm25.py`). Corpus adapter enforces additional complete 299-page coverage. Corrupt/mutated assets fail closed. Original PDF is verified separately against `c3298e8c5f7f807604be10f7376d67f05eb315dd982276263e8f6ad2e8e70940`.

No standalone loopback server can supply one-tap companion lifecycle permission across Android app sandboxes. Current service startup remains a deployment dependency pending explicit owner-authorized Termux pairing/start configuration or same-process native Qwen integration. No physical-phone result or release qualification is implied.

## One-tap Android/Termux lifecycle boundary

The supported Termux RUN_COMMAND integration requires Termux's `com.termux.permission.RUN_COMMAND` runtime permission and owner-enabled `allow-external-apps=true` in Termux properties. This mission does **not** grant either, edit properties, invoke a phone command, or install Termux packages. A future user-approved pairing may use an explicit `com.termux.app.RunCommandService` Intent, a fixed isolated script path, and fixed arguments; Android must never accept arbitrary external shell command text. Package-presence checks and permission explanation precede requesting any grant. Do not use Accessibility, Shizuku or root. Until that permission/lifecycle integration is physically verified, companion startup remains an unverified deployment gate and the APK must show Setup when readiness fails. The same-process native Qwen alternative eliminates this dependency but has not been implemented or validated in this candidate.

## Optional explicit owner-approved cold Qwen startup

The default launcher requires an existing Qwen service. To authorize startup of a separately verified binary/model only when port 8080 is unused, the owner may explicitly approve a private `.private/runtime-config.json`:

```json
{"allow_start_qwen":true,"llama_server_path":"/absolute/owner-approved/llama-server","binary_sha256":"<authoritative 64 lowercase hex SHA256>"}
```

This flag is absent/false by default; setting it is an **initial owner authorization**, not something the app silently changes. Before any process starts the launcher checks the actual GGUF identity receipt, executable checksum and ABI (`--help` succeeds), and confirms the binary advertises every required fixed flag. It uses CPU/default backend only: `--host 127.0.0.1 --port 8080 --model <verified path> --alias qwen-<SHA12> --ctx-size 2048 --parallel 1 --threads 4 --n-gpu-layers 0`. There are no arbitrary extra flags, shell interpolation, downloads, credentials created, or paid calls. GPU/NPU qualification is a separate measured device task.

An existing port 8080 is never replaced. A previous owned PID still present without a listener blocks duplicate startup for manual receipt inspection. A newly owned process is recorded in `.private/owned-qwen.json`; logs are discarded to avoid payload disclosure. Readiness retries for up to 120 seconds. The launcher does not kill a model on timeout or on Stop; Android Stop cancels mic, the current inference request, and TTS while leaving the warmed model available. Rollback requires the owner to inspect that exact private PID receipt and process identity before stopping only this candidate's owned process. Historic Qwen/Termux processes remain untouched.

Host tests verify default-disabled startup, missing assets, unsafe pairing file, wrong binary hash and unsupported flags. Actual ARM64 binary ABI, GGUF load, phone service lifetime and cold-start readiness are **not tested on a phone**.

Owned startup filters inherited `LLAMA*` and `GGML_RPC*` option variables before both the help probe and server launch. Other inherited authentication, proxy and CA settings are preserved. The fixed startup chooses CPU (`--n-gpu-layers 0`); alternate GPU/NPU/RPC backends are forbidden in this launcher until a separate measured, explicitly approved configuration is reviewed. A successful `/v1/models` request through 127.0.0.1 proves only local endpoint reachability and advertised alias. It does **not** prove an already-running server's PID, exact loaded weights, or that it is bound exclusively to loopback. The owner must verify those facts for any existing server before device acceptance. Controlled owned startup records its PID and fixed loopback argv; the receipt itself is not a physical-device verification.

## Strict 2048-token prompt budget

The companion reserves 180 generated tokens plus a 32-token guard. It first asks the local server's `/apply-template` and `/tokenize` endpoints to count the rendered prompt with the same thinking-disabled chat setting. If these endpoints are unavailable, it uses a conservative UTF-8 byte upper bound for content, plus 256 template tokens and 32 tokens per message boundary. The fallback allowance is conservative engineering, not an independently measured guarantee for every future custom chat template. Actual model/template compatibility remains a device gate.

To fit, it removes oldest whole history pairs first, then lowest-ranked whole evidence passages. It never truncates the current medical question, the top passage, a retained passage, or its qualifiers. If the current question plus top passage cannot fit, it fails visibly with `CONTEXT_BUDGET` rather than exceed context or manufacture an answer. Final evidence metadata reports the actual selected source pages and budget method before tokens stream. Prompt-budget tests use synthetic model-server fixtures; real Qwen tokenizer/generation performance is not claimed.
