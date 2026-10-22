// Billing regressions for the verified-inquiry-defects sale, reproduced
// independently against merged main 3a7a0b7 (PR #1533) before any fix:
//
//   A. Two concurrent runs that start from the same persisted charged-key
//      snapshot both charged the same buyer, finding and day. A Set plus a
//      key-value write is not a cross-run reservation.
//   B. When the charge callback refused payment, the buyer-facing dataset item
//      still carried a chargeEvent id while the receipt reported zero charges.
//
// These tests drive the sale exactly as the Apify Actor wires it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { runVerifiedDefectsSale } from '../src/inquiry-findings.mjs';
import { extractInquirySurface, analyzeInquiryCoherence } from '../src/inquiry-path-coherence.mjs';

const BROKEN = `<a href="tel:5123050070">(512) 305-1070</a><p>${'Bastrop office. '.repeat(20)}</p>`;
const site = html => ({ website: 'https://plumber.example/', analysis: analyzeInquiryCoherence({ pages: [extractInquirySurface({ url: 'https://plumber.example/', html, status: 200 })] }) });
const now = () => new Date('2026-10-22T09:00:00Z');
const tick = () => new Promise(resolve => setImmediate(resolve));

/** A provider ledger that bills every call, with a network-like delay. */
function providerLedger() {
  const billed = [];
  return { billed, charge: async event => { await tick(); billed.push(event); return { ok: true }; } };
}

/** The Actor's previous persistence: a named key-value store holding a key array. */
function keyValueStore(initial = []) {
  let value = [...initial];
  return { get: async () => { await tick(); return [...value]; }, set: async keys => { await tick(); value = [...keys]; } };
}

test('defect A: concurrent runs from one persisted snapshot never charge the same buyer, finding and day twice', async () => {
  const provider = providerLedger();
  const store = keyValueStore();
  const run = async () => {
    const alreadyCharged = new Set(await store.get());
    return runVerifiedDefectsSale({
      buyerId: 'buyer-1',
      websites: ['https://plumber.example/'],
      probe: async () => { await tick(); return site(BROKEN); },
      pricePerVerifiedCents: 50,
      alreadyCharged,
      onCharged: () => store.set([...alreadyCharged]),
      charge: provider.charge,
      pushItem: async () => {},
      now
    });
  };
  await Promise.all([run(), run()]);
  const perKey = new Map();
  for (const event of provider.billed) perKey.set(event.idempotencyKey, (perKey.get(event.idempotencyKey) ?? 0) + 1);
  assert.ok([...perKey.values()].every(count => count <= 1), `same buyer/finding/day billed ${JSON.stringify([...perKey.values()])} times across concurrent runs`);
});

test('defect B: a refused charge never leaves a buyer-facing item that implies payment', async () => {
  const items = [];
  const receipt = await runVerifiedDefectsSale({
    buyerId: 'buyer-2',
    websites: ['https://plumber.example/'],
    probe: async () => site(BROKEN),
    pricePerVerifiedCents: 50,
    charge: async () => ({ ok: false, reason: 'NOT_BILLED' }),
    pushItem: async item => items.push(structuredClone(item)),
    now
  });
  assert.equal(receipt.charged, 0);
  assert.equal(items.length, 1, 'the reproduced finding is still delivered');
  assert.equal(items[0].chargeEvent ?? null, null, `dataset item carries charge id ${items[0].chargeEvent} although nothing was billed`);
  assert.doesNotMatch(JSON.stringify(items[0]), /"(charged|paid)":true|CONFIRMED/, 'nothing buyer-facing claims payment before provider confirmation');
});
