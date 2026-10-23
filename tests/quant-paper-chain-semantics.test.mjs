import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { recordPaperDecision, markPaperDecision, verifyPaperChain, paperSummary } from '../src/quant-paper-ledger.mjs';

// The ledger's hashes are unkeyed, so a forger can always re-hash. These tests
// forge records the way an attacker would and expect the semantic replay to
// refuse them.
const sha256 = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const rehash = chain => {
  const out = [];
  for (const [index, record] of chain.entries()) {
    const { hash, ...body } = record;
    const fixed = { ...body, index, previousHash: index ? out[index - 1].hash : '0'.repeat(64) };
    out.push({ ...fixed, hash: sha256(fixed) });
  }
  return out;
};
const decidedAt = '2026-10-23T00:00:00Z';
const markedAt = '2026-10-23T01:00:00Z';
const decided = () => recordPaperDecision([], { strategy: 'S', positions: { X: 1 },
  quotes: { X: { price: 100, source: 'SYNTHETIC_TEST_FIXTURE', observedAt: decidedAt } }, decidedAt });
const marked = () => markPaperDecision(decided(), { strategy: 'S', quotes: { X: { price: 101, source: 'SYNTHETIC_TEST_FIXTURE', observedAt: markedAt } }, markedAt, costBps: { X: 10 } });

test('a genuine chain verifies and its marks carry their cost inputs', () => {
  const chain = marked();
  assert.deepEqual(verifyPaperChain(chain), { ok: true, head: chain.at(-1).hash, length: 2 });
  assert.deepEqual({ costBps: chain[1].costBps, carryFraction: chain[1].carryFraction, capitalPerUnit: chain[1].capitalPerUnit }, { costBps: { X: 10 }, carryFraction: 0, capitalPerUnit: 1 });
  assert.equal(paperSummary(chain).chain.ok, true);
});

test('a re-hashed mark claiming +9,900% from a future quote is refused (the probe that passed before 1.2.0)', () => {
  const chain = marked();
  const forged = rehash([chain[0], { ...chain[1], quotes: { X: { price: 10_000, observedAt: '2030-01-01T00:00:00Z' } }, netReturnOnCapital: 99 }]);
  assert.deepEqual(verifyPaperChain(forged), { ok: false, brokenAt: 1, reason: 'MARK_EXIT_QUOTE_INVALID' });
  assert.equal(paperSummary(forged).chain.ok, false);
});

test('a re-hashed mark with a valid quote but an inflated return is refused', () => {
  const chain = marked();
  const forged = rehash([chain[0], { ...chain[1], netReturnOnCapital: chain[1].netReturnOnCapital + 0.05 }]);
  assert.equal(verifyPaperChain(forged).reason, 'MARK_RETURN_MISMATCH');
});

test('a mark in the pre-1.2.0 shape cannot be recomputed and is not trusted', () => {
  const chain = marked();
  const { costBps, carryFraction, capitalPerUnit, ...legacy } = chain[1];
  assert.equal(verifyPaperChain(rehash([chain[0], legacy])).reason, 'MARK_SEMANTICS_UNVERIFIABLE');
});

test('marks must point at an earlier decision of the same strategy, once', () => {
  const chain = marked();
  assert.equal(verifyPaperChain(rehash([chain[0], { ...chain[1], decisionIndex: 5 }])).reason, 'MARK_WITHOUT_DECISION');
  assert.equal(verifyPaperChain(rehash([chain[0], { ...chain[1], strategy: 'OTHER' }])).reason, 'MARK_WITHOUT_DECISION');
  assert.equal(verifyPaperChain(rehash([chain[0], chain[1], { ...chain[1], markedAt: '2026-10-23T02:00:00Z', quotes: { X: { price: 101, observedAt: '2026-10-23T02:00:00Z' } } }])).reason, 'DECISION_MARKED_TWICE');
});

test('a re-hashed decision that used a quote from after its own timestamp is refused', () => {
  const chain = decided();
  const forged = rehash([{ ...chain[0], quotes: { X: { price: 100, observedAt: '2026-10-24T00:00:00Z' } } }]);
  assert.deepEqual(verifyPaperChain(forged), { ok: false, brokenAt: 0, reason: 'DECISION_SEMANTICS' });
});
