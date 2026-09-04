import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverLocalRuntimeModels } from '../src/avengers-local-discovery.mjs';
import { buildDefaultLocalDiscoveryCandidates } from '../src/avengers-arsenal.mjs';

function response(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() { return typeof payload === 'string' ? payload : JSON.stringify(payload); }
  };
}

test('default local discovery covers the major provider-neutral runtime families without activation', () => {
  const plan = buildDefaultLocalDiscoveryCandidates();
  assert.equal(plan.ok, true);
  assert.deepEqual(new Set(plan.candidates.map(item => item.runtime)), new Set(['OLLAMA', 'VLLM', 'LLAMA_CPP', 'SGLANG', 'MLX_LM', 'TGI']));
  assert.equal(plan.automaticActivation, false);
  assert.equal(plan.automaticDownload, false);
  assert.equal(plan.arbitraryModelCodeExecution, false);
});

test('loopback Ollama and OpenAI-compatible runtimes are discovered as visible, never inference-proven', async () => {
  const fetchImpl = async url => {
    if (String(url).includes(':11434')) return response({ models: [{ name: 'qwen-test' }, { name: 'coder-test' }] });
    if (String(url).includes(':8000')) return response({ data: [{ id: 'vllm-test' }] });
    return response({}, 404);
  };
  const result = await discoverLocalRuntimeModels({
    candidates: [
      { runtime: 'OLLAMA', endpoint: 'http://127.0.0.1:11434', modelListPath: '/api/tags' },
      { runtime: 'VLLM', endpoint: 'http://127.0.0.1:8000', modelListPath: '/v1/models' }
    ],
    fetchImpl,
    date: new Date('2026-09-04T01:30:00Z')
  });
  assert.equal(result.ok, true);
  assert.equal(result.receipt.visibleRuntimeCount, 2);
  assert.equal(result.receipt.visibleModelCount, 3);
  assert.ok(result.receipt.runtimes.every(item => item.inferenceProven === false));
  assert.equal(result.receipt.automaticActivation, false);
});

test('discovery refuses non-loopback candidates instead of scanning arbitrary hosts', async () => {
  let calls = 0;
  const result = await discoverLocalRuntimeModels({
    candidates: [{ runtime: 'VLLM', endpoint: 'https://evil.example.com', modelListPath: '/v1/models' }],
    fetchImpl: async () => { calls += 1; return response({ data: [] }); }
  });
  assert.equal(result.ok, true);
  assert.equal(result.receipt.runtimes[0].status, 'UNSAFE_CANDIDATE_REJECTED');
  assert.equal(calls, 0);
});

test('malformed model list stays unrecognized and does not invent models', async () => {
  const result = await discoverLocalRuntimeModels({
    candidates: [{ runtime: 'VLLM', endpoint: 'http://127.0.0.1:8000', modelListPath: '/v1/models' }],
    fetchImpl: async () => response({ modelsMaybe: ['invent-me'] })
  });
  assert.equal(result.ok, true);
  assert.equal(result.receipt.runtimes[0].status, 'UNRECOGNIZED_MODEL_LIST');
  assert.deepEqual(result.receipt.runtimes[0].models, []);
  assert.equal(result.receipt.visibleModelCount, 0);
});

test('oversized or unreachable runtime responses fail locally without promotion', async () => {
  const huge = 'x'.repeat(1_000_100);
  const oversized = await discoverLocalRuntimeModels({
    candidates: [{ runtime: 'VLLM', endpoint: 'http://127.0.0.1:8000', modelListPath: '/v1/models' }],
    fetchImpl: async () => response(huge)
  });
  assert.equal(oversized.receipt.runtimes[0].status, 'RESPONSE_TOO_LARGE');

  const unreachable = await discoverLocalRuntimeModels({
    candidates: [{ runtime: 'OLLAMA', endpoint: 'http://127.0.0.1:11434', modelListPath: '/api/tags' }],
    fetchImpl: async () => { throw new Error('connection refused'); }
  });
  assert.equal(unreachable.receipt.runtimes[0].status, 'NOT_REACHABLE');
  assert.equal(unreachable.receipt.visibleRuntimeCount, 0);
  assert.equal(unreachable.receipt.automaticActivation, false);
});
