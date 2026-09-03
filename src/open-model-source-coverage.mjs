import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const OPEN_MODEL_SOURCE_COVERAGE_VERSION = 'uberbond.open-model-source-coverage-1.0.0';

export const OPEN_MODEL_CAPABILITY_COVERAGE = Object.freeze([
  ['model.universe-discovery', 'Continuously discover public model candidates instead of maintaining a finite hand-written list.'],
  ['model.huggingface-ingestion', 'Normalize Hugging Face Hub model metadata, revisions, task tags, runtime hints, gated/private state and license evidence.'],
  ['model.registry-crawler', 'Execute bounded read-only registry crawls with timeouts, byte limits, receipts and checkpoints.'],
  ['model.license-classification', 'Separate permissive, conditional/copyleft, custom and unknown licenses; never infer commercial eligibility from weight availability alone.'],
  ['model.revision-pinning', 'Bind model admission and benchmark evidence to an observed model revision or digest.'],
  ['model.weight-observation', 'Require observed weight/runtime availability before an open-weight candidate enters Foundry admission.'],
  ['model.runtime-cost-observation', 'Treat GPU/CPU/hosted inference cost as real model cost rather than assuming open weights are free.'],
  ['model.runtime-selection', 'Route models across vLLM, SGLang, llama.cpp, Ollama, MLX-LM, TGI, Transformers and other compatible runtimes.'],
  ['model.openai-compatible-socket', 'Expose eligible local/hosted open models through one bounded UberBond executor contract.'],
  ['model.multimodal-universe', 'Preserve text, vision, image, audio, embedding, reranking, video and future task classes rather than narrowing the Foundry to chat LLMs.'],
  ['model.hardware-fit', 'Measure runtime fit against VRAM/RAM/device/backend constraints before activation.'],
  ['model.quantization-market', 'Treat quantizations and runtime formats as implementations of a model capability, not unrelated models.'],
  ['model.task-tournament', 'Benchmark model candidates on UberBond task classes and private/rotating holdouts.'],
  ['model.runtime-reliability', 'Track timeout, malformed output, tool-call, recovery and sustained-runtime evidence by model/runtime pair.'],
  ['model.provider-neutrality', 'Keep model identity separate from hosting provider so local, hosted-open and future suppliers remain replaceable.'],
  ['model.specialization', 'Support retrieval, adapters, LoRA, distillation and lawful task-specific tuning after rights and evidence checks.'],
  ['model.frontier-refresh', 'Continuously detect new model families and revisions and retest only where changed evidence can alter routing.'],
  ['model.no-auto-promotion', 'Discovery, popularity and public benchmark prestige never create APPROVED/ACTIVE state or business authority.']
].map(([id, description]) => Object.freeze({ id, description })));

export function buildOpenModelSourceCoverageReceipt() {
  const ids = OPEN_MODEL_CAPABILITY_COVERAGE.map(item => item.id);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  return {
    ok: duplicateIds.length === 0,
    status: duplicateIds.length === 0 ? 'OPEN_MODEL_SOURCE_COVERAGE_COMPLETE' : 'OPEN_MODEL_SOURCE_COVERAGE_INVALID',
    version: OPEN_MODEL_SOURCE_COVERAGE_VERSION,
    capabilities: OPEN_MODEL_CAPABILITY_COVERAGE.map(item => ({
      ...item,
      implementationState: 'IMPLEMENTED_OR_CONTRACTED_ON_FRONTIER_BRANCH',
      promotionState: 'NOT_CANONICAL_UNTIL_VERIFIED_AND_MERGED',
      executionAuthority: 'NONE',
      commercialTruthAuthority: 'NONE'
    })),
    duplicateIds,
    invariants: [
      'open-weight-does-not-mean-free-runtime',
      'weights-present-does-not-mean-license-cleared',
      'registry-popularity-does-not-mean-quality',
      'model-card-claim-does-not-mean-uberbond-benchmark-proof',
      'model-discovery-does-not-create-runtime-permission',
      'runtime-availability-does-not-create-business-effect-authority',
      'model-revision-drift-invalidates-stale-benchmark-evidence',
      'future-model-families-must-enter-through-the-same-foundry-admission-process'
    ],
    businessEffectAuthority: 'NONE',
    externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS)
  };
}
