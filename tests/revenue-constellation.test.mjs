import test from 'node:test';
import assert from 'node:assert/strict';
import { buildConstellation, xray, collectEvents, stageAt } from '../src/revenue-constellation.mjs';

const NOW = Date.parse('2026-10-04T12:00:00Z');
const iso = h => new Date(NOW - h * 3600000).toISOString();
const P = (id, o = {}) => ({ id, company: `Co ${id}`, offerId: 'agency-leak', createdAt: iso(100), ...o });
const base = () => ({
  now: NOW,
  prospects: [P('p1'), P('p2'), P('p3'), P('p4')],
  senderHealth: [{ inbox: 'a@x.test', paused: false }, { inbox: 'b@x.test', paused: true, complaintsToday: 0 }],
  outboundEvents: [
    { id: 'e1', eventType: 'sent', inbox: 'a@x.test', prospectId: 'p1', occurredAt: iso(48) },
    { id: 'e2', eventType: 'sent', inbox: 'a@x.test', prospectId: 'p2', occurredAt: iso(24) },
    { id: 'e3', eventType: 'complaint', inbox: 'a@x.test', prospectId: 'p2', occurredAt: iso(20) }
  ],
  replies: [{ id: 'r1', prospectId: 'p1', createdAt: iso(10) }],
  leads: [
    { id: 'l1', prospectId: 'p1', paymentStatus: 'paid', providerTransactionId: 'tx1', amountCents: 150000, updatedAt: iso(2) },
    { id: 'l2', prospectId: 'p3', paymentStatus: 'paid', updatedAt: iso(2) } // claimed, no provider evidence
  ],
  orders: [{ leadId: 'l1', prospectId: 'p1', provider: 'paypal', eventName: 'capture_completed', providerEventId: 'tx1', amountCents: 150000, currency: 'USD', createdAt: iso(2) }],
  revenueEvents: [{ leadId: 'l1', prospectId: 'p1', provider: 'paypal', providerEventId: 'capture_completed:tx1', amountCents: 150000, currency: 'USD', createdAt: iso(2) }],
  auditLog: [{ type: 'payment_classification', leadId: 'l1', prospectId: 'p1', provider: 'paypal', eventName: 'capture_completed', eventId: 'tx1', classification: 'CLEARED_ONE_TIME_PAYMENT', amountCents: 150000, currency: 'USD', createdAt: iso(2) }],
  infra: [{ id: 'web', status: 'OK', observedAt: iso(1) }, { id: 'worker' }]
});

test('every node derives from a record; no decorative nodes', () => {
  const c = buildConstellation(base());
  const ids = new Set(c.nodes.map(n => n.id));
  assert.ok(ids.has('core:gspot') && ids.has('offer:agency-leak') && ids.has('sender:a@x.test') && ids.has('prospect:p1') && ids.has('infra:web'));
  const known = new Set(['core', 'offer', 'sender', 'infra', 'prospect', 'cluster']);
  assert.ok(c.nodes.every(n => known.has(n.type) && n.truth));
  assert.ok(c.edges.every(e => ids.has(e.from) && ids.has(e.to)));
});

test('payment without provider evidence is not cleared; only evidence-backed counts', () => {
  const c = buildConstellation(base());
  assert.equal(c.economics.clearedPayments, 1);
  assert.equal(c.economics.clearedAmountCents, 150000);
  assert.equal(c.nodes.find(n => n.id === 'prospect:p3').stage, 'DISCOVERED');
  assert.equal(c.nodes.find(n => n.id === 'prospect:p1').stage, 'PAID');
});

test('unobserved infrastructure is UNKNOWN with full uncertainty, never green', () => {
  const w = buildConstellation(base()).nodes.find(n => n.id === 'infra:worker');
  assert.equal(w.truth, 'UNKNOWN'); assert.equal(w.uncertainty, 1); assert.equal(w.health, 'UNKNOWN');
});

test('complaint/unsubscribe and human-reply halts move a prospect to HALTED', () => {
  const c = buildConstellation({ ...base(), radar: { haltedProspects: ['p4'] } });
  assert.equal(c.nodes.find(n => n.id === 'prospect:p2').stage, 'HALTED');
  assert.equal(c.nodes.find(n => n.id === 'prospect:p4').stage, 'HALTED');
});

test('temporal replay shows the organism as it was and never leaks the future', () => {
  const past = buildConstellation({ ...base(), at: iso(30) });
  assert.equal(past.replay, true);
  assert.equal(past.nodes.find(n => n.id === 'prospect:p1').stage, 'SENT');
  assert.equal(past.nodes.find(n => n.id === 'prospect:p2').stage, 'DISCOVERED');
  assert.equal(past.economics.clearedPayments, 0);
  assert.ok(past.events.every(e => Date.parse(e.at) <= Date.parse(iso(30))));
  assert.ok(!past.edges.some(e => e.kind === 'cleared-payment'));
});

test('causal trails come from real events only', () => {
  const c = buildConstellation(base());
  const causal = c.edges.filter(e => e.causal);
  assert.ok(causal.some(e => e.kind === 'sent' && e.to === 'prospect:p1'));
  assert.ok(causal.some(e => e.kind === 'reply'));
  assert.ok(causal.some(e => e.kind === 'cleared-payment'));
  assert.equal(causal.filter(e => e.kind === 'sent').length, 2);
});

test('large scale collapses into stage x offer clusters, is bounded, and expands on demand', () => {
  const many = Array.from({ length: 5000 }, (_, i) => P(`m${i}`));
  const c = buildConstellation({ now: NOW, prospects: many, maxNodes: 300 });
  assert.equal(c.clustered, true);
  assert.ok(c.nodes.length < 20);
  const cl = c.nodes.find(n => n.type === 'cluster');
  assert.equal(cl.count, 5000);
  const ex = buildConstellation({ now: NOW, prospects: many, maxNodes: 300, expand: cl.id });
  assert.ok(ex.nodes.filter(n => n.type === 'prospect').length === 300);
  const t0 = Date.now(); buildConstellation({ now: NOW, prospects: Array.from({ length: 50000 }, (_, i) => P(`z${i}`)), maxNodes: 300 });
  assert.ok(Date.now() - t0 < 2000, 'graph build must stay fast at 50k prospects');
});

test('xray lists unknowns explicitly and carries no authority', () => {
  const x = xray({ ...base(), prospectId: 'p4' });
  assert.equal(x.ok, true);
  assert.ok(x.unknowns.includes('no-outbound-events'));
  assert.equal(x.outboundAuthority, 'NONE');
  assert.equal(xray({ ...base(), prospectId: 'nope' }).ok, false);
  const x1 = xray({ ...base(), prospectId: 'p1' });
  assert.equal(x1.stage, 'PAID'); assert.equal(x1.timeline.length, 3);
});

 test('current ranked offer supplies real spatial grouping and historical replay cannot borrow it',()=>{
 const s=base();s.prospects[0].offerId=undefined;s.moneyQueue={items:[{prospectId:'p1',offerId:'LEAD_TO_BOOKING_LEAK_AUDIT',rank:1,explanation:{qualification:{evidenceQuality:.8}}}]};const live=buildConstellation(s);assert.equal(live.nodes.find(n=>n.id==='prospect:p1').offerId,'LEAD_TO_BOOKING_LEAK_AUDIT');assert.ok(live.nodes.some(n=>n.id==='offer:LEAD_TO_BOOKING_LEAK_AUDIT'));const edge=live.edges.find(e=>e.to==='prospect:p1'&&e.kind==='targets');assert.equal(edge.from,'offer:LEAD_TO_BOOKING_LEAK_AUDIT');assert.ok(edge.weight>0);const past=buildConstellation({...s,at:iso(30)});assert.equal(past.nodes.find(n=>n.id==='prospect:p1').offerId,null);assert.equal(past.nodes.some(n=>n.id==='offer:LEAD_TO_BOOKING_LEAK_AUDIT'),false);
 });
