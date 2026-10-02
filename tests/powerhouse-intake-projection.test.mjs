import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileProspectVerification, PROSPECT_STATUSES } from '../src/prospect-verification-intake.mjs';

const tournament = JSON.parse(readFileSync(new URL('../artifacts/outreach/prospect-tournament-20261002.json', import.meta.url), 'utf8'));
const entry = tournament.candidates.find(c => c.company === 'Powerhouse Consulting Group');
const now = new Date(Date.parse(entry.inputRecord.recipient.observedAt) + 60_000);
const excluded = tournament.excludedAsAlreadyContacted;
const run = record => compileProspectVerification(record, { now, excludedRecipients: excluded });
const withLedger = contactHistory => ({ ...structuredClone(entry.inputRecord), contactHistory });
const CLEAN = { repoAndHistorySearched: true, runtimeSuppressionSearched: true, runtimeProspectAndOutboundSearched: true, hit: false };

test('the recorded Powerhouse result is INCOMPLETE with exactly one gap: the runtime ledgers', () => {
  assert.equal(entry.intake.status, PROSPECT_STATUSES.INCOMPLETE);
  assert.deepEqual(entry.intake.missingEvidence, ['runtime-suppression-and-prior-contact-ledgers-not-checked']);
  assert.deepEqual(entry.intake.rejectionReasons, []);
  assert.equal(entry.inputRecord.contactHistory.runtimeSuppressionSearched, false);
  assert.equal(entry.inputRecord.contactHistory.runtimeProspectAndOutboundSearched, false);
  assert.equal(tournament.prospectReady, false);
});

test('recorded evidence is exact: event-page source, address in the verbatim excerpt, no-harvest checked, same-page client observation', () => {
  const r = entry.inputRecord;
  assert.equal(r.recipient.sourcePageExact, true);
  assert.match(r.recipient.sourceUrl, /^https:\/\/mypowerhouse\.group\/event\/webinar-servicetitan-field-mobile-app-advanced-features\/$/);
  assert.ok(r.recipient.excerpt.includes(r.recipient.email));
  assert.equal(r.notices.noHarvestChecked, true);
  assert.equal(r.notices.noHarvestFound, false);
  assert.equal(r.recipient.publishedRole, 'GENERAL_BUSINESS_AND_PARTNERSHIP_CONTACT');
  assert.equal(r.clientEvidence.clientSiteUrl, 'https://sylvesterelectric.com/');
  assert.equal(r.clientEvidence.observation.sourceUrl, 'https://sylvesterelectric.com/');
  assert.equal(r.offerRoute.offerId, 'REVENUE_PROOF_AND_RENEWAL_PACK');
});

test('PROJECTION ONLY: a clean runtime ledger read would make the deterministic intake return VERIFIED_CANDIDATE (not stored as the real result)', () => {
  const projected = run(withLedger(CLEAN));
  assert.equal(projected.status, PROSPECT_STATUSES.VERIFIED_CANDIDATE, JSON.stringify(projected));
  assert.equal(projected.offerId, 'REVENUE_PROOF_AND_RENEWAL_PACK');
  assert.equal(projected.recipientSideEligibility.decision, 'ALLOW_WITH_REQUIREMENTS');
  assert.equal(projected.legalAuthorityStatus, 'HOLD_SENDER_SIDE_UNRESOLVED');
  assert.equal(projected.sendAuthority, false);
});

test('PROJECTION ONLY: any runtime ledger hit rejects, and nothing overrides it', () => {
  const hit = run(withLedger({ ...CLEAN, hit: true }));
  assert.equal(hit.status, PROSPECT_STATUSES.REJECTED);
  assert.ok(hit.rejectionReasons.includes('prior-contact-or-suppression-runtime-ledger-hit'));
  const excludedRun = compileProspectVerification(withLedger(CLEAN), { now, excludedRecipients: [entry.inputRecord.recipient.email] });
  assert.equal(excludedRun.status, PROSPECT_STATUSES.REJECTED);
});

test('an external repo search alone never satisfies the runtime ledger requirement', () => {
  const repoOnly = run(withLedger({ repoAndHistorySearched: true, runtimeSuppressionSearched: false, runtimeProspectAndOutboundSearched: false, hit: false }));
  assert.equal(repoOnly.status, PROSPECT_STATUSES.INCOMPLETE);
});
