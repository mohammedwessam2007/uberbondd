import test from 'node:test';
import assert from 'node:assert/strict';

import {
  compileOpenRouterCatalogSnapshot,
  observeOpenRouterCatalog
} from '../src/openrouter-market-catalog.mjs';

test('OpenRouter catalog converts per-token prices to verified per-million discovery evidence', () => {
  const out = compileOpenRouterCatalogSnapshot({
    data: [{
      id: 'vendor/model-a',
      name: 'Model A',
      context_length: 1000000,
      supported_parameters: ['reasoning', 'response_format'],
      pricing: {
        prompt: '0.00000007',
        completion: '0.00000014',
        input_cache_read: '0.0000000014'
      }
    }]
  }, { observedAt: '2026-09-29T12:00:00.000Z' });

  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.modelCount, 1);
  assert.equal(out.models[0].pricing.inputUsdPerMillion, 0.07);
  assert.equal(out.models[0].pricing.outputUsdPerMillion, 0.14);
  assert.equal(out.models[0].pricing.cacheReadUsdPerMillion, 0.0014);
  assert.equal(out.models[0].semanticAuthority, 'NONE');
  assert.match(out.snapshotDigest, /^[a-f0-9]{64}$/);
});

test('live catalog observation is read-only and can use a public endpoint without leaking credential', async () => {
  let method = null;
  let auth = null;
  const secret = 'sk-or-v1-test-catalog-secret';
  const out = await observeOpenRouterCatalog({
    apiKey: secret,
    fetchImpl: async (_url, options = {}) => {
      method = options.method || 'GET';
      auth = options.headers?.Authorization || null;
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({ data: [{ id: 'vendor/model-b', pricing: { prompt: '0.000001', completion: '0.000002' } }] });
        }
      };
    }
  });
  assert.equal(out.ok, true);
  assert.equal(method, 'GET');
  assert.equal(auth, `Bearer ${secret}`);
  assert.equal(JSON.stringify(out).includes(secret), false);
});
