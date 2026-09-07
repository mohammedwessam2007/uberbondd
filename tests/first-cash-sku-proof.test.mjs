import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFirstCashCanaryPacket } from '../src/first-cash-canary-packet.mjs';
import { LEAD_PATH_SPRINT_SKU } from '../src/lead-path-sprint-fulfillment.mjs';

test('the first-cash packet stays bound to the canonical Lead-Path SKU', () => {
  const packet = buildFirstCashCanaryPacket({ date: new Date('2026-09-01T00:00:00.000Z') });
  assert.equal(packet.sku, LEAD_PATH_SPRINT_SKU);
});
