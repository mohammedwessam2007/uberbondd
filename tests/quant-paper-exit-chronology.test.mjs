import test from 'node:test';
import assert from 'node:assert/strict';
import { recordPaperDecision, markPaperDecision, paperSummary } from '../src/quant-paper-ledger.mjs';
const decidedAt = '2026-10-23T00:00:00Z';
const markedAt = '2026-10-23T00:01:00Z';
const decision = () => recordPaperDecision([], { strategy: 'exit-clock', positions: { X: 1 },
  quotes: { X: { price: 1, source: 'SYNTHETIC_TEST_FIXTURE', observedAt: decidedAt } }, decidedAt });
for (const [name, observedAt] of [
  ['future', '2030-01-01T00:00:00Z'],
  ['invalid', 'not-a-date'], ['missing', undefined],
  ['before decision', '2026-10-22T23:59:59Z']
]) test('paper exit rejects ' + name + ' quote timestamp', () => {
  assert.throws(() => markPaperDecision(decision(), { strategy: 'exit-clock',
    quotes: { X: { price: 100, source: 'SYNTHETIC_TEST_FIXTURE', observedAt } }, markedAt }),
    /exit quote.*observed/);
});
test('paper exit accepts a quote within the decision-to-mark window', () => {
  const chain = markPaperDecision(decision(), { strategy: 'exit-clock',
    quotes: { X: { price: 1.01, source: 'SYNTHETIC_TEST_FIXTURE', observedAt: markedAt } },
    markedAt, costBps: { X: 10 } });
  assert.ok(Math.abs(paperSummary(chain).strategies['exit-clock'].netReturn - 0.008) < 1e-12);
  assert.equal(paperSummary(chain).moneyClaim, 'NONE');
});
