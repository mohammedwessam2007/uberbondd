import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { compileVerifiedSemanticCanonicalizer } from '../src/semantic-reuse-foundry.mjs';

// The canonical representative of a verified rewrite class must not depend on the order receipts arrive in.
// Synthetic receipts only: every receipt is an E2-verified transformation with a pinned trust hash.
const raw = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const pin = value => `sha256:${raw(JSON.stringify(value))}`;
const NOW = Date.parse('2026-10-14T00:00:00Z');
const QUALITY = raw('quality-contract');
const CROWN = 'crown-r1';
const DEPS = { ontology: raw('ontology-v1') };
const INVALIDATORS = { ontologyDrift: false };
const EXPRESSIONS = [
  { id: 'k.gamma', value: 'gamma-form' },
  { id: 'k.alpha', value: 'alpha-form' },
  { id: 'k.beta', value: 'beta-form' }
];
const CONTEXT = { crownRevision: CROWN, sourceHashes: DEPS, invalidators: INVALIDATORS };

function receipt(id, from, to) {
  return {
    id, from, to, verifierPassed: true, authority: 'E2_VERIFIED_TRANSFORMATION',
    proofHash: `sha256:${raw(`proof-${id}`)}`, qualityContractHash: QUALITY, crownRevision: CROWN,
    sourceDependencies: DEPS, invalidators: INVALIDATORS, evidenceRef: `proof://${id}`, expiresAt: '2027-01-01T00:00:00Z'
  };
}

// A three-cycle: alpha -> beta -> gamma -> alpha. Every member is one equivalence class.
const CYCLE = [receipt('rw-1', 'k.alpha', 'k.beta'), receipt('rw-2', 'k.beta', 'k.gamma'), receipt('rw-3', 'k.gamma', 'k.alpha')];

function permutations(items) {
  if (items.length <= 1) return [items];
  return items.flatMap((item, index) => permutations([...items.slice(0, index), ...items.slice(index + 1)]).map(rest => [item, ...rest]));
}

function compileWith(receipts, expressions = EXPRESSIONS) {
  return compileVerifiedSemanticCanonicalizer({
    expressions,
    rewriteReceipts: receipts,
    rewriteTrustPins: Object.fromEntries(receipts.map(item => [item.id, pin(item)])),
    qualityContractHash: QUALITY,
    crownRevision: CROWN,
    sourceDependencies: DEPS,
    invalidators: INVALIDATORS,
    now: NOW
  });
}

test('all six permutations of the same three-cycle of verified rewrites canonicalize to one value', () => {
  const orders = permutations(CYCLE);
  assert.equal(orders.length, 6);
  const observed = orders.map(order => {
    const canonicalizer = compileWith(order);
    assert.equal(canonicalizer.ok, true, `compile ${order.map(item => item.id).join(',')}`);
    return ['alpha-form', 'beta-form', 'gamma-form'].map(value => {
      const result = canonicalizer.canonicalize(value, { currentContext: CONTEXT });
      assert.equal(result.ok, true);
      return result.value;
    });
  });
  for (const values of observed) {
    assert.deepEqual(values, ['alpha-form', 'alpha-form', 'alpha-form']);
  }
});

test('a cycle with no single target is represented by its lexicographic minimum, whichever member is queried', () => {
  const canonicalizer = compileWith(CYCLE);
  const result = canonicalizer.canonicalize('gamma-form', { currentContext: CONTEXT });
  assert.equal(result.toExpressionId, 'k.alpha');
  assert.equal(result.transformed, true);
  assert.equal(result.value, 'alpha-form');
});

test('a single directed rewrite canonicalizes to its target, as the E2 receipt directs, in either direction', () => {
  const pair = [{ id: 'k.zeta', value: 'zeta-form' }, { id: 'k.alpha', value: 'alpha-form' }];
  const toZeta = compileWith([receipt('rw-p', 'k.alpha', 'k.zeta')], pair);
  assert.equal(toZeta.ok, true);
  assert.equal(toZeta.canonicalize('alpha-form', { currentContext: CONTEXT }).value, 'zeta-form');
  const toAlpha = compileWith([receipt('rw-p', 'k.zeta', 'k.alpha')], pair);
  assert.equal(toAlpha.ok, true);
  assert.equal(toAlpha.canonicalize('zeta-form', { currentContext: CONTEXT }).value, 'alpha-form');
  assert.equal(toAlpha.canonicalize('alpha-form', { currentContext: CONTEXT }).status, 'ALREADY_CANONICAL');
});

test('a branching class with two targets is represented by the lexicographic minimum of those targets in every order', () => {
  const branch = [receipt('rw-b1', 'k.alpha', 'k.gamma'), receipt('rw-b2', 'k.alpha', 'k.beta')];
  for (const order of permutations(branch)) {
    const canonicalizer = compileWith(order);
    assert.equal(canonicalizer.ok, true);
    const result = canonicalizer.canonicalize('alpha-form', { currentContext: CONTEXT });
    assert.equal(result.toExpressionId, 'k.beta');
    assert.equal(result.value, 'beta-form');
  }
});
