# UberBond Open Model Universe

Status: Frontier expansion branch, not canonical until verified and merged.

## Purpose

UberBond must not depend on a finite hand-maintained list of open models. The open-model ecosystem changes continuously and already contains millions of public model repositories. The durable capability is therefore a living discovery, screening, benchmarking, runtime, and routing system.

The target flow is:

```text
public model registries
  -> bounded read-only discovery
  -> revision + license + provenance normalization
  -> runtime/format detection
  -> hardware + cost fit
  -> Capability Genome / Open Model Foundry admission candidate
  -> security/license screening
  -> UberBond task-specific benchmark tournament
  -> APPROVED / ACTIVE only after evidence
  -> provider-neutral runtime executor
  -> reliability and economic feedback
  -> degrade / replace / revoke on drift
```

Discovery never creates activation or business-effect authority.

## Current broad discovery source

Hugging Face Hub is the primary broad source because it exposes a public model API and supports filtering/search by task, author, application/runtime, gated state, parameter range, downloads and other metadata. UberBond can continuously sweep it rather than hard-code model names.

ModelScope and the Ollama model library are preserved as supplemental discovery/packaging ecosystems. Their adapter semantics must be validated before they are treated as equivalent registry evidence.

## Current frontier families worth tracking

These are examples of current families observed around 2026-09-03, not a permanent allowlist and not automatic approval:

- Qwen 3.8 family, including Qwen3.8-27B and Qwen3.8-Flash-Next variants.
- GLM 5.3 / GLM 5.3 Flash.
- DeepSeek V4 family / experimental V4 vision variants.
- Kimi K3.
- OpenAI gpt-oss 20B / 120B and related safeguard variants.
- MiniMax, Mistral, Gemma, Llama-family, Yi, Falcon, DBRX, Jamba and future compatible families.
- Specialist open models for coding, embeddings, reranking, vision-language, speech, TTS, image/video generation, time-series and other task classes.

Model-family presence is not a license, reliability, security or quality claim. Each exact revision is screened independently.

## Open source vs open weight

UberBond must preserve these distinctions:

- **Open-source software runtime**: the serving code may be under an open-source license.
- **Open-weight model**: model weights are downloadable, but the model may use a custom or restricted license.
- **Permissively licensed model**: license evidence may allow broad reuse, but UberBond still performs rights/policy review before commercial activation.
- **Gated model**: access itself requires provider conditions and cannot be treated as freely available.
- **Unknown/custom license**: cannot auto-promote.

For example, OpenAI publishes gpt-oss under Apache 2.0 plus its usage policy. UberBond records both the license observation and any applicable policy rather than collapsing that into the word "free".

## Runtime market

UberBond treats model identity and runtime supplier as separate objects. Candidate runtimes include:

- vLLM
- SGLang
- llama.cpp / GGUF
- Ollama
- MLX-LM
- Hugging Face Text Generation Inference
- Transformers-based servers
- Diffusers-based servers
- sentence-transformers / embedding services
- future OpenAI-compatible local or hosted runtimes

A model can therefore move between local hardware, a hosted open-weight endpoint, or a future provider without changing its task identity.

## Runtime socket

`src/open-model-runtime-executor.mjs` supplies a bounded OpenAI-compatible inference socket for eligible text/agentic workers.

Properties:

- disabled unless explicitly enabled;
- local HTTP is allowed only on loopback;
- remote endpoints require HTTPS;
- no endpoint credentials may be embedded in URLs;
- explicit model identity;
- explicit runtime identity;
- bounded request and response sizes;
- timeout classification;
- no hidden retries;
- explicit cost ceiling;
- structured JSON output;
- model identity observation where the runtime reports it;
- no business-effect authority.

Task-specific non-text runtimes can be added behind the same Foundry admission and authority model rather than forcing image/audio/video models through a chat-completion protocol.

## Continuous universe sweep

The system does not claim to ingest "all models" in one giant request. Instead it continuously covers the universe through checkpointed bounded sweeps:

- high-download and high-activity broad sweeps;
- task-class sweeps;
- runtime/application sweeps;
- newly changed revisions;
- explicit frontier-family searches;
- later supplemental registries.

This is deliberately stronger than a static catalog because new models enter automatically.

## Cost law

Open weights are not free inference.

Every candidate must record or estimate:

- input/output inference cost where hosted;
- infrastructure cost where self-hosted;
- VRAM/RAM requirements;
- quantization/runtime format;
- latency and throughput;
- reliability;
- operational maintenance;
- task success.

The Open Model Foundry then compares the full cost of intelligence rather than API sticker price alone.

## Promotion law

A model may move toward ACTIVE only after:

1. exact revision observed;
2. weight/runtime availability observed;
3. license and usage policy screened;
4. security/provenance screening;
5. hardware/runtime fit established;
6. runtime cost known;
7. task-specific UberBond benchmark evidence;
8. reliability evidence;
9. permission eligibility;
10. no regression against existing suppliers.

Popularity, public leaderboard position, model-card claims, or a social-media announcement are discovery evidence only.

## Future law

UberBond is not a Qwen, DeepSeek, OpenAI, Anthropic, Meta, Mistral, Google, Z.ai, Moonshot, or Hugging Face product.

Models are suppliers.

When a future model family appears, UberBond should discover it, extract any new operating mechanisms, benchmark it against current suppliers, and route work to it only when evidence says it expands capability or improves economics.
