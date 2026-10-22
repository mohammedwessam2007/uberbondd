import test from 'node:test';
import assert from 'node:assert/strict';
import { makeFinding, reverifyFinding, settleFindingsSale, defectSurvival } from '../src/self-verifying-findings.mjs';
import { claimKeyOf, sellableFindingsFromProbe, inquiryReprobeVerifier, runVerifiedDefectsSale } from '../src/inquiry-findings.mjs';
import { extractInquirySurface, analyzeInquiryCoherence } from '../src/inquiry-path-coherence.mjs';

const finding = (subject, claimKey = 'k') => makeFinding({ subject, code: 'X', claimKey, claim: 'c', evidence: [{ url: subject }], disproof: 'd', verifierId: 'v' });
const ledger = () => { const events = []; return { events, charge: async event => { events.push(event); return { ok: true }; } }; };

test('findings are identified by what they claim, not when they were seen', () => {
  assert.equal(finding('https://a.example/').id, finding('https://a.example/').id);
  assert.notEqual(finding('https://a.example/', 'k1').id, finding('https://a.example/', 'k2').id);
  assert.throws(() => makeFinding({ subject: 's', code: 'X', claimKey: 'k', claim: 'c', evidence: [], disproof: 'd', verifierId: 'v' }), /evidence/);
});

test('a reproduction needs fresh evidence; a crashing verifier is never evidence', async () => {
  const f = finding('https://a.example/');
  assert.equal((await reverifyFinding(f, async () => ({ outcome: 'REPRODUCED', evidence: [] }))).outcome, 'UNOBSERVABLE');
  assert.equal((await reverifyFinding(f, async () => { throw new Error('timeout'); })).outcome, 'UNOBSERVABLE');
  assert.equal((await reverifyFinding(f, async () => ({ outcome: 'MAYBE' }))).outcome, 'UNOBSERVABLE');
  const ok = await reverifyFinding(f, async () => ({ outcome: 'REPRODUCED', evidence: [{ x: 1 }] }));
  assert.equal(ok.outcome, 'REPRODUCED');
  assert.match(ok.freshEvidenceSha256, /^[a-f0-9]{64}$/);
});

test('only reproduced findings are charged, once per buyer per finding per day, within the buyer limit', async () => {
  const live = finding('https://live.example/'); const fixed = finding('https://fixed.example/'); const dark = finding('https://dark.example/');
  const outcomes = { [live.subject]: 'REPRODUCED', [fixed.subject]: 'NOT_REPRODUCED', [dark.subject]: 'UNOBSERVABLE' };
  const verifier = async f => ({ outcome: outcomes[f.subject], evidence: [{ seen: f.subject }] });
  const { events, charge } = ledger();
  const alreadyCharged = new Set();
  const now = () => new Date('2026-10-22T04:00:00Z');
  const first = await settleFindingsSale({ buyerId: 'buyer', findings: [live, fixed, dark], verifier, pricePerVerifiedCents: 50, charge, alreadyCharged, now });
  assert.equal(first.receipt.charged, 1);
  assert.equal(first.receipt.chargedCents, 50);
  assert.deepEqual(first.receipt.refusals.map(r => r.outcome).sort(), ['NOT_REPRODUCED', 'UNOBSERVABLE']);
  const again = await settleFindingsSale({ buyerId: 'buyer', findings: [live], verifier, pricePerVerifiedCents: 50, charge, alreadyCharged, now });
  assert.equal(again.receipt.charged, 0, 'same buyer, same finding, same day: delivered free');
  assert.equal(again.delivered[0].reason, 'ALREADY_CHARGED_TODAY');
  assert.equal(events.length, 1);
  const capped = await settleFindingsSale({ buyerId: 'other', findings: [live, finding('https://live2.example/')], verifier: async () => ({ outcome: 'REPRODUCED', evidence: [1] }), pricePerVerifiedCents: 50, charge, now, maxCharges: 1 });
  assert.equal(capped.receipt.charged, 1);
  assert.ok(capped.receipt.refusals.some(r => r.detail === 'BUYER_SPEND_LIMIT_REACHED'));
  const declined = await settleFindingsSale({ buyerId: 'x', findings: [live], verifier, pricePerVerifiedCents: 50, charge: async () => ({ ok: false, reason: 'LIMIT' }), now });
  assert.equal(declined.receipt.charged, 0, 'an unconfirmed charge is not a sale');
  assert.match(first.receipt.revenueTier, /NONE_UNTIL_PROVIDER_PAYOUT/);
});

test('defect survival curve is the descendant data product', () => {
  const obs = [
    { findingId: 'a', code: 'TEL', firstSeen: '2026-10-01', verifiedAt: '2026-10-01', outcome: 'REPRODUCED' },
    { findingId: 'a', code: 'TEL', firstSeen: '2026-10-01', verifiedAt: '2026-10-09', outcome: 'REPRODUCED' },
    { findingId: 'b', code: 'TEL', firstSeen: '2026-10-01', verifiedAt: '2026-10-09', outcome: 'NOT_REPRODUCED' },
    { findingId: 'c', code: 'TEL', firstSeen: '2026-10-01', verifiedAt: '2026-10-09', outcome: 'UNOBSERVABLE' }
  ];
  const curve = defectSurvival(obs);
  assert.equal(curve.TEL[0].survival, 1);
  assert.equal(curve.TEL[7].survival, 0.5, 'unobservable checks are excluded, not counted as fixed');
});

const site = html => ({ website: 'https://plumber.example/', analysis: analyzeInquiryCoherence({ pages: [extractInquirySurface({ url: 'https://plumber.example/', html, status: 200 })] }) });
const BROKEN = `<a href="tel:5123050070">(512) 305-1070</a><p>${'Bastrop office. '.repeat(20)}</p>`;
const FIXED = `<a href="tel:5123051070">(512) 305-1070</a><p>${'Bastrop office. '.repeat(20)}</p>`;
const QUESTION_ONLY = `<script src="https://cdn.callrail.com/companies/1/swap.js"></script><a href="tel:5124449999">(512) 222-6029</a><p>${'x '.repeat(200)}</p>`;

test('bridge: only assertable findings are sellable, with stable claim keys', () => {
  const sellable = sellableFindingsFromProbe(site(BROKEN));
  assert.equal(sellable.length, 1);
  assert.equal(sellable[0].claimKey, 'tel:(512) 305-1070>(512) 305-0070');
  assert.equal(sellableFindingsFromProbe(site(QUESTION_ONLY)).length, 0, 'questions are never sold');
  assert.equal(claimKeyOf({ code: 'FORM_SUBMITS_TO_NONEXISTENT_HOST', title: 'A form submits to forms.dead.example, a hostname that does not resolve' }), 'form-host:forms.dead.example');
});

test('sale run: a defect fixed between discovery and delivery is not charged', async () => {
  const { events, charge } = ledger();
  const items = [];
  const stillBroken = await runVerifiedDefectsSale({ buyerId: 'b1', websites: ['https://plumber.example/'], probe: async () => site(BROKEN), charge, pushItem: async item => items.push(item), pricePerVerifiedCents: 50 });
  assert.equal(stillBroken.charged, 1);
  assert.equal(items[0].defect, 'TEL_LABEL_DIALS_DIFFERENT_NUMBER');
  assert.match(items[0].disproveIn30Seconds, /tap/);
  const fixedInBetween = await runVerifiedDefectsSale({ buyerId: 'b2', websites: ['https://plumber.example/'], probe: async () => site(BROKEN), verifyProbe: async () => site(FIXED), charge, pushItem: async () => {}, pricePerVerifiedCents: 50 });
  assert.equal(fixedInBetween.charged, 0);
  assert.equal(fixedInBetween.refusals[0].outcome, 'NOT_REPRODUCED');
  assert.equal(events.length, 1);
  const verifier = inquiryReprobeVerifier({ probe: async () => ({ website: 'x', analysis: { verdict: 'NOT_OBSERVABLE_FROM_STATIC_HTML', findings: [] } }) });
  assert.equal((await verifier(sellableFindingsFromProbe(site(BROKEN))[0])).outcome, 'UNOBSERVABLE');
});

test('review regressions: deliver before charge, persisted keys survive a restart, URL variants are one site, a limit stops charging', async () => {
  const order = [];
  const persisted = [];
  const charge = async ({ idempotencyKey }) => { order.push(`charge:${idempotencyKey.slice(0, 6)}`); return { ok: true }; };
  const pushItem = async item => order.push(`push:${(item.chargeEvent ?? 'free').slice(0, 6)}`);
  const run = alreadyCharged => runVerifiedDefectsSale({ buyerId: 'b', websites: ['https://plumber.example/', 'http://www.plumber.example', 'https://www.plumber.example/'], probe: async () => site(BROKEN), charge, pushItem, onCharged: key => persisted.push(key), alreadyCharged, pricePerVerifiedCents: 50, now: () => new Date('2026-10-22T05:00:00Z') });
  const first = await run(new Set());
  assert.equal(first.websites, 1, 'http/https/www variants are one site');
  assert.equal(first.charged, 1);
  assert.ok(order[0].startsWith('push:') && order[1].startsWith('charge:'), `delivered before charged: ${order}`);
  const restarted = await run(new Set(persisted));
  assert.equal(restarted.charged, 0, 'a restart with persisted keys never charges again');
  let calls = 0;
  const limited = await settleFindingsSale({ buyerId: 'L', findings: [finding('https://l1.example/'), finding('https://l2.example/')], verifier: async () => ({ outcome: 'REPRODUCED', evidence: [1] }), pricePerVerifiedCents: 50, charge: async () => { calls += 1; return { ok: true, limitReached: true }; }, now: () => new Date('2026-10-22T05:00:00Z') });
  assert.equal(calls, 1, 'the charge that exhausts the limit is kept; no further charge is attempted');
  assert.equal(limited.receipt.charged, 1);
  const unbilled = await settleFindingsSale({ buyerId: 'U', findings: [finding('https://u.example/')], verifier: async () => ({ outcome: 'REPRODUCED', evidence: [1] }), pricePerVerifiedCents: 50, charge: async () => ({ ok: false, reason: 'NOT_BILLED' }), deliver: async () => {}, now: () => new Date('2026-10-22T05:00:00Z') });
  assert.equal(unbilled.receipt.chargedCents, 0);
  assert.equal(unbilled.receipt.deliveredUncharged[0].detail, 'CHARGE_NOT_CONFIRMED:NOT_BILLED');
});
