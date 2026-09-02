import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyOpenModelLicense,
  normalizeHubModel,
  ingestOpenModelPage,
  planHuggingFaceDiscovery,
  planOpenModelUniverseSweep,
  buildFoundryAdmissionCandidate
} from '../src/open-model-universe.mjs';
import { crawlOpenModelRegistry } from '../src/open-model-registry-crawler.mjs';
import { planOpenModelRuntime, createOpenModelRuntimeExecutor } from '../src/open-model-runtime-executor.mjs';

const observedAt = '2026-09-03T00:00:00Z';

function hf(overrides = {}) {
  return {
    id: 'example/model-a',
    sha: 'abc123',
    pipeline_tag: 'text-generation',
    tags: ['transformers', 'safetensors', 'vllm', 'license:apache-2.0'],
    downloads: 100,
    likes: 5,
    gated: false,
    private: false,
    lastModified: '2026-09-02T00:00:00Z',
    ...overrides
  };
}

function pricing(overrides = {}) {
  return {
    inputUsdPerMillion: 0,
    outputUsdPerMillion: 0,
    infrastructureUsdPerRequest: 0,
    sourceRef: 'runtime-observation:test',
    verifiedAt: observedAt,
    ...overrides
  };
}

test('open-model classification never treats license text as automatic commercial authority', () => {
  const result = classifyOpenModelLicense('apache-2.0');
  assert.equal(result.class, 'PERMISSIVE');
  assert.equal(result.automaticCommercialEligibility, false);
});

test('unknown and custom licenses require review', () => {
  assert.equal(classifyOpenModelLicense('unknown').class, 'UNKNOWN_OR_CUSTOM_REVIEW');
  assert.equal(classifyOpenModelLicense('custom').class, 'UNKNOWN_OR_CUSTOM_REVIEW');
});

test('hub normalization extracts runtime hints but grants zero authority', () => {
  const result = normalizeHubModel(hf({ tags: ['gguf', 'ollama', 'vllm', 'license:apache-2.0'] }), { observedAt });
  assert.equal(result.ok, true);
  assert.ok(result.discovery.runtimeHints.includes('LLAMA_CPP'));
  assert.ok(result.discovery.runtimeHints.includes('OLLAMA'));
  assert.ok(result.discovery.runtimeHints.includes('VLLM'));
  assert.equal(result.discovery.executionAuthority, 'NONE');
  assert.equal(result.businessEffectAuthority, 'NONE');
});

test('private models are discovered as rejected candidates rather than runnable supplies', () => {
  const result = normalizeHubModel(hf({ private: true }), { observedAt });
  assert.equal(result.ok, true);
  assert.equal(result.discovery.admissionState, 'REJECT_PRIVATE_DISCOVERY');
});

test('gated model presence cannot become automatic activation', () => {
  const result = normalizeHubModel(hf({ gated: 'manual' }), { observedAt });
  assert.equal(result.discovery.admissionState, 'GATED_REVIEW_REQUIRED');
  assert.equal(result.discovery.executionAuthority, 'NONE');
});

test('registry pages dedupe exact id and revision', () => {
  const result = ingestOpenModelPage({ models: [hf({ downloads: 1 }), hf({ downloads: 10 })], observedAt });
  assert.equal(result.ok, true);
  assert.equal(result.models.length, 1);
  assert.equal(result.models[0].downloads, 10);
});

test('Hugging Face query planner is bounded and read-only', () => {
  const result = planHuggingFaceDiscovery({ pipelineTag: 'text-generation', app: 'vllm', gated: false, limit: 100 });
  assert.equal(result.ok, true);
  assert.match(result.url, /^https:\/\/huggingface\.co\/api\/models\?/);
  assert.equal(result.networkAuthority, 'NONE');
});

test('universe sweep does not claim all models were ingested', () => {
  const result = planOpenModelUniverseSweep({ pipelineTags: ['text-generation', 'image-text-to-text'], runtimeApps: ['vllm', 'llama.cpp'] });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'OPEN_MODEL_UNIVERSE_SWEEP_PLAN_ONLY');
  assert.equal(result.checkpointRequired, true);
  assert.equal(result.executionAuthority, 'NONE');
});

test('foundry admission blocks missing license, revision, runtime cost, or observed weights', () => {
  const discovery = normalizeHubModel(hf({ sha: null, tags: ['transformers'] }), { observedAt }).discovery;
  const result = buildFoundryAdmissionCandidate({ discovery, runtimeObservation: {} });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'ADMISSION_BLOCKED');
  assert.ok(result.reasonCodes.includes('license-observation-required'));
  assert.ok(result.reasonCodes.includes('revision-observation-required'));
  assert.ok(result.reasonCodes.includes('runtime-cost-observation-required'));
  assert.ok(result.reasonCodes.includes('weight-availability-observation-required'));
});

test('foundry admission creates discovered candidate but not permission eligibility', () => {
  const discovery = normalizeHubModel(hf(), { observedAt }).discovery;
  const result = buildFoundryAdmissionCandidate({
    discovery,
    runtimeObservation: {
      weightsAvailable: true,
      runtimeCostKnown: true,
      provider: 'local-vllm',
      taskClasses: ['text-generation'],
      modalities: ['TEXT'],
      contextTokens: 131072,
      minimumVramGb: 16,
      infrastructureCostPerHourUsd: 0,
      evidenceRefs: ['runtime-fit:test']
    }
  });
  assert.equal(result.ok, true);
  assert.equal(result.supply.state, 'DISCOVERED');
  assert.equal(result.supply.permissionEligible, false);
  assert.equal(result.promotionAuthority, 'NONE');
});

test('registry crawler rejects non-Hugging-Face URLs', async () => {
  const result = await crawlOpenModelRegistry({
    queries: ['https://evil.example/models'],
    fetchImpl: async () => { throw new Error('must not be called'); },
    observedAt
  });
  assert.equal(result.ok, true);
  assert.equal(result.receipts[0].status, 'QUERY_REJECTED');
  assert.equal(result.counts.queriesSucceeded, 0);
});

test('registry crawler ingests bounded public pages with zero promotion authority', async () => {
  const payload = JSON.stringify([hf(), hf({ id: 'example/model-b', sha: 'def456' })]);
  const result = await crawlOpenModelRegistry({
    queries: ['https://huggingface.co/api/models?pipeline_tag=text-generation&limit=2'],
    fetchImpl: async () => ({ ok: true, status: 200, text: async () => payload }),
    observedAt
  });
  assert.equal(result.ok, true);
  assert.equal(result.models.length, 2);
  assert.equal(result.promotionAuthority, 'NONE');
  assert.equal(result.executionAuthority, 'NONE');
});

test('runtime planner rejects arbitrary insecure remote endpoints', () => {
  const result = planOpenModelRuntime({ runtime: 'VLLM', model: 'example/model-a', endpoint: 'http://example.com:8000', apiStyle: 'CHAT_COMPLETIONS', pricing: pricing(), enabled: true });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('safe-runtime-endpoint-required'));
});

test('runtime planner allows loopback HTTP and remote HTTPS without granting business authority', () => {
  const local = planOpenModelRuntime({ runtime: 'LLAMA_CPP', model: 'example/model-a', endpoint: 'http://127.0.0.1:8080', apiStyle: 'CHAT_COMPLETIONS', pricing: pricing(), enabled: true });
  const remote = planOpenModelRuntime({ runtime: 'VLLM', model: 'example/model-a', endpoint: 'https://models.example.com', apiStyle: 'CHAT_COMPLETIONS', pricing: pricing(), enabled: true });
  assert.equal(local.ok, true);
  assert.equal(local.endpointClass, 'LOOPBACK');
  assert.equal(remote.ok, true);
  assert.equal(remote.endpointClass, 'HTTPS_REMOTE');
  assert.equal(remote.businessEffectAuthority, 'NONE');
});

test('open-model executor enforces local-preparation consequence class', async () => {
  const executor = createOpenModelRuntimeExecutor({
    runtime: 'VLLM', model: 'example/model-a', endpoint: 'http://127.0.0.1:8000', pricing: pricing(), enabled: true,
    fetchImpl: async () => { throw new Error('must not call runtime'); }
  });
  const result = await executor({ task: { taskId: 't1', objective: 'x', consequenceClass: 'MESSAGE' }, maxTokens: 10, costCeilingCents: 1 });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('open-model-worker-only-accepts-local-preparation'));
});

test('open-model executor returns structured result and observes model identity', async () => {
  const payload = {
    id: 'req-1', model: 'example/model-a',
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    choices: [{ message: { content: JSON.stringify({ answer: 42 }) } }]
  };
  const executor = createOpenModelRuntimeExecutor({
    runtime: 'VLLM', model: 'example/model-a', endpoint: 'http://127.0.0.1:8000', pricing: pricing(), enabled: true,
    fetchImpl: async () => ({ ok: true, status: 200, text: async () => JSON.stringify(payload) })
  });
  const result = await executor({ task: { taskId: 't1', objective: 'return json', consequenceClass: 'LOCAL_PREPARATION' }, maxTokens: 100, costCeilingCents: 1 });
  assert.equal(result.ok, true);
  assert.equal(result.identityVerification, 'MATCHED');
  assert.deepEqual(result.result, { answer: 42 });
  assert.equal(result.businessEffectAuthority, 'NONE');
});
