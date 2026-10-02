import test from 'node:test';
import assert from 'node:assert/strict';
import { compilePreflightHandoff, buildPreflightHandoff } from '../src/prospect-preflight-handoff.mjs';

const NOW = new Date('2026-10-02T12:00:00Z');
const p = (id, patch = {}) => ({ id, company: `Co ${id}`, website: `https://${id}.example/`, status: 'research-complete', tags: [], services: [], fitEvidenceConfidence: 0.8, contact: { email: `hello@${id}.example` }, ...patch });
const corpus = [
  p('hvacagency', { tags: ['AGENCY', 'MARKETING', 'HVAC'], services: ['lead gen'] }),
  p('aiagents', { tags: ['AI', 'AGENT', 'SAAS', 'IMPLEMENTATION'] }),
  p('roiagency', { tags: ['AGENCY', 'PERFORMANCE', 'ATTRIBUTION'] }),
  p('gccclinic', { tags: ['UAE', 'CLINIC', 'ARABIC'] }),
  p('sent', { tags: ['AGENCY', 'HVAC'], status: 'sent' }),
  p('replied', { tags: ['AGENCY', 'HVAC'], status: 'replied' }),
  p('supp', { tags: ['AGENCY', 'HVAC'] }),
  p('nosite', { website: '', tags: ['AGENCY', 'HVAC'] }),
  p('noemail', { tags: ['AGENCY', 'HVAC', 'MARKETING'], contact: {} })
];
const handoff = (extra = {}) => compilePreflightHandoff({ prospects: corpus, suppressions: [{ value: 'supp.example' }], now: NOW, ...extra });

test('ranks per offer by fit over the four canonical offers, and each fit comes from the existing scorer', () => {
  const h = handoff();
  assert.deepEqual(Object.keys(h.offers).sort(), ['AI_AGENT_RELEASE_GATE', 'BILINGUAL_BOOKING_LEAK_AUDIT', 'CLIENT_ROI_PROOF_SPRINT', 'LEAD_TO_BOOKING_LEAK_AUDIT']);
  assert.equal(h.offers.AI_AGENT_RELEASE_GATE.candidates[0].prospectId, 'aiagents');
  assert.equal(h.offers.BILINGUAL_BOOKING_LEAK_AUDIT.candidates[0].prospectId, 'gccclinic');
  assert.equal(h.offers.LEAD_TO_BOOKING_LEAK_AUDIT.candidates[0].company.startsWith('Co '), true);
  for (const offer of Object.values(h.offers)) for (let i = 1; i < offer.candidates.length; i += 1) assert.ok(offer.candidates[i - 1].fitScore >= offer.candidates[i].fitScore);
});

test('contacted, replied, suppressed and website-less prospects are excluded with a reason; availability of an email never ranks a candidate', () => {
  const h = handoff();
  const reasons = Object.fromEntries(h.excluded.map(e => [e.id, e.reason]));
  assert.equal(reasons.sent, 'prior-contact-status:sent');
  assert.equal(reasons.replied, 'prior-contact-status:replied');
  assert.equal(reasons.supp, 'suppressed');
  assert.equal(reasons.nosite, 'no-website');
  const all = Object.values(h.offers).flatMap(o => o.candidates.map(c => c.prospectId));
  for (const excluded of ['sent', 'replied', 'supp', 'nosite']) assert.ok(!all.includes(excluded), excluded);
  const hv = h.offers.LEAD_TO_BOOKING_LEAK_AUDIT.candidates.find(c => c.prospectId === 'noemail');
  assert.ok(hv, 'a high-fit prospect with no known email is still listed (it needs evidence, not a guessed address)');
  assert.ok(hv.evidenceRequests.includes('recipient-email-missing'));
});

test('every candidate carries the exact intake gaps and is never preflightReady from the corpus alone', () => {
  const h = handoff();
  for (const offer of Object.values(h.offers)) for (const c of offer.candidates) {
    assert.equal(c.preflightReady, false);
    assert.notEqual(c.intakeStatus, 'VERIFIED_CANDIDATE');
    assert.ok(c.evidenceRequests.length > 0);
    assert.ok(c.evidenceRequests.includes('runtime-suppression-and-prior-contact-ledgers-not-checked') || c.intakeStatus === 'REJECTED' || c.evidenceRequests.length > 0);
  }
});

test('deterministic, bounded by perOffer, read-only and authority-free', () => {
  const a = handoff({ perOffer: 1 });
  const b = handoff({ perOffer: 1 });
  assert.deepEqual(a, b);
  for (const offer of Object.values(a.offers)) assert.ok(offer.candidates.length <= 1);
  assert.equal(a.sendAuthority, false);
  assert.equal(a.providerCalls, 0);
  assert.equal(compilePreflightHandoff({ prospects: corpus, perOffer: 999, now: NOW }).offers.LEAD_TO_BOOKING_LEAK_AUDIT.candidates.length <= 10, true);
  assert.equal(compilePreflightHandoff({ now: NOW }).poolSize, 0);
});

test('the store-backed builder only lists and is the production path to the same ranking', async () => {
  const calls = [];
  const store = { async list(name) { calls.push(name); return name === 'prospects' ? structuredClone(corpus) : [{ value: 'supp.example' }]; }, add() { throw new Error('write'); } };
  const viaStore = await buildPreflightHandoff({ store, now: NOW });
  assert.deepEqual(viaStore, handoff());
  assert.deepEqual([...new Set(calls)].sort(), ['prospects', 'suppressions']);
  await assert.rejects(() => buildPreflightHandoff({ store: null }), /store-required/);
});
