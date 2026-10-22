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

// ---------------------------------------------------------------------------
// Repair: atomic reservations, separated billing states, fail-closed charging.

import { settleFindingsSale, makeFinding } from '../src/self-verifying-findings.mjs';
import { createProcessChargeReservations, createSqlChargeReservations, guaranteeSatisfies } from '../src/charge-reservations.mjs';
import { apifyPayPerEventBilling } from '../src/apify-ppe-billing.mjs';

const oneProcess = (reservations = createProcessChargeReservations()) => ({ reservations, requiredGuarantee: 'ATOMIC_SINGLE_PROCESS' });
const finding = subject => makeFinding({ subject, code: 'X', claimKey: 'k', claim: 'c', evidence: [{ url: subject }], disproof: 'd', verifierId: 'v' });
const reproduces = async f => ({ outcome: 'REPRODUCED', evidence: [{ seen: f.subject }] });
const sell = (overrides = {}) => settleFindingsSale({ buyerId: 'buyer', findings: [finding('https://a.example/')], verifier: reproduces, pricePerVerifiedCents: 50, now, ...overrides });

test('a process-local store cannot satisfy the cross-run requirement, so separate processes charge nothing', async () => {
  assert.equal(guaranteeSatisfies('ATOMIC_SINGLE_PROCESS', 'ATOMIC_CROSS_RUN'), false);
  assert.equal(guaranteeSatisfies('ATOMIC_CROSS_RUN', 'ATOMIC_SINGLE_PROCESS'), true);
  const provider = providerLedger();
  // Each "process" has its own memory: exactly what two Apify runs would have.
  const runs = await Promise.all([1, 2].map(() => sell({ charge: provider.charge, reservations: createProcessChargeReservations() })));
  assert.equal(provider.billed.length, 0);
  assert.ok(runs.every(({ receipt }) => receipt.chargingBlockedReason === 'RESERVATION_GUARANTEE_ATOMIC_SINGLE_PROCESS_BELOW_ATOMIC_CROSS_RUN'));
  assert.ok(runs.every(({ delivered }) => delivered[0].deliveredBilling.status === 'NOT_CHARGED'), 'findings are still delivered, free');
});

test('a charge callback that throws is UNKNOWN: kept reserved, never retried, and charging stops', async () => {
  const store = createProcessChargeReservations();
  let calls = 0;
  const crashing = async () => { calls += 1; throw new Error('socket hang up'); };
  const first = await sell({ findings: [finding('https://a.example/'), finding('https://b.example/')], charge: crashing, ...oneProcess(store) });
  assert.equal(calls, 1, 'after an unknown outcome no further charge is attempted');
  assert.equal(first.receipt.billing.unknown, 1);
  assert.equal(first.receipt.chargingHalted, 'UNKNOWN_CHARGE_OUTCOME');
  assert.equal(first.receipt.charged, 0, 'unknown is not counted as revenue');
  assert.equal(first.delivered[1].finalBilling.reason, 'CHARGING_HALTED:UNKNOWN_CHARGE_OUTCOME');
  assert.match(first.receipt.billingUnknown[0].detail, /CHARGE_CALLBACK_THREW:socket hang up/);
  const retry = await sell({ charge: async () => { calls += 1; return { status: 'CONFIRMED' }; }, ...oneProcess(store) });
  assert.equal(calls, 1, 'a later run never re-charges an unknown outcome');
  assert.equal(retry.delivered[0].finalBilling.reason, 'CHARGE_RESERVED_ELSEWHERE:UNKNOWN');
});

test('responses that do not say billed or not billed are UNKNOWN, not refused', async () => {
  for (const response of [undefined, {}, { ok: 'yes' }, { status: 'MAYBE' }, 1]) {
    const { receipt } = await sell({ charge: async () => response, ...oneProcess() });
    assert.equal(receipt.billing.unknown, 1, `response ${JSON.stringify(response)}`);
    assert.equal(receipt.billing.providerRefused, 0);
  }
});

test('a definite refusal releases the reservation, so a later run the same day may charge once', async () => {
  const store = createProcessChargeReservations();
  const refused = await sell({ charge: async () => ({ status: 'REFUSED', reason: 'NOT_BILLED' }), ...oneProcess(store) });
  assert.equal(refused.receipt.billing.providerRefused, 1);
  assert.equal(store.rows().length, 0);
  const later = await sell({ charge: async () => ({ status: 'CONFIRMED' }), ...oneProcess(store) });
  assert.equal(later.receipt.charged, 1);
  assert.deepEqual(store.rows().map(row => row.state), ['CONFIRMED']);
});

test('an unavailable reservation store stops charging and still delivers, free', async () => {
  const provider = providerLedger();
  const down = { guarantee: 'ATOMIC_CROSS_RUN', reserve: async () => { throw new Error('ECONNREFUSED'); }, settle: async () => {} };
  const { receipt, delivered } = await sell({ findings: [finding('https://a.example/'), finding('https://b.example/')], charge: provider.charge, reservations: down });
  assert.equal(provider.billed.length, 0);
  assert.equal(receipt.chargingHalted, 'RESERVATION_STORE_UNAVAILABLE');
  assert.equal(receipt.reservationErrors.length, 1, 'the store is not hammered after the first failure');
  assert.ok(delivered.every(item => item.deliveredBilling.status === 'NOT_CHARGED'));
});

test('a failed delivery releases the reservation and is never charged', async () => {
  const store = createProcessChargeReservations();
  const provider = providerLedger();
  const { receipt } = await sell({ charge: provider.charge, deliver: async () => { throw new Error('dataset write failed'); }, ...oneProcess(store) });
  assert.equal(provider.billed.length, 0);
  assert.match(receipt.refusals[0].detail, /^DELIVERY_FAILED:dataset write failed/);
  assert.equal(store.rows().length, 0, 'nothing was billed, so the key is free again');
});

test('the spending limit is checked before delivery: an exhausted buyer gets no free item and no overcharge', async () => {
  const provider = providerLedger();
  const items = [];
  const { receipt } = await sell({ charge: provider.charge, canCharge: () => false, deliver: async item => items.push(item), ...oneProcess() });
  assert.equal(provider.billed.length, 0);
  assert.equal(items.length, 0);
  assert.equal(receipt.refusals[0].detail, 'BUYER_SPEND_LIMIT_REACHED');
  const unsure = await sell({ charge: provider.charge, canCharge: () => { throw new Error('no pricing'); }, ...oneProcess() });
  assert.equal(unsure.receipt.charged, 0, 'an uncheckable limit is treated as exhausted');
});

test('an interrupted run that reserved but never settled blocks every later charge of that key', async () => {
  const store = createProcessChargeReservations();
  await store.reserve('orphan', { runId: 'crashed-run' });
  const day = now().toISOString().slice(0, 10);
  const target = finding('https://a.example/');
  const { createHash } = await import('node:crypto');
  const key = createHash('sha256').update(JSON.stringify({ buyerId: 'buyer', findingId: target.id, day })).digest('hex').slice(0, 40);
  await store.reserve(key, { runId: 'crashed-run' });
  const provider = providerLedger();
  const { delivered } = await sell({ findings: [target], charge: provider.charge, ...oneProcess(store) });
  assert.equal(provider.billed.length, 0);
  assert.equal(delivered[0].finalBilling.reason, 'CHARGE_RESERVED_ELSEWHERE:PENDING');
});

test('the same finding twice in one request is charged once; the delivered item is frozen at pending', async () => {
  const provider = providerLedger();
  const items = [];
  const f = finding('https://a.example/');
  const { receipt } = await sell({ findings: [f, f], charge: provider.charge, deliver: async item => items.push(item), ...oneProcess() });
  assert.equal(provider.billed.length, 1);
  assert.equal(receipt.billing.confirmed, 1);
  assert.equal(receipt.billing.notCharged, 1);
  assert.equal(items[0].deliveredBilling.status, 'PENDING_PROVIDER_CONFIRMATION', 'what the buyer was given does not change after the charge');
  assert.ok(Object.isFrozen(items[0].deliveredBilling));
});

test('a delivery-only run (fixed-price engagement) never charges and needs no reservation store', async () => {
  const { receipt, delivered } = await sell({ pricePerVerifiedCents: undefined });
  assert.equal(receipt.chargingMode, 'DELIVERY_ONLY');
  assert.equal(delivered[0].finalBilling.reason, 'DELIVERY_ONLY_RUN');
  await assert.rejects(sell({ charge: async () => ({ status: 'CONFIRMED' }), pricePerVerifiedCents: undefined, ...oneProcess() }), /pricePerVerifiedCents/);
});

// The Apify SDK (3.7.2) semantics this adapter depends on, as fakes.
function fakeChargingManager({ isPayPerEvent = true, prices = { 'verified-finding': 0.25 }, maxTotalChargeUsd = Infinity, throwOnCall = false } = {}) {
  let total = 0;
  const max = name => { const price = prices[name] ?? 0; return price ? Math.floor((maxTotalChargeUsd - total) / price + 1e-9) : Infinity; };
  return {
    pricingInfo: { isPayPerEvent, perEventPrices: prices, maxTotalChargeUsd },
    maxChargeableWithinLimit: max,
    charge: async ({ eventName, count }) => {
      if (!isPayPerEvent) return { chargedCount: 0, eventChargeLimitReached: false };
      if (!(eventName in prices)) return { chargedCount: count, eventChargeLimitReached: false }; // the SDK's unpriced-event behaviour
      const allowed = max(eventName);
      const charged = count <= allowed ? count : total <= maxTotalChargeUsd ? allowed + 1 : 0; // overcharge-by-one
      if (throwOnCall) throw new Error('platform 502');
      total += charged * prices[eventName];
      return { chargedCount: charged, eventChargeLimitReached: max(eventName) <= 0 };
    }
  };
}

test('Apify adapter: unpriced events and non pay-per-event runs never produce a believed charge', async () => {
  const unpriced = fakeChargingManager({ prices: { 'other-event': 0.25 } });
  assert.deepEqual(apifyPayPerEventBilling(unpriced), { mode: 'NOT_CHARGEABLE', reason: 'EVENT_NOT_PRICED:verified-finding' });
  assert.equal(apifyPayPerEventBilling(fakeChargingManager({ isPayPerEvent: false })).mode, 'DELIVERY_ONLY');
  assert.equal(apifyPayPerEventBilling(fakeChargingManager({ prices: { 'verified-finding': 0.005 } })).mode, 'NOT_CHARGEABLE', 'sub-cent prices would be misreported in cents');
  assert.equal(apifyPayPerEventBilling(fakeChargingManager({ prices: { 'verified-finding': 0.25, 'apify-default-dataset-item': 0.001 } })).reason, 'DATASET_ITEM_EVENT_WOULD_BILL_UNCHARGED_FINDINGS', 'a priced dataset-item event would bill findings delivered free');
  const priced = apifyPayPerEventBilling(fakeChargingManager());
  assert.equal(priced.priceCents, 25, 'the receipt uses the configured event price, not a nominal number');
});

test('Apify adapter: budget exhaustion and platform failures map to refused and unknown', async () => {
  const manager = fakeChargingManager({ maxTotalChargeUsd: 0.5 });
  const billing = apifyPayPerEventBilling(manager);
  const results = [];
  for (let i = 0; i < 3; i += 1) results.push(billing.canCharge() ? await billing.charge() : 'NOT_ATTEMPTED');
  assert.deepEqual(results.map(r => r.status ?? r), ['CONFIRMED', 'CONFIRMED', 'NOT_ATTEMPTED'], 'canCharge stops before the SDK would overcharge by one');
  assert.equal(results[1].limitReached, true);
  const failing = apifyPayPerEventBilling(fakeChargingManager({ throwOnCall: true }));
  await assert.rejects(failing.charge(), /platform 502/, 'the adapter lets the throw reach the sale, which records UNKNOWN');
  const { receipt } = await sell({ charge: failing.charge, canCharge: failing.canCharge, pricePerVerifiedCents: failing.priceCents, ...oneProcess() });
  assert.equal(receipt.billing.unknown, 1);
});

// Real PostgreSQL: run with UBERBOND_TEST_POSTGRES_URL pointing at a disposable server.
const PG_URL = process.env.UBERBOND_TEST_POSTGRES_URL;
test('defect A repaired against real PostgreSQL: many concurrent runs, exactly one charge per buyer, finding and day', { skip: PG_URL ? false : 'set UBERBOND_TEST_POSTGRES_URL to run against PostgreSQL' }, async () => {
  const { default: pg } = await import('pg');
  // A private schema per run: teardown drops it without killing anyone's connection.
  const schema = `charge_reservations_${process.pid}_${Date.now()}`;
  const admin = new pg.Client({ connectionString: PG_URL });
  await admin.connect();
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pools = [];
  try {
    const store = () => { const pool = new pg.Pool({ connectionString: PG_URL, max: 1, options: `-c search_path=${schema}` }); pools.push(pool); return createSqlChargeReservations({ query: (sql, params) => pool.query(sql, params) }); };
    await store().ensureSchema();
    const provider = providerLedger();
    const runs = await Promise.all(Array.from({ length: 12 }, (_, index) => runVerifiedDefectsSale({
      buyerId: 'buyer-pg', runId: `run-${index}`, websites: ['https://plumber.example/'],
      probe: async () => { await tick(); return site(BROKEN); },
      pricePerVerifiedCents: 50, charge: provider.charge, reservations: store(), pushItem: async () => {}, now
    })));
    assert.equal(provider.billed.length, 1, 'twelve concurrent runs, one charge');
    assert.equal(runs.filter(receipt => receipt.charged === 1).length, 1);
    assert.ok(runs.filter(receipt => receipt.charged === 0).every(receipt => /^(ALREADY_CHARGED_TODAY|CHARGE_RESERVED_ELSEWHERE:)/.test(receipt.billingOutcomes[0].reason)));
    const unknownRun = await runVerifiedDefectsSale({ buyerId: 'buyer-pg-2', runId: 'run-unknown', websites: ['https://plumber.example/'], probe: async () => site(BROKEN), pricePerVerifiedCents: 50, charge: async () => { throw new Error('timeout'); }, reservations: store(), pushItem: async () => {}, now });
    assert.equal(unknownRun.billing.unknown, 1);
    const unresolved = await store().unresolved({ olderThanMinutes: 0 });
    assert.deepEqual(unresolved.map(row => [row.run_id, row.state]), [['run-unknown', 'UNKNOWN']], 'unknown outcomes are listed for reconciliation');
  } finally {
    await Promise.all(pools.map(pool => pool.end()));
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  }
});
