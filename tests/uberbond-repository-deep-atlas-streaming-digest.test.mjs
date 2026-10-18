import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { digestRepositoryDeepAtlas } from '../src/uberbond-repository-deep-atlas.mjs';

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}
const expected = value => crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');

test('streaming atlas hash preserves the exact canonical digest for ordinary objects', () => {
  const samples = [
    null, false, 0, -0, 1.5, '', 'complex 🔬 string', [null, 1, { z: 1, a: ['x', true] }],
    { zebra: 'last', alpha: { zero: false, one: 1 }, entries: [7, 6, 5] },
    { 10: 'ten', 2: 'two', 0: 'zero', omega: 42, alpha: 'first' },
    { undef: undefined, ignored: () => {}, allowed: 8 },
    [undefined, null, Symbol('x'), 3]
  ];
  for (const sample of samples) assert.equal(digestRepositoryDeepAtlas(sample), expected(sample));
});

test('streaming atlas hashing scales across large record lists without digest drift', () => {
  const details = Array.from({ length: 24000 }, (_, i) => ({
    id: 'deep:' + i.toString(16).padStart(12, '0'),
    class: i % 2 ? 'CONTENT_CHUNK' : 'CONFIG_KEY',
    sourcePath: 'artifacts/research/file-' + (i % 100) + '.json',
    truthClass: 'REPOSITORY_DECLARATION',
    preview: 'sanitized sample '.repeat(12),
    line: i
  }));
  const big = { details, coverage: [{ path: 'readme.md', textDigest: 'a'.repeat(64) }], deepFeatureCount: details.length };
  assert.equal(digestRepositoryDeepAtlas(big), expected(big));
});

test('custom JSON serialization callbacks are refused rather than executed', () => {
  let calls = 0;
  const value = { stamp: { toJSON() { calls++; return 'should never run'; } } };
  assert.throws(() => digestRepositoryDeepAtlas(value), /toJSON hooks are refused/);
  assert.equal(calls, 0);
});

test('cyclic structures are refused instead of entering an endless walk', () => {
  const cyclic = {};
  cyclic.self = cyclic;
  assert.throws(() => digestRepositoryDeepAtlas(cyclic), /Cyclic/);
});

test('unserializable root values cannot mint digests', () => {
  assert.throws(() => digestRepositoryDeepAtlas(undefined), /Non-JSON/);
});
