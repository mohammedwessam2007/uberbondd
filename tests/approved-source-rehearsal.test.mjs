import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { getCommercialOpportunity } from '../src/commercial-opportunity-catalog.mjs';
import {
  rehearseApprovedCommercialEvidence,
  APPROVED_SOURCE_REHEARSAL_POLICY_VERSION
} from '../src/approved-source-rehearsal.mjs';
import { createJobHandlers } from '../src/job-handlers.mjs';

const referenceDate = new Date('2026-08-20T10:00:00.000Z');
const opportunity = getCommercialOpportunity('paid-media-revenue-assurance');
const sourceUrls = opportunity.observedBuyerSignals.map(signal => signal.source.url);

test('requires an explicit allowlist entry from the canonical catalog', async () => {
  const none = await rehearseApprovedCommercialEvidence({
    opportunityId: opportunity.id,
    approvedSourceUrls: [],
    date: referenceDate
  });
  assert.equal(none.ok, false);
  assert.equal(none.status, 'APPROVED_SOURCE_REQUIRED');
  assert.ok(none.reasonCodes.includes('approved-catalog-source-required'));

  const invented = await rehearseApprovedCommercialEvidence({
    opportunityId: opportunity.id,
    approvedSourceUrls: ['https://example.test/invented'],
    date: referenceDate
  });
  assert.equal(invented.ok, false);
});

test('rehearses canonical buyer signals without promoting source verification or revenue truth', async () => {
  const result = await rehearseApprovedCommercialEvidence({
    opportunityId: opportunity.id,
    approvedSourceUrls: sourceUrls,
    date: referenceDate,
    tournamentLimit: 5
  });
  assert.equal(result.ok, true);
  assert.equal(result.policyVersion, APPROVED_SOURCE_REHEARSAL_POLICY_VERSION);
  assert.equal(result.status, 'REHEARSED_REVIEW_REQUIRED');
  assert.equal(result.selectedSourceCount, 2);
  assert.equal(result.reconciliation.ingestion.acceptedCount, 2);
  assert.equal(result.reconciliation.tournament.registryCount, 439);
  assert.equal(result.truthClassification.buyerEvidence, 'BUYER_SIGNAL');
  assert.equal(result.truthClassification.sourceVerification, 'UNVERIFIED');
  assert.equal(result.truthClassification.revenue, 'UNPROVEN');
  assert.ok(result.reasonCodes.includes('source-content-not-reverified'));
  assert.equal(result.externalEffectLedger.providerCalls, 0);
  assert.equal(result.localAuditWrites, 0);
});

test('source verification cannot be upgraded by assertion without an evidence reference', async () => {
  const result = await rehearseApprovedCommercialEvidence({
    opportunityId: opportunity.id,
    approvedSourceUrls: [sourceUrls[0]],
    verificationByUrl: { [sourceUrls[0]]: { state: 'CONTENT_MATCHED' } },
    date: referenceDate
  });
  assert.equal(result.selectedSources[0].verificationState, 'UNVERIFIED');
  assert.equal(result.truthClassification.sourceVerification, 'UNVERIFIED');
});

test('a referenced caller verification receipt is preserved but not independently claimed as verified', async () => {
  const result = await rehearseApprovedCommercialEvidence({
    opportunityId: opportunity.id,
    approvedSourceUrls: [sourceUrls[0]],
    verificationByUrl: { [sourceUrls[0]]: { state: 'CONTENT_MATCHED', evidenceRef: 'external-receipt-123' } },
    date: referenceDate
  });
  assert.equal(result.selectedSources[0].verificationState, 'CONTENT_MATCHED');
  assert.equal(result.selectedSources[0].verificationEvidenceRef, 'external-receipt-123');
  assert.equal(result.truthClassification.sourceVerification, 'CALLER_RECEIPT_REFERENCED');
});

test('persisted handler writes the four canonical receipts plus one compact rehearsal receipt', async () => {
  const calls = [];
  const store = {
    list: async () => [],
    log: async (type, detail) => { calls.push({ type, detail }); return { id: type }; }
  };
  const handlers = createJobHandlers({ cfg: {}, store });
  const result = await handlers['prometheus.commercial.approved_source_rehearsal']({
    opportunityId: opportunity.id,
    approvedSourceUrls: [sourceUrls[0]],
    date: referenceDate,
    persist: true
  });
  assert.equal(result.ok, true);
  assert.equal(result.localAuditWrites, 5);
  assert.deepEqual(calls.map(call => call.type), [
    'market_signal_ingest',
    'business_genome_extraction',
    'commercial_opportunity_tournament',
    'commercial_evidence_reconciliation',
    'approved_source_commercial_rehearsal'
  ]);
  const receipt = calls.at(-1).detail;
  assert.equal(Object.prototype.hasOwnProperty.call(receipt, 'signals'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(receipt, 'payload'), false);
  assert.equal(receipt.externalEffectLedger.messages, 0);
});

test('module is local-only by source inspection', async () => {
  const source = await fs.readFile(new URL('../src/approved-source-rehearsal.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /fetch\(|http\.request|https\.request|readFile\(|writeFile\(/);
});
