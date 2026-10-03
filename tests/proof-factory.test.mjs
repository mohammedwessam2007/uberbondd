import test from 'node:test';
import assert from 'node:assert/strict';
import { compileProofLineage, reviewMessageAdversarially } from '../src/proof-factory.mjs';
import { compileUberReplyMessagePolicy, UBERREPLY_OFFER_PORTFOLIO } from '../src/uberreply-four-offer-genome.mjs';

const NOW = Date.parse('2026-10-04T00:00:00Z');
const offerId = UBERREPLY_OFFER_PORTFOLIO[0].offerId;
const issue = { code: 'form-no-confirmation', title: 'Contact form shows no confirmation after submit', evidenceUrl: 'https://example.test/contact', evidenceExcerpt: 'Submitting the form leaves the page unchanged', confidence: 0.8 };
const lineage = (observedAt = '2026-10-03T00:00:00Z') => compileProofLineage({ offerId, prospect: { id: 'p1', company: 'Acme Plumbing Agency' }, issue, observedAt, now: NOW });
const good = { subject: 'Contact form confirmation', body: 'Hi Sam, on the contact page the form shows no confirmation after submit, so a visitor cannot tell whether it sent. I put the page evidence and a short repair order in a one-page map. Want me to send it?', buyer: { role: 'agency owner' } };

test('lineage is content-addressed, claim-level, and zero-authority', () => {
  const l = lineage();
  assert.equal(l.ok, true); assert.match(l.proofDigest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(l.claims.length, 1); assert.match(l.claims[0].claimId, /^cl_/);
  assert.equal(l.outboundAuthority, 'NONE'); assert.equal(l.externalEffectLedger.messages, 0);
  assert.equal(lineage().proofDigest, l.proofDigest);
});

test('no evidence => no proof; future-dated or stale proof is not fresh', () => {
  assert.equal(compileProofLineage({ offerId, prospect: { id: 'p' }, issue: { title: 'x' } }).ok, false);
  assert.equal(lineage('2026-11-01T00:00:00Z').state, 'PROOF_FUTURE_DATED');
  assert.equal(lineage('2026-01-01T00:00:00Z').freshness, 'STALE');
  assert.equal(lineage(null).freshness, 'UNDATED');
});

const review = (over = {}, l = lineage()) => reviewMessageAdversarially({ policy: compileUberReplyMessagePolicy({ offerId }), lineage: l, claimsUsed: [l.claims?.[0]?.claimId], evidenceRefs: l.evidenceRefs, artifactPrepared: true, ...good, ...over });

test('a clean evidence-bound message passes only when proof is fresh and referenced', () => {
  const r = review();
  assert.ok(!r.findings.some(f => f.critic === 'proof'), JSON.stringify(r.findings));
});

test('unsupported numeric, loss and causal claims are refused', () => {
  for (const body of ['Your form is losing you $4,000 a month and nobody told you.', 'Because of this you are costing you 30% of leads.', 'We found 12 customers lost this week.']) {
    const r = review({ body });
    assert.equal(r.verdict, 'REFUSE', body);
    assert.ok(r.findings.some(f => f.critic === 'proof'));
  }
});

test('stale, undated, missing or mismatched proof refuses', () => {
  assert.ok(review({}, lineage('2026-01-01T00:00:00Z')).findings.some(f => f.code === 'proof-stale'));
  assert.ok(review({}, lineage(null)).findings.some(f => f.code === 'proof-undated'));
  assert.ok(review({ lineage: null, claimsUsed: [] }).findings.some(f => f.code === 'no-proof-lineage'));
  assert.ok(review({ claimsUsed: ['cl_forged'] }).findings.some(f => f.code === 'unknown-claim-reference'));
  assert.ok(review({ claimsUsed: [] }).findings.some(f => f.code === 'no-claim-referenced'));
});

test('creep, false urgency and deceptive thread prefixes are refused; slop is flagged', () => {
  assert.equal(review({ body: good.body + ' I saw you on vacation last week.' }).verdict, 'REFUSE');
  assert.equal(review({ body: good.body + ' Act now, only 3 spots left.' }).verdict, 'REFUSE');
  assert.equal(review({ subject: 'Re: contact form' }).verdict, 'REFUSE');
  assert.ok(review({ body: good.body + ' Let us leverage seamless synergy.' }).findings.some(f => f.critic === 'anti-slop'));
});

test('critics are narrow-only and carry no authority', () => {
  const r = review();
  assert.equal(r.narrowOnly, true); assert.equal(r.outboundAuthority, 'NONE'); assert.equal(r.externalEffectLedger.messages, 0);
});
