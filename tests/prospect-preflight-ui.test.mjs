import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectProspect } from '../public/prospect-preflight-ui.js';

test('read-only frozen validation rejects execution and payload overrides before API access', async () => {
  let calls = 0;
  const request = async () => { calls++; return { validation: { valid: true } }; };
  await assert.rejects(inspectProspect({ request, input: { frozenEffectDigest: 'a'.repeat(64), executeFrozenEffect: true } }), /frozen-preflight-accepts-only-digest/);
  await assert.rejects(inspectProspect({ request, input: { frozenEffectDigest: 'a'.repeat(64), executeFrozenEffect: false } }), /frozen-preflight-accepts-only-digest/);
  await assert.rejects(inspectProspect({ request, input: { executeFrozenEffect: true } }), /execution-flag-forbidden-in-read-only-preflight/);
  assert.equal(calls, 0);
});

test('read-only frozen validation sends only the digest and cannot confer authority', async () => {
  let call;
  const result = await inspectProspect({
    request: async (path, options) => { call = { path, options }; return { validation: { valid: true } }; },
    input: { frozenEffectDigest: 'b'.repeat(64) }
  });
  assert.equal(call.path, '/api/prospect-preflight');
  assert.deepEqual(JSON.parse(call.options.body), { frozenEffectDigest: 'b'.repeat(64) });
  assert.equal(result.readOnly, true);
  assert.equal(result.sendAuthority, false);
  assert.equal(result.externalEffects, 0);
});
