import test from 'node:test';
import assert from 'node:assert/strict';
import { compileProspectVerification, PROSPECT_STATUSES } from '../src/prospect-verification-intake.mjs';

const now = new Date('2026-10-05T12:00:00.000Z');
const full = (patch = {}) => ({
  company: 'Example Home Marketing', website: 'https://agency.example/', hqCountry: 'US',
  currentOwnership: { status: 'INDEPENDENT', evidenceUrl: 'https://agency.example/about' },
  evidenceClass: 'PAGE_FETCH_VERIFIED',
  contactHistory: { repoAndHistorySearched: true, runtimeSuppressionSearched: true, runtimeProspectAndOutboundSearched: true, hit: false },
  offerRoute: { offerId: 'AGENCY_REVENUE_LEAK_PROOF_PACK', rationale: 'Agency serves home-service clients and needs client lead-path evidence.' },
  recipient: {
    email: 'hello@agency.example', publishedRole: 'GENERAL_BUSINESS_INQUIRIES', sourceUrl: 'https://agency.example/contact', sourcePageExact: true,
    excerpt: 'General inquiries: hello@agency.example', observedAt: '2026-10-04T12:00:00.000Z'
  },
  notices: { noSolicitationChecked: true, noSolicitationFound: false, noHarvestChecked: true, noHarvestFound: false },
  offerFit: { servesHomeServiceClients: true, evidenceUrl: 'https://agency.example/hvac-marketing' },
  clientEvidence: {
    clientName: 'Example HVAC', clientSiteUrl: 'https://example-hvac.example/',
    observation: { verifiable: true, text: 'Contact form returns a blank page after submit', sourceUrl: 'https://example-hvac.example/contact', excerpt: 'blank page after submit', observedAt: '2026-10-04T13:00:00.000Z' }
  },
  ...patch
});
const deep = (patch, path) => { const r = full(); let o = r; const keys = path.split('.'); for (const k of keys.slice(0, -1)) o = o[k]; o[keys.at(-1)] = patch; return r; };
const run = (record, excludedRecipients = []) => compileProspectVerification(record, { now, excludedRecipients });
const has = (result, list, fragment) => assert.ok(result[list].some(r => r.includes(fragment)), `${fragment} not in ${JSON.stringify(result[list])}`);

test('a fully observed independent US agency is a VERIFIED_CANDIDATE but still carries no authority', () => {
  const r = run(full());
  assert.equal(r.status, PROSPECT_STATUSES.VERIFIED_CANDIDATE, JSON.stringify(r));
  assert.equal(r.legalAuthorityStatus, 'HOLD_SENDER_SIDE_UNRESOLVED');
  assert.equal(r.senderSideEvaluated, false);
  assert.equal(r.sendAuthority, false);
  assert.equal(r.recipientSideEligibility.decision, 'ALLOW_WITH_REQUIREMENTS');
});

test('privacy-only, legal, careers and support addresses are rejected as sales recipients', () => {
  for (const role of ['PRIVACY_ONLY', 'LEGAL_ONLY', 'CAREERS_ONLY', 'CUSTOMER_SUPPORT_ONLY', 'ABUSE_OR_SECURITY']) {
    const r = run(deep(role, 'recipient.publishedRole'));
    assert.equal(r.status, PROSPECT_STATUSES.REJECTED);
    has(r, 'rejectionReasons', 'not-sales');
  }
  assert.equal(run(deep('UNKNOWN', 'recipient.publishedRole')).status, PROSPECT_STATUSES.INCOMPLETE);
});

test('part of a larger group is assessed, not blanket-rejected: HIGH parent overlap rejects, LOW overlap with evidence proceeds, anything else is incomplete', () => {
  const group = patch => deep({ status: 'PART_OF_LARGER_GROUP', parentAssessment: { parent: 'BigCo', operatesUnderOwnBrand: true, parentOverlapWithOffer: 'LOW', rationale: 'Parent sells media buying only; no lead attribution product.', evidenceRef: 'https://agency.example/about', ...patch } }, 'currentOwnership');
  assert.equal(run(group({})).status, PROSPECT_STATUSES.VERIFIED_CANDIDATE);
  has(run(group({ parentOverlapWithOffer: 'HIGH' })), 'rejectionReasons', 'parent-overlap-makes-offer-redundant');
  has(run(group({ operatesUnderOwnBrand: false })), 'rejectionReasons', 'no-longer-operates');
  has(run(group({ parentOverlapWithOffer: 'UNKNOWN' })), 'missingEvidence', 'unassessed');
  has(run(group({ evidenceRef: '' })), 'missingEvidence', 'rationale-and-evidence');
  has(run(deep({ status: 'PART_OF_LARGER_GROUP' }, 'currentOwnership')), 'missingEvidence', 'parent-company-assessment-missing');
  has(run(deep('UNKNOWN', 'currentOwnership.status')), 'missingEvidence', 'ownership');
  has(run(deep('GB', 'hqCountry')), 'missingEvidence', 'us-headquarters');
});

test('a published anti-unsolicited or consent-required stance is a negative recipient signal that rejects', () => {
  for (const kind of ['PUBLISHED_ANTI_UNSOLICITED_STANCE', 'CONSENT_REQUIRED_STANCE', 'NO_VENDOR_SOLICITATION']) {
    const r = run(full({ negativeRecipientSignals: [{ kind, summary: 'x' }] }));
    assert.equal(r.status, PROSPECT_STATUSES.REJECTED);
    has(r, 'rejectionReasons', `negative-recipient-signal:${kind.toLowerCase()}`);
  }
  has(run(full({ negativeRecipientSignals: [{ kind: 'WHATEVER' }] })), 'rejectionReasons', 'unrecognized');
});

test('an exact source page is required and the runtime suppression/prior-contact ledgers must be checked, not assumed', () => {
  has(run(deep(false, 'recipient.sourcePageExact')), 'missingEvidence', 'exact-source-page');
  has(run(deep(undefined, 'recipient.sourcePageExact')), 'missingEvidence', 'exact-source-page');
  has(run(deep({ repoAndHistorySearched: true, runtimeSuppressionSearched: false, runtimeProspectAndOutboundSearched: true, hit: false }, 'contactHistory')), 'missingEvidence', 'runtime-suppression-and-prior-contact');
  has(run(deep({ repoAndHistorySearched: true, runtimeSuppressionSearched: true, runtimeProspectAndOutboundSearched: false, hit: false }, 'contactHistory')), 'missingEvidence', 'runtime-suppression-and-prior-contact');
  has(run(deep(undefined, 'contactHistory')), 'missingEvidence', 'runtime-suppression-and-prior-contact');
  has(run(deep({ repoAndHistorySearched: true, runtimeSuppressionSearched: true, runtimeProspectAndOutboundSearched: true, hit: true }, 'contactHistory')), 'rejectionReasons', 'runtime-ledger-hit');
  assert.equal(run(deep('GENERAL_BUSINESS_AND_PARTNERSHIP_CONTACT', 'recipient.publishedRole')).status, PROSPECT_STATUSES.VERIFIED_CANDIDATE);
});

test('a search-engine summary or unclassified evidence can never verify a candidate', () => {
  has(run(deep('SEARCH_SUMMARY_ONLY', 'evidenceClass')), 'missingEvidence', 'search-summary-only');
  has(run(deep('', 'evidenceClass')), 'missingEvidence', 'evidence-class-unverified');
  assert.equal(run(deep('EXTERNAL_LANE_REPORT_WITH_EXCERPT', 'evidenceClass')).status, PROSPECT_STATUSES.VERIFIED_CANDIDATE);
});

test('the offer must come from the existing quartet with a stated reason', () => {
  has(run(deep('A_BRAND_NEW_PRODUCT', 'offerRoute.offerId')), 'missingEvidence', 'offer-route');
  has(run(deep('short', 'offerRoute.rationale')), 'missingEvidence', 'offer-route');
  assert.equal(run(deep('REVENUE_PROOF_AND_RENEWAL_PACK', 'offerRoute.offerId')).offerId, 'CLIENT_ROI_PROOF_SPRINT');
  // One offer-id namespace: canonical ids, public names, former public names and legacy intake labels all normalise to the canonical production-genome id.
  for (const [alias, canonical] of [['CLIENT_ROI_PROOF_SPRINT', 'CLIENT_ROI_PROOF_SPRINT'], ['Revenue Proof & Renewal Pack', 'CLIENT_ROI_PROOF_SPRINT'], ['Client ROI Proof Sprint', 'CLIENT_ROI_PROOF_SPRINT'], ['AGENCY_REVENUE_LEAK_PROOF_PACK', 'LEAD_TO_BOOKING_LEAK_AUDIT'], ['GCC Arabic-English Booking Parity & Revenue Leak Sprint', 'BILINGUAL_BOOKING_LEAK_AUDIT'], ['AI Agent Production Release Gate', 'AI_AGENT_RELEASE_GATE']]) {
    assert.equal(run(deep(alias, 'offerRoute.offerId')).offerId, canonical, alias);
  }
});

test('the address must literally appear in the retained excerpt and be published on the agency\'s own site', () => {
  has(run(deep('General inquiries: hi@agency.example', 'recipient.excerpt')), 'rejectionReasons', 'excerpt-does-not-contain');
  has(run(deep('https://directory.example/agency', 'recipient.sourceUrl')), 'rejectionReasons', 'own-site');
  has(run(deep('', 'recipient.excerpt')), 'missingEvidence', 'excerpt-missing');
  has(run(deep('http://agency.example/contact', 'recipient.sourceUrl')), 'missingEvidence', 'source-https');
  has(run(deep('2026-12-01T00:00:00.000Z', 'recipient.observedAt')), 'rejectionReasons', 'in-future');
});

test('personal mailboxes, system addresses and invalid addresses are rejected', () => {
  for (const email of ['boss@gmail.com', 'noreply@agency.example', 'not-an-email']) {
    const r = run(full({ recipient: { ...full().recipient, email, excerpt: `contact ${email}` } }));
    assert.equal(r.status, PROSPECT_STATUSES.REJECTED, email);
  }
});

test('notices: unchecked is incomplete, present is rejected', () => {
  has(run(deep(false, 'notices.noSolicitationChecked')), 'missingEvidence', 'no-solicitation');
  has(run(deep(false, 'notices.noHarvestChecked')), 'missingEvidence', 'no-harvest');
  has(run(deep(true, 'notices.noSolicitationFound')), 'rejectionReasons', 'no-solicitation-notice-present');
  has(run(deep(true, 'notices.noHarvestFound')), 'rejectionReasons', 'no-harvest-notice-present');
});

test('prior contact or suppression dominates, case-insensitively', () => {
  has(run(full(), ['HELLO@Agency.example']), 'rejectionReasons', 'prior-contact-or-suppression');
});

test('without a real client site and an externally verifiable observation the candidate stays INCOMPLETE; no observation is invented', () => {
  const none = run(full({ clientEvidence: null }));
  assert.equal(none.status, PROSPECT_STATUSES.INCOMPLETE);
  has(none, 'missingEvidence', 'observation-missing');
  has(none, 'missingEvidence', 'real-client-site');
  const unverifiable = run(deep(false, 'clientEvidence.observation.verifiable'));
  assert.equal(unverifiable.status, PROSPECT_STATUSES.INCOMPLETE);
  assert.equal(run(deep(false, 'offerFit.servesHomeServiceClients')).status, PROSPECT_STATUSES.INCOMPLETE);
});

test('Mission Control findings resolve exactly as the evidence allows', () => {
  // Footbridge: its own published stance is the digital equivalent of ignoring cold calls; consent required for its email service.
  const foot = run({ company: 'Footbridge Media', website: 'https://www.footbridgemedia.com/', recipient: { email: 'service@footbridgemedia.com', publishedRole: 'UNKNOWN' }, negativeRecipientSignals: [{ kind: 'PUBLISHED_ANTI_UNSOLICITED_STANCE', summary: 'article treats unsolicited marketing/optimization reports as cold-call equivalents it ignores' }, { kind: 'CONSENT_REQUIRED_STANCE', summary: 'its email service says recipients should be existing customers and consent is required' }] });
  assert.equal(foot.status, PROSPECT_STATUSES.REJECTED);
  // 1SEO: Scorpion's RevenueMAX attributes booked jobs and revenue (repo-recorded inseparable overlap).
  const oneSeo = run({ company: '1SEO', website: 'https://1seo.com/', currentOwnership: { status: 'PART_OF_LARGER_GROUP', parentAssessment: { parent: 'Scorpion', operatesUnderOwnBrand: true, parentOverlapWithOffer: 'HIGH', rationale: 'Scorpion RevenueMAX directly attributes booked jobs and revenue.', evidenceRef: 'artifacts/world-brain-field-mission-2026-09-01/rejected-partner-candidates.json#scorpion' } } });
  assert.equal(oneSeo.status, PROSPECT_STATUSES.REJECTED);
  has(oneSeo, 'rejectionReasons', 'parent-overlap');
  // KickCharge: privacy-contact section only.
  assert.equal(run({ company: 'KickCharge Creative', website: 'https://www.kickcharge.com/', recipient: { email: 'sparky@kickcharge.com', publishedRole: 'PRIVACY_ONLY' } }).status, PROSPECT_STATUSES.REJECTED);
  // Powerhouse: public partnership-oriented address, but no verbatim excerpt containing it, no notice checks, no client observation.
  const power = run({ company: 'Powerhouse Consulting Group', website: 'https://mypowerhouse.group/', evidenceClass: 'EXTERNAL_LANE_REPORT_WITH_EXCERPT', recipient: { email: 'hello@mypowerhouse.group', publishedRole: 'SALES_OR_PARTNERSHIPS', sourceUrl: 'https://mypowerhouse.group/contact/' } });
  assert.equal(power.status, PROSPECT_STATUSES.INCOMPLETE);
  has(power, 'missingEvidence', 'excerpt-missing');
});

test('intake is pure: it does not mutate its input and only the zero-authority preflight composes it', async () => {
  const record = full(); const before = JSON.stringify(record);
  run(record);
  assert.equal(JSON.stringify(record), before);
  const { readdirSync, readFileSync, statSync } = await import('node:fs');
  const { join } = await import('node:path');
  const root = new URL('..', import.meta.url).pathname;
  const importers = [];
  const walk = dir => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === 'tests' || name === '.git') continue;
      const full2 = join(dir, name);
      if (statSync(full2).isDirectory()) walk(full2);
      else if (/\.(mjs|js)$/.test(name) && readFileSync(full2, 'utf8').includes('prospect-verification-intake') && !full2.endsWith('src/prospect-verification-intake.mjs')) importers.push(full2.slice(root.length));
    }
  };
  walk(root);
  // The only permitted importers are the zero-authority preflight composition,
  // its read-only candidate handoff and the reachability audit that merely names it. Nothing on a send path
  // (pipeline, governance, dispatch, worker) may import the intake.
  const allowed = new Set(['src/prospect-preflight.mjs', 'src/prospect-preflight-handoff.mjs', 'scripts/outreach-reachability-audit.mjs', 'scripts/mutation-war.mjs']);
  assert.deepEqual(importers.filter(file => !allowed.has(file)), []);
});
