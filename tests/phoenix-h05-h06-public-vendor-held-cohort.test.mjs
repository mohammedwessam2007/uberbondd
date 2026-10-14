import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalLeadIdentity,
  deduplicateLeadCorpus,
  compileNativeLeadList,
  nativeLeadListCsv
} from '../src/uberbond-native-lead-ops.mjs';
import { compileProofLineage, reviewMessageAdversarially, narrowTournamentWithCritics } from '../src/proof-factory.mjs';

// Source-frozen public ORGANIZATIONS, not verified people or send permissions.
// First-party URLs were independently revisited 2026-10-14/15.
// No customer defect has been independently observed.
const OBSERVED = new Date('2026-10-15T00:00:00Z');
const orgs = [
  {
    id: 'ffm-01', company: 'Forward First Media', domain: 'forwardfirstmedia.com',
    website: 'https://forwardfirstmedia.com/', niche: 'HVAC and plumbing agency',
    country: 'United States', city: 'Fife Lake',
    source: 'public_website', sourceUrl: 'https://forwardfirstmedia.com/affiliate-program/',
    updatedAt: '2026-10-14T20:00:00Z',
    sourceAuthority: 'first-party page; vendor-or-software inquiry; not general email consent',
    contact: null, issue: null, status: 'research_only'
  },
  {
    id: 'elxel-01', company: 'Elxel', domain: 'elxel.com',
    website: 'https://elxel.com/', niche: 'branding, web design and marketing agency',
    country: 'United States', city: 'Washington, DC',
    source: 'public_website', sourceUrl: 'https://elxel.com/contact/',
    updatedAt: '2026-10-14T20:00:00Z',
    sourceAuthority: 'first-party page invites vendors and collaborators; no buyer consent',
    contact: null, issue: null, status: 'research_only'
  },
  {
    id: 'roi-01', company: 'ROI Growth Media', domain: 'roigrowthmedia.com',
    website: 'https://roigrowthmedia.com/en/', niche: 'fintech and SaaS growth agency',
    source: 'public_website', sourceUrl: 'https://roigrowthmedia.com/en/about-us/',
    updatedAt: '2026-10-14T20:00:00Z',
    sourceAuthority: 'first-party agency positioning; poor fit to home-service pilot',
    contact: null, issue: null, status: 'research_only'
  }
];

const profile = (sendReady) => ({
  name: sendReady ? 'first-campaign proof gate' : 'research-only vendor discovery',
  query: {
    minScore: 0, minEvidenceScore: 0,
    requireEvidence: sendReady,
    requireContact: sendReady,
    skipOwned: false
  }
});

test('three real sourced organizations dedupe to three canonical accounts without invented people', () => {
  const result = deduplicateLeadCorpus({
    prospects: [...orgs, { ...orgs[0], id: 'ffm-02', sourceUrl: 'https://forwardfirstmedia.com/about/' }],
    now: OBSERVED
  });
  assert.equal(result.stats.input, 4);
  assert.equal(result.stats.canonicalAccounts, 3);
  assert.equal(result.stats.duplicateRecords, 1);
  assert.equal(result.stats.exactEmails, 0);
  assert.equal(result.stats.verifiedEmails, 0);
  assert.ok(result.records.every(row => canonicalLeadIdentity(row).contactKey === null));
  assert.equal(result.providerCalls, 0);
  assert.equal(result.externalEffects, 0);
});

test('actual research cohort never converts source purpose to cold-email permission', () => {
  const list = compileNativeLeadList({
    name: 'three observed first-party vendor organizations; research-only',
    profile: profile(false),
    prospects: orgs,
    limit: 3,
    campaignId: 'HELD_NOT_AUTHORIZED',
    idempotencyKey: 'phoenix-public-vendor-cohort-20261015',
    now: OBSERVED
  });
  assert.equal(list.status, 'prepared');
  assert.equal(list.stats.canonicalAccounts, 3);
  assert.equal(list.handoff.send, 'NOT_AUTHORIZED');
  assert.equal(list.handoff.enrollment, 'NOT_PERFORMED');
  assert.equal(list.businessEffectAuthority, 'NONE');
  assert.equal(list.externalEffects, 0);
  assert.equal(list.providerCalls, 0);
  const csv = nativeLeadListCsv(list);
  assert.doesNotMatch(csv, /secret|password|token/i);
});

test('no actual permission, independently observed defect or verified recipient yields zero first-campaign rows', () => {
  const list = compileNativeLeadList({
    name: 'strict sendability research gate',
    profile: profile(true),
    prospects: orgs,
    limit: 10,
    idempotencyKey: 'phoenix-public-vendor-send-gate-20261015',
    now: OBSERVED
  });
  assert.equal(list.stats.canonicalAccounts, 3);
  assert.equal(list.stats.selected, 0);
  assert.equal(list.handoff.send, 'NOT_AUTHORIZED');
  assert.equal(list.providerCalls, 0);
  assert.equal(list.externalEffects, 0);
});

test('Proof Factory refuses a claimed defect, stale or absent observation on these companies', () => {
  const missing = compileProofLineage({
    offerId: 'agency-revenue-leak-proof-pack',
    prospect: orgs[0],
    issue: null,
    observedAt: null,
    now: OBSERVED.getTime()
  });
  assert.equal(missing.ok, false);
  const reviewed = reviewMessageAdversarially({
    subject: 'Booking-path acceptance checks',
    body: 'We found missed bookings and you are losing customers. Would a repair sample be useful?',
    lineage: null,
    claimsUsed: [],
    evidenceRefs: [],
    artifactPrepared: false
  });
  assert.equal(reviewed.verdict, 'REFUSE');
  assert.equal(reviewed.outboundAuthority, 'NONE');
  const stopped = narrowTournamentWithCritics({ tournament: { status: 'DO_NOT_SEND', winner: null }, lineage: null });
  assert.equal(stopped.messageValidated, false);
  assert.equal(stopped.outboundAuthority, 'NONE');
});
