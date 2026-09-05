import test from 'node:test';
import assert from 'node:assert/strict';
import { compileFrontierExecutorWorker } from '../src/frontier-reasoning-runtime.mjs';

test('frontier runtime refuses an AI Gateway transport identity wider than the canonical executor boundary', () => {
  const provider = 'google';
  const transportModel = `${provider}/${'m'.repeat(154)}`; // 161 chars total, one beyond the gateway executor boundary.
  const out = compileFrontierExecutorWorker({
    profileId: 'oversized-transport',
    provider,
    model: 'gemini-frontier',
    revision: 'rev-1',
    transportProvider: 'ai-gateway',
    transportModel,
    reasoningTier: 'FRONTIER_MAX',
    reasoningSettingRef: 'ai-gateway:reasoning=xhigh'
  });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('complete-transport-identity-required'));
});
