import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compilePublicDiscoveryLeadCorpus,
  compileApolloStyleLeadLayer,
  prepareUberLeadLaunchFusion
} from '../src/uberlead-launch-fusion.mjs';

const now = new Date('2026-09-15T01:00:00.000Z');

function discoveryFixture() {
  return {
    state: 'READY',
    sourceClass: 'PUBLIC_BUSINESS_DATA',
    provider: 'openstreetmap-overpass',
    evidenceRef: 'ubdisc_fixture',
    protectedSource: false,
    captchaBypass: false,
    privateDataInference: false,
    prospects: [
      {
        company: 'Alpha Clinic',
        website: 'https://alpha.example/',
        niche: 'clinic',
        country: 'EG',
        city: 'Giza',
        sourceUrl: 'https://www.openstreetmap.org/node/1',
        sourceRecordId: 'node/1',
        sourceLicense: '© OpenStreetMap contributors',
        notes: 'Public OSM record includes the clinic website.'
      },
      {
        company: 'Beta Clinic',
        website: 'https://beta.example/',
        niche: 'clinic',
        country: 'EG',
        city: 'Giza',
        sourceUrl: 'https://www.openstreetmap.org/node/2',
        sourceRecordId: 'node/2',
        sourceLicense: '© OpenStreetMap contributors',
        notes: 'Public OSM record includes the clinic website.'
      }
    ]
  };
}

test('public discovery becomes an UberBond-owned lead corpus without inventing contacts', () => {
  const corpus = compilePublicDiscoveryLeadCorpus({ discovery: discoveryFixture(), now });
  assert.equal(corpus.prospects.length, 2);
  assert.equal(corpus.prospects[0].contact, null);
  assert.equal(corpus.prospects[0].sourceType, 'public_website');
  assert.equal(corpus.privateDataInference, false);
  assert.equal(corpus.externalEffectAuthority, 'NONE');
  assert.match(corpus.prospects[0].id, /^ublead_[a-f0-9]{24}$/);
});

test('Apollo-style layer ranks the public corpus and builds enrichment plans with zero provider calls', () => {
  const corpus = compilePublicDiscoveryLeadCorpus({ discovery: discoveryFixture(), now });
  const layer = compileApolloStyleLeadLayer({
    corpus,
    leadQuery: { industries: ['clinic'], countries: ['eg'] },
    now
  });
  assert.equal(layer.counts.discovered, 2);
  assert.ok(layer.rankedAccounts.length >= 1);
  assert.ok(layer.enrichmentPlans.length >= 1);
  assert.equal(layer.providerCalls, 0);
  assert.equal(layer.externalEffects, 0);
  assert.equal(layer.externalEffectAuthority, 'NONE');
  assert.match(layer.truthBoundary, /does not copy Apollo data/i);
});

test('fusion keeps the big button closed when physical sender evidence is absent', async () => {
  const payload = {
    elements: [
      {
        type: 'node',
        id: 1,
        lat: 30.0,
        lon: 31.0,
        tags: { name: 'Alpha Clinic', amenity: 'clinic', website: 'https://alpha.example/' }
      }
    ]
  };
  const fetcher = async () => ({ ok: true, status: 200, json: async () => payload });
  const out = await prepareUberLeadLaunchFusion({
    sourceReadiness: { state: 'VERIFIED_SOURCE_READY', evidenceRef: 'source-proof' },
    discoveryConfig: {
      categories: ['clinic'],
      bbox: [29.9, 30.9, 30.1, 31.1],
      maxBboxSpan: 5,
      timeoutMs: 1000,
      retryAttempts: 1,
      minIntervalMs: 0,
      endpoint: 'https://overpass-api.de/api/interpreter',
      userAgent: 'UberBond-Test/1.0',
      dailyCap: 10,
      country: 'EG',
      city: 'Giza'
    },
    discoveryOptions: { categories: ['clinic'], limit: 10 },
    leadQuery: { minScore: 0, minEvidenceScore: 0 },
    substrate: {
      mode: 'SELF_HOSTED',
      controlPlane: 'OWNED',
      substrateId: 'UBERCLOUD',
      observedHealthy: true,
      evidenceRef: 'uberc-runtime-proof'
    },
    launchInputs: {
      genome: { state: 'VERIFIED_SOURCE_READY', evidenceRef: 'genome-proof' },
      domainState: { domainId: 'uberbond.cloud', state: 'READY_FOR_LIMITED_OUTREACH', outreachState: 'AUTHORIZED', evidenceFreshness: 'FRESH' },
      mailboxState: { mailboxId: 'mbx-1', authenticationStatus: 'AUTHENTICATED', warmupStatus: 'WARMUP_COMPLETE', paused: false, currentDailyCap: 5 },
      egress: { state: 'UNKNOWN', observedColdDailyCap: 0 },
      transport: { state: 'READY', authenticated: true, evidenceRef: 'transport-proof' },
      campaignAuthorization: { authorized: true, receiptId: 'campaign-auth', expiresAt: '2026-09-15T02:00:00.000Z' },
      recipient: { safeForOutreach: true, email: 'buyer@example.com', verificationEvidenceRef: 'verify-proof' },
      legal: { status: 'PASSED', evidenceId: 'legal-proof', policyVersion: 'legal-v1' },
      suppression: { suppressed: false, unsubscribed: false },
      recipientProvider: { state: 'READY', observedDailyBudget: 5, evidenceRef: 'provider-budget-proof' }
    },
    ownerAuthorization: { authorized: true, receiptId: 'owner-press', expiresAt: '2026-09-15T01:15:00.000Z' },
    fetcher,
    now
  });

  assert.equal(out.leadLayer.rankedAccounts.length, 1);
  assert.equal(out.manifest.state, 'WAIT_EXTERNAL_EVIDENCE');
  assert.ok(out.manifest.waitReasonCodes.includes('observed-ready-egress-required'));
  assert.equal(out.oneButtonPressAvailable, false);
  assert.equal(out.selfHostRequired, true);
});

test('fusion never treats account discovery as contact permission', () => {
  const corpus = compilePublicDiscoveryLeadCorpus({ discovery: discoveryFixture(), now });
  const layer = compileApolloStyleLeadLayer({ corpus, now });
  assert.equal(layer.rankedLeads.every(row => !row.contact), true);
  assert.equal(layer.enrichmentPlans.every(plan => plan.summary.existingEmail === false), true);
});
