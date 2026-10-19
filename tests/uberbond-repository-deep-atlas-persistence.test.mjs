import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { boundedRedactedAtlasJsonChunks, persistRedactedAtlasJson, redactedAtlasJsonTokens } from '../src/uberbond-repository-deep-atlas-persistence.mjs';

const json = value => [...redactedAtlasJsonTokens(value)].join('');

test('streamed persistence preserves JSON structure and ordinary values', () => {
  const input = { z: [{ x: 1, y: false }, null, undefined], a: 'unicode', n: -0, missing: undefined };
  assert.deepEqual(JSON.parse(json(input)), JSON.parse(JSON.stringify(input)));
  assert.equal([...boundedRedactedAtlasJsonChunks({ large: 'a'.repeat(50000) }, 2048)].every(c => c.length <= 2048), true);
});

test('sensitive key values and scanner exemptions are sanitized before JSON escaping', () => {
  const marker = ['secret-scanner', 'fixtures', 'intentional'].join('-');
  const output = json({ nested: [{ apiKey: 'longSecretStringThatMustBeHidden' }], marker, cookie: 'id=123' });
  assert.equal(output.includes('longSecretStringThatMustBeHidden'), false);
  assert.equal(output.includes('id=123'), false);
  assert.equal(output.includes(marker), false);
  assert.match(output, /\[REDACTED\]/);
  assert.match(output, /secret-scanner-fixture-marker-redacted/);
  assert.doesNotThrow(() => JSON.parse(output));
});

test('custom serialization hooks and cyclic data fail closed', () => {
  let called = 0;
  assert.throws(() => json({ value: { toJSON() { called++; return 'unsafe'; } } }), /toJSON/);
  assert.equal(called, 0);
  const cyclic = {}; cyclic.self = cyclic;
  assert.throws(() => json(cyclic), /Cyclic/);
});

test('accessor properties and toJSON getters cannot execute in legacy writer', () => {
  let calls = 0;
  const obj = {};
  Object.defineProperty(obj, 'payload', { enumerable: true, get() { calls++; return 'unsafe'; } });
  assert.throws(() => json(obj), /getters refused/);
  const hook = {};
  Object.defineProperty(hook, 'toJSON', { get() { calls++; return () => 'unsafe'; } });
  assert.throws(() => json(hook), /toJSON hooks refused/);
  assert.equal(calls, 0);
});
