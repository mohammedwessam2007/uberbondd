// Same-day lead-path evidence gate.
//
// Regression for the October 2026 Powerhouse/Sylvester drift: the quoted
// client-page observation was taken 2026-10-02T19:57Z, the public page later
// changed, and the G-SPOT readout of 2026-10-08T23:38Z still reported
// READY_FOR_AUTHORIZATION because the intake only checked that `observedAt`
// parsed. A first touch built on a stale observation can assert something the
// page no longer says. See docs/receipts/POWERHOUSE_PROOF_RECHECK_2026-10-09.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { compileProspectVerification, PROSPECT_STATUSES, EVIDENCE_OBSERVATION_MAX_AGE_MS } from '../src/prospect-verification-intake.mjs';
import { runProspectPreflight, PREFLIGHT_STATES as P } from '../src/prospect-preflight.mjs';
import { powerhouseRecord, POWERHOUSE_SLOTS as SLOTS, POWERHOUSE_ARTIFACT_REF as ARTIFACT } from './fixtures/outreach/powerhouse.fixture.mjs';
import { freshPolicyRegistry } from './fixtures/outreach/global-green-lane.fixture.mjs';

const HOUR = 3_600_000;
const STALE = 'lead-path-observation-stale-recheck-required';

// Minimal US agency record; only the lead-path observation time varies.
const now = new Date('2026-10-05T12:00:00.000Z');
const agency = (observationAt, recipientAt = '2026-10-04T12:00:00.000Z') => ({
  company: 'Example Home Marketing', website: 'https://agency.example/', hqCountry: 'US',
  currentOwnership: { status: 'INDEPENDENT', evidenceUrl: 'https://agency.example/about' },
  evidenceClass: 'PAGE_FETCH_VERIFIED',
  contactHistory: { repoAndHistorySearched: true, runtimeSuppressionSearched: true, runtimeProspectAndOutboundSearched: true, hit: false },
  offerRoute: { offerId: 'AGENCY_REVENUE_LEAK_PROOF_PACK', rationale: 'Agency serves home-service clients and needs client lead-path evidence.' },
  recipient: { email: 'hello@agency.example', publishedRole: 'GENERAL_BUSINESS_INQUIRIES', sourceUrl: 'https://agency.example/contact', sourcePageExact: true, excerpt: 'General inquiries: hello@agency.example', observedAt: recipientAt },
  notices: { noSolicitationChecked: true, noSolicitationFound: false, noHarvestChecked: true, noHarvestFound: false },
  offerFit: { servesHomeServiceClients: true, evidenceUrl: 'https://agency.example/hvac-marketing' },
  clientEvidence: {
    clientName: 'Example HVAC', clientSiteUrl: 'https://example-hvac.example/',
    observation: { verifiable: true, text: 'Contact form returns a blank page after submit', sourceUrl: 'https://example-hvac.example/contact', excerpt: 'blank page after submit', observedAt: observationAt }
  }
});
const ago = ms => new Date(now.getTime() - ms).toISOString();
const intake = (record, opts = {}) => compileProspectVerification(record, { now, ...opts });

test('the window is one day and is exported, so callers and docs cannot drift from it', () => {
  assert.equal(EVIDENCE_OBSERVATION_MAX_AGE_MS, 24 * HOUR);
});

test('a lead-path observation inside the same-day window still verifies, and reports measured freshness', () => {
  const r = intake(agency(ago(23 * HOUR)));
  assert.equal(r.status, PROSPECT_STATUSES.VERIFIED_CANDIDATE, JSON.stringify(r.missingEvidence));
  assert.equal(r.evidenceFreshness.scope, 'LEAD_PATH_CLAIM_OBSERVATION');
  assert.equal(r.evidenceFreshness.recheckRequired, false);
  assert.equal(r.evidenceFreshness.leadPathObservationAgeMs, 23 * HOUR);
  assert.ok(r.evidenceFreshness.freshness > 0 && r.evidenceFreshness.freshness < 0.1);
});

test('one millisecond past the window is INCOMPLETE with a re-fetch obligation, never a reusable fact', () => {
  const r = intake(agency(ago(24 * HOUR + 1)));
  assert.equal(r.status, PROSPECT_STATUSES.INCOMPLETE);
  assert.ok(r.missingEvidence.includes(STALE), JSON.stringify(r.missingEvidence));
  assert.equal(r.evidenceFreshness.recheckRequired, true);
  assert.equal(r.evidenceFreshness.freshness, 0);
  assert.equal(r.sendAuthority, false);
});

test('exactly at the boundary is still fresh (the window is inclusive)', () => {
  assert.equal(intake(agency(ago(24 * HOUR))).status, PROSPECT_STATUSES.VERIFIED_CANDIDATE);
});

test('a lead-path observation dated in the future is REJECTED, not merely incomplete', () => {
  const r = intake(agency(new Date(now.getTime() + 2 * HOUR).toISOString()));
  assert.equal(r.status, PROSPECT_STATUSES.REJECTED);
  assert.ok(r.rejectionReasons.includes('lead-path-observation-in-future'));
  assert.equal(r.evidenceFreshness.recheckRequired, true, 'rejected future evidence must require re-observation');
  assert.equal(r.evidenceFreshness.freshness, 0, 'rejected future evidence must never score as fresh');
  assert.equal(r.evidenceFreshness.leadPathObservationAgeMs, null, 'invalid future age is not zero-age evidence');
});

test('five-minute clock-skew boundary is inclusive but +1ms must fail closed', () => {
  const atBoundary = intake(agency(new Date(now.getTime() + 5 * 60_000).toISOString()));
  assert.equal(atBoundary.status, PROSPECT_STATUSES.VERIFIED_CANDIDATE);
  const beyond = intake(agency(new Date(now.getTime() + 5 * 60_000 + 1).toISOString()));
  assert.equal(beyond.status, PROSPECT_STATUSES.REJECTED);
  assert.ok(beyond.rejectionReasons.includes('lead-path-observation-in-future'));
  assert.equal(beyond.evidenceFreshness.recheckRequired, true);
  assert.equal(beyond.evidenceFreshness.freshness, 0);
});

test('a caller may tighten the window but can never widen it', () => {
  const twoHoursOld = agency(ago(2 * HOUR));
  assert.ok(intake(twoHoursOld, { evidenceMaxAgeMs: HOUR }).missingEvidence.includes(STALE), 'tightening applies');
  const twoDaysOld = agency(ago(48 * HOUR));
  for (const wider of [30 * 24 * HOUR, Number.MAX_SAFE_INTEGER, Infinity]) {
    const r = intake(twoDaysOld, { evidenceMaxAgeMs: wider });
    assert.ok(r.missingEvidence.includes(STALE), `widening to ${wider} must not clear a stale observation`);
    assert.equal(r.evidenceFreshness.maxAgeMs, EVIDENCE_OBSERVATION_MAX_AGE_MS);
  }
  for (const garbage of [0, -1, NaN, '1e99', null, 'never']) {
    assert.ok(intake(twoDaysOld, { evidenceMaxAgeMs: garbage }).missingEvidence.includes(STALE), `garbage window ${String(garbage)} falls back to the default`);
  }
});

test('recipient-address age is still owned by the contact-source verifier, not re-decided by this gate', () => {
  // A 3-day-old published address with a fresh claim passes intake; the
  // separate 7-day contact-source policy is enforced downstream by the router.
  const r = intake(agency(ago(HOUR), ago(72 * HOUR)));
  assert.equal(r.status, PROSPECT_STATUSES.VERIFIED_CANDIDATE, JSON.stringify(r.missingEvidence));
});

// End-to-end through the real preflight with the production-shaped Powerhouse record.
const IDENTITY = { legalBusinessSenderName: 'Example Operating LLC', authorizedPublicPostalAddress: '100 Example Street, Suite 4, Springfield, ST 00000', footerUseAuthorized: true };
const RESOLVED = { resolved: true, operatorLocation: 'US', senderEntityJurisdiction: 'US', controllerJurisdiction: 'US', resolutionRef: 'counsel-memo-ref' };
const UNSUB = { unsubscribeUrl: 'https://uberbond.example/unsubscribe?t=sig', oneClickUnsubscribeUrl: 'https://uberbond.example/unsubscribe/one-click?t=sig' };
const account = slot => ({ id: `acct-${slot}`, slot, email: `${slot}@send.example`, provider: 'smtp-relay', connected: true, tokens: { enc: 'x' }, plannedDailyCap: 2, smtpRoute: { authorized: true, termsCompatible: true, evidenceRef: 'ref' } });
const store = () => {
  const data = { suppressions: [], prospects: [], outboundReservations: [], outboundEvents: [], replies: [], messages: [], providerEvents: [], accounts: [account('smtp-1'), account('smtp-2'), account('smtp-3')], senderHealth: [{ inbox: 'smtp-3', paused: true }] };
  const writes = [];
  const refuse = name => async () => { writes.push(name); throw new Error('write'); };
  return { writes, async list(n) { return structuredClone(data[n] || []); }, add: refuse('add'), patch: refuse('patch'), update: refuse('update'), remove: refuse('remove') };
};
const preflight = (at, record = powerhouseRecord()) => {
  const s = store();
  return runProspectPreflight({ store: s, record, slots: SLOTS, artifactRef: ARTIFACT, artifactExists: ref => ref === ARTIFACT, now: at, policyRegistry: freshPolicyRegistry(at), identity: IDENTITY, senderSide: RESOLVED, unsubscribe: UNSUB, campaign: { campaignId: 'camp_1' } }).then(r => ({ r, s }));
};

test('control: the same Powerhouse record evaluated the evening it was observed is READY_FOR_AUTHORIZATION', async () => {
  const { r } = await preflight(new Date('2026-10-02T21:00:00.000Z'));
  assert.equal(r.state, P.READY_FOR_AUTHORIZATION);
});

test('REGRESSION: the Oct 2 Powerhouse observation evaluated at the Oct 8 G-SPOT readout is blocked, not ready', async () => {
  const { r, s } = await preflight(new Date('2026-10-08T23:38:14.000Z'));
  assert.notEqual(r.state, P.READY_FOR_AUTHORIZATION);
  assert.equal(r.state, P.BLOCKED_EXTERNAL_FACT);
  assert.ok(r.blockerCodes.includes(STALE), JSON.stringify(r.blockerCodes));
  assert.equal(r.message, undefined, 'no message is drafted on a stale claim');
  assert.equal(r.sendAuthority, false);
  assert.equal(r.externalEffects, 0);
  assert.deepEqual(s.writes, [], 'the gate is read-only');
});

test('a same-day re-observation of the page restores eligibility through the normal path, with no override flag', async () => {
  const at = new Date('2026-10-08T23:38:14.000Z');
  const refreshed = powerhouseRecord();
  refreshed.clientEvidence.observation.observedAt = '2026-10-08T22:00:00.000Z';
  refreshed.recipient.observedAt = '2026-10-08T22:00:00.000Z';
  const { r } = await preflight(at, refreshed);
  assert.equal(r.state, P.READY_FOR_AUTHORIZATION, JSON.stringify(r.blockerCodes));
});

test('an unparseable evaluation clock fails closed instead of reading every observation as fresh', () => {
  // NaN makes every age comparison false; before this guard a stale claim
  // passed intake with recheckRequired:false and scored as perfectly fresh.
  for (const bad of [new Date('garbage'), 'garbage', NaN]) {
    const r = compileProspectVerification(agency(ago(48 * HOUR)), { now: bad });
    assert.equal(r.status, PROSPECT_STATUSES.REJECTED, String(bad));
    assert.ok(r.rejectionReasons.includes('evaluation-clock-invalid'));
    assert.equal(r.evidenceFreshness.recheckRequired, true);
    assert.equal(r.evidenceFreshness.freshness, 0);
    assert.equal(r.sendAuthority, false);
  }
});
