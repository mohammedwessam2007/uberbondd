// Synthetic hostile regression. This is not a trade, return observation or income.
// Expected red on main 3a7a0b7a5ece796e617c0c363118d4b1618bf9c1.
import assert from 'node:assert/strict';
import { recordPaperDecision, markPaperDecision } from '../../src/quant-paper-ledger.mjs';

const chain = recordPaperDecision([], {
  strategy: 'SYNTHETIC_HOSTILE_CHECK_ONLY', params: {}, positions: { X: 1 },
  quotes: { X: { price: 1, source: 'SYNTHETIC_FIXTURE', observedAt: '2026-10-23T00:00:00Z' } },
  decidedAt: '2026-10-23T00:00:00Z', dataThrough: '2026-10-23T00:00:00Z'
});
assert.throws(() => markPaperDecision(chain, {
  strategy: 'SYNTHETIC_HOSTILE_CHECK_ONLY',
  quotes: { X: { price: 100, source: 'SYNTHETIC_FIXTURE', observedAt: '2030-01-01T00:00:00Z' } },
  markedAt: '2026-10-23T00:01:00Z'
}), 'An exit quote observed after the mark must not create PAPER P&L');
