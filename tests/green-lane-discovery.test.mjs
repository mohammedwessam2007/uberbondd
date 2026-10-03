import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateGreenLaneCandidate, rankGreenLane, GREEN_LANE_ONLY } from '../src/green-lane-discovery.mjs';
import { compilePreflightHandoff } from '../src/prospect-preflight-handoff.mjs';
import { searchLocalLeadCorpus, normalizeLeadQuery } from '../src/lead-generation.mjs';
import { freshPolicyRegistry, iso } from './fixtures/outreach/global-green-lane.fixture.mjs';

const now = new Date('2026-10-03T12:00:00.000Z');
const registry = freshPolicyRegistry(now);
const offer = { offerId: 'LEAD_TO_BOOKING_LEAK_AUDIT', standardPriceUsd: 1500 };

function prospect(id, { country = 'US', green = true, fit = {}, ...rest } = {}) {
  const host = `${id}.example`;
  return {
    id, company: `Co ${id}`, website: `https://${host}/`, domain: host, country, status: 'research-complete',
    tags: ['AGENCY', 'MARKETING', 'HVAC'], services: ['lead gen'], fitEvidenceConfidence: 0.8,
    niche: 'marketing agency hvac', source: 'public_website', sourceUrl: `https://${host}/contact/`, completedAt: iso(now, -3600_000),
    score: { total: 80 }, issue: { title: 'form fails', evidenceUrl: `https://${host}/`, evidenceExcerpt: 'The contact form does not submit.' },
    contact: { email: `hello@${host}` },
    greenLaneEvidence: green ? {
      recipientType: 'CORPORATE',
      contactSource: { url: `https://${host}/contact/`, observedAt: iso(now, -3600_000), pageContext: 'CONTACT_PAGE', publicationType: 'OWN_SITE_PAGE', collectionMethod: 'MANUAL', excerpt: `General business enquiries: hello@${host}` },
      namedPersonEvidence: { present: false },
      notices: { noSolicitationChecked: true, noSolicitationFound: false, noHarvestChecked: true, noHarvestFound: false },
      offerRelevance: { relatedToRecipientRole: true, rationale: 'Agency publishing a general business inbox; offer is a lead-path evidence artifact for its clients.' }
    } : undefined,
    ...rest
  };
}
const fit = { semanticFit: 0.8, evidenceConfidence: 0.8 };
const evalOne = (p, o = {}) => evaluateGreenLaneCandidate({ prospect: p, offer, fit, policyRegistry: registry, now, ...o });

test('a corpus prospect with full evidence is green; one without evidence reports exact blockers and a zero route factor, never fabricated green', () => {
  const g = evalOne(prospect('good'));
  assert.equal(g.summary.green, true, JSON.stringify(g.summary.exactBlockers));
  assert.equal(g.summary.routeClass, 'US_CANSPAM_GREEN');
  assert.ok(g.summary.prospectValue.value > 0);
  const bad = evalOne(prospect('bare', { green: false }));
  assert.equal(bad.summary.green, false);
  assert.equal(bad.summary.prospectValue.value, 0);
  assert.ok(bad.summary.exactBlockers.length > 0);
  assert.ok(g.summary.routeEvidence.routeDigest && g.summary.contactSourceEvidence.bindingDigest);
});

test('stale policy evidence demotes a prospect to POLICY_REFRESH_REQUIRED, offline, with no registry lookup or fetch', () => {
  const g = evalOne(prospect('good'), { policyRegistry: null });
  assert.equal(g.summary.green, false);
  assert.ok(g.summary.routeEvidence.policyRefreshRequired.length > 0);
});

test('UK candidates stay non-green offline: legal-form evidence is missing until the preflight resolves the registry', () => {
  const uk = evalOne(prospect('ukco', { country: 'GB' }));
  assert.equal(uk.summary.green, false);
  assert.notEqual(uk.summary.companyLegalFormEvidence.status, 'VERIFIED_CORPORATE');
});

test('a clean-route prospect outranks a nominally superior prospect with an unresolved route', () => {
  const superior = evaluateGreenLaneCandidate({ prospect: prospect('superior', { green: false }), offer: { ...offer, standardPriceUsd: 4500 }, fit: { semanticFit: 1, evidenceConfidence: 1 }, policyRegistry: registry, now });
  const clean = evaluateGreenLaneCandidate({ prospect: prospect('clean'), offer, fit: { semanticFit: 0.6, evidenceConfidence: 0.6 }, policyRegistry: registry, now });
  const r = rankGreenLane([superior, clean], { mode: 'DEFAULT', limit: 5 });
  assert.equal(r.ranked[0].prospectId, 'clean');
});

test('GREEN_LANE_ONLY lists only green rows and reports insufficient supply instead of filling it', () => {
  const rows = [evalOne(prospect('good')), evalOne(prospect('bare', { green: false }))];
  const only = rankGreenLane(rows, { mode: GREEN_LANE_ONLY });
  assert.deepEqual(only.ranked.map(r => r.prospectId), ['good']);
  assert.equal(only.notGreen.length, 1);
  assert.equal(only.fabricatedGreenProspects, 0);
  const none = rankGreenLane([evalOne(prospect('bare', { green: false }))], { mode: GREEN_LANE_ONLY });
  assert.equal(none.supplyStatus, 'INSUFFICIENT_GREEN_SUPPLY');
  assert.deepEqual(none.ranked, []);
  assert.equal(none.sendAuthority, false);
});

test('handoff GREEN_LANE_ONLY: per-offer green lists only, no fabricated supply, authority-free', () => {
  const corpus = [prospect('good'), prospect('bare', { green: false })];
  const h = compilePreflightHandoff({ prospects: corpus, mode: 'GREEN_LANE_ONLY', policyRegistry: registry, now });
  assert.equal(h.mode, GREEN_LANE_ONLY);
  assert.equal(h.offers, undefined);
  const lane = h.greenLane.LEAD_TO_BOOKING_LEAK_AUDIT;
  assert.deepEqual(lane.ranked.map(r => r.prospectId), ['good']);
  assert.equal(h.sendAuthority, false);
  assert.equal(h.providerCalls, 0);
  const empty = compilePreflightHandoff({ prospects: [prospect('bare', { green: false })], mode: 'GREEN_LANE_ONLY', policyRegistry: registry, now });
  assert.equal(empty.greenLane.LEAD_TO_BOOKING_LEAK_AUDIT.supplyStatus, 'INSUFFICIENT_GREEN_SUPPLY');
  const dflt = compilePreflightHandoff({ prospects: corpus, now });
  assert.equal(dflt.mode, 'DEFAULT');
  assert.ok(dflt.offers);
});

test('lead generation green mode: normalizeLeadQuery flag, exclusion counts and route-aware ordering', () => {
  assert.equal(normalizeLeadQuery({ mode: 'GREEN_LANE_ONLY' }).greenLaneOnly, true);
  assert.equal(normalizeLeadQuery({}).greenLaneOnly, false);
  const prospects = [prospect('good'), prospect('bare', { green: false })];
  const query = { prompt: 'marketing agency hvac', mode: 'GREEN_LANE_ONLY', requireContact: false, minScore: 0 };
  const res = searchLocalLeadCorpus({ prospects, query, greenLane: { offer, policyRegistry: registry }, now });
  const ids = (res.candidates || res.results || []).map(c => c.prospectId || c.id || c.prospect?.id);
  assert.ok(ids.some(i => String(i).includes('good')), JSON.stringify(Object.keys(res)));
  assert.ok(!ids.some(i => String(i).includes('bare')));
  assert.equal((res.excluded || {}).not_green, 1);
});
