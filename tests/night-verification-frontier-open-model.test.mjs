import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { validateRegistrations } from '../scripts/night-verification-frontier-open-model-mutations.mjs';
import { createOpenModelRuntimeExecutor } from '../src/open-model-runtime-executor.mjs';

const pricing = {
  inputUsdPerMillion: 0,
  outputUsdPerMillion: 0,
  infrastructureUsdPerRequest: 0,
  sourceRef: 'runtime-observation:night-verification',
  verifiedAt: '2026-09-03T01:50:00Z'
};

test('Frontier/Open-Model mutation registrations have unique anchors and named assertion touchpoints', () => {
  const results = validateRegistrations();
  assert.equal(results.length, 9);
  for (const result of results) {
    assert.equal(result.anchorOccurrences, 1, `${result.id} must have exactly one mutation anchor`);
    assert.equal(result.registrationValid, true, `${result.id} must name a suite assertion touching the guard`);
    assert.ok(result.suiteEvidence.length > 0);
    assert.ok(result.suiteEvidence.every(item => item.assertionNeedlePresent));
  }
});

test('Night Frontier recovery rerun preserves deterministic mutation registration evidence', () => {
  const first = validateRegistrations();
  const replay = validateRegistrations();
  assert.deepEqual(replay, first);
});

test('Night Verification War recovery cleanup removes each mutation sandbox in a finally path', async () => {
  const source = await readFile(new URL('../scripts/night-verification-frontier-open-model-mutations.mjs', import.meta.url), 'utf8');
  assert.match(source, /finally\s*\{/);
  assert.match(source, /rmSync\(root,\s*\{\s*recursive:\s*true,\s*force:\s*true\s*\}\)/);
});

test('Open Model runtime must not report successful completion when provider model identity mismatches configured model', async () => {
  const executor = createOpenModelRuntimeExecutor({
    runtime: 'VLLM',
    model: 'trusted/model-a',
    endpoint: 'http://127.0.0.1:8000',
    pricing,
    enabled: true,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        id: 'req-identity-mismatch',
        model: 'different/model-b',
        usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
        choices: [{ message: { content: JSON.stringify({ answer: 42 }) } }]
      })
    })
  });

  const result = await executor({
    task: { taskId: 'identity-check', objective: 'return structured json', consequenceClass: 'LOCAL_PREPARATION' },
    maxTokens: 16,
    costCeilingCents: 1
  });

  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('open-model-runtime-model-identity-mismatch'));
  assert.equal(result.businessEffectAuthority, 'NONE');
});
