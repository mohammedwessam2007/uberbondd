// Three implementations of "did this touch the outside world", and only one of
// them was wrong.
//
//   src/cloud-agent-relay.mjs      canonicalZeroEffectLedger  -- correct
//   src/relay-shadow-binding.mjs   Number(ledger[key] ?? NaN) -- correct
//   src/chatgpt-relay-client.mjs   Number(value[key] || 0)    -- accepted {}
//
// The third had the omitted-key hole that was found and fixed in the first and
// never propagated. Probed before the fix, every one of these was ACCEPTED AS
// ZERO EFFECTS: `{}`, a single key, a missing counter, `null`, `undefined`, and
// the string '0'. Silence scored the same as a signed zero, in the module that
// reads results back from a relay worker.
//
// Which implementation a caller happens to reach must not change the answer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { canonicalZeroEffectLedger } from '../src/cloud-agent-relay.mjs';

// Comments describing the defect quote its spelling, and a source-text
// assertion that matches prose is an assertion about prose. Both of the checks
// below caught exactly that on their first run.
function codeOnly(path) {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter(line => !line.trimStart().startsWith('//'))
    .join('\n');
}
import { ZERO_EXTERNAL_EFFECTS, isProvenZeroEffect } from '../src/effect-ledgers.mjs';

const NOT_PROOF_OF_ZERO = [
  ['an empty object', {}],
  ['a single counter', { messages: 0 }],
  ['a missing spendCents', (() => { const l = { ...ZERO_EXTERNAL_EFFECTS }; delete l.spendCents; return l; })()],
  ['a null counter', { ...ZERO_EXTERNAL_EFFECTS, spendCents: null }],
  ['an undefined counter', { ...ZERO_EXTERNAL_EFFECTS, messages: undefined }],
  ['a string zero', { ...ZERO_EXTERNAL_EFFECTS, messages: '0' }],
  ['a NaN counter', { ...ZERO_EXTERNAL_EFFECTS, messages: NaN }],
  ['an array', []],
  ['null', null],
  ['undefined', undefined]
];

test('nothing incomplete is proof of zero effects, on any path', () => {
  for (const [label, ledger] of NOT_PROOF_OF_ZERO) {
    assert.notEqual(canonicalZeroEffectLedger(ledger).length, 0, `${label} was accepted by the relay boundary`);
    assert.equal(isProvenZeroEffect('externalEffectLedger', ledger), false, `${label} was accepted as proven zero`);
  }
});

test('a complete signed zero is accepted, on every path', () => {
  assert.deepEqual(canonicalZeroEffectLedger({ ...ZERO_EXTERNAL_EFFECTS }), []);
  assert.equal(isProvenZeroEffect('externalEffectLedger', { ...ZERO_EXTERNAL_EFFECTS }), true);
});

test('the relay client agrees with the canonical boundary', async () => {
  // Exercised through the module rather than by copying its logic, so the test
  // fails if it grows a private implementation again.
  const source = codeOnly('src/chatgpt-relay-client.mjs');
  assert.ok(source.includes('canonicalZeroEffectLedger'),
    'the relay client must defer to the canonical check rather than reimplement it');
  assert.ok(!/Number\(value\[key\] \|\| 0\)/.test(source),
    'the omitted-key spelling is the defect itself');
});

test('no module reintroduces the omitted-key spelling', () => {
  // `value[key] || 0` reads a missing counter as zero. `value[key] ?? NaN` does
  // not, which is why relay-shadow-binding.mjs was always correct. A fourth
  // implementation is allowed to exist; this spelling is not.
  const offenders = readdirSync('src')
    .filter(name => name.endsWith('.mjs'))
    .filter(name => {
      return /Object\.entries\((?:ZERO_EFFECTS|ZERO_EXTERNAL_EFFECTS|ZERO_CANONICAL_EFFECTS)\)[\s\S]{0,120}\|\|\s*0\)/.test(codeOnly(`src/${name}`));
    });
  assert.deepEqual(offenders, [],
    'these read an omitted effect counter as a signed zero');
});

test('a positive effect is refused everywhere, which is the easy half', () => {
  for (const key of Object.keys(ZERO_EXTERNAL_EFFECTS)) {
    const ledger = { ...ZERO_EXTERNAL_EFFECTS, [key]: 1 };
    assert.notEqual(canonicalZeroEffectLedger(ledger).length, 0, `${key} > 0 was accepted`);
    assert.equal(isProvenZeroEffect('externalEffectLedger', ledger), false);
  }
});
