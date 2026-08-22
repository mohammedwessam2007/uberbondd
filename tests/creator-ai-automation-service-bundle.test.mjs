import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CREATOR_AI_AUTOMATION_SERVICE_BUNDLE,
  CREATOR_AI_AUTOMATION_ZERO_EFFECTS,
  getCreatorAiAutomationService,
  listCreatorAiAutomationServices,
  summarizeCreatorAiAutomationBundle
} from '../src/creator-ai-automation-service-bundle.mjs';

test('captures exactly the ten creator-posted automation services', () => {
  assert.equal(CREATOR_AI_AUTOMATION_SERVICE_BUNDLE.length, 10);
  assert.deepEqual(
    CREATOR_AI_AUTOMATION_SERVICE_BUNDLE.map(item => [item.name, item.claimedMonthlyUsd]),
    [
      ['AI Voice Receptionist', 2500],
      ['Missed Call Text-Back', 500],
      ['Review Management', 750],
      ['Lead Follow-Up System', 1500],
      ['Customer Re-Engagement', 1500],
      ['Appointment Reminders', 800],
      ['Cold Outreach System', 2000],
      ['Full Backend CRM', 3000],
      ['Custom Dashboard', 1500],
      ['Estimate Follow-Up', 700]
    ]
  );
});

test('preserves the source total as a creator claim, never as verified revenue or price', () => {
  const summary = summarizeCreatorAiAutomationBundle();
  assert.equal(summary.claimedMonthlyUsd, 14750);
  assert.equal(summary.claimType, 'CREATOR_CLAIM');
  assert.equal(summary.verifiedMarketPriceUsd, null);
  assert.equal(summary.verifiedRevenueUsd, 0);
  assert.equal(summary.paymentProof, 'ABSENT');
  assert.equal(summary.buyerProof, 'ABSENT');
});

test('every service stays research-only with no external consequence authority', () => {
  for (const service of listCreatorAiAutomationServices()) {
    assert.equal(service.evidence.classification, 'CREATOR_CLAIM');
    assert.equal(service.evidence.buyerSignal, 'ABSENT');
    assert.equal(service.evidence.transactionEvidence, 'ABSENT');
    assert.equal(service.currentStatus, 'RESEARCH_ONLY');
    assert.equal(service.executionAuthority, 'LOCAL_PREPARATION_ONLY');
    assert.deepEqual(service.externalEffectLedger, CREATOR_AI_AUTOMATION_ZERO_EFFECTS);
  }
});

test('service ids are unique and retrieval returns a defensive clone', () => {
  const list = listCreatorAiAutomationServices();
  assert.equal(new Set(list.map(item => item.id)).size, 10);
  const first = getCreatorAiAutomationService('creator-ai-voice-receptionist');
  assert.equal(first.name, 'AI Voice Receptionist');
  first.name = 'mutated';
  assert.equal(getCreatorAiAutomationService('creator-ai-voice-receptionist').name, 'AI Voice Receptionist');
  assert.equal(getCreatorAiAutomationService('not-real'), null);
});

test('master-two strategy is capability reuse rather than ten bespoke stacks', () => {
  const summary = summarizeCreatorAiAutomationBundle();
  assert.equal(summary.strategy, 'MASTER_SHARED_CAPABILITIES__COMPOSE_MULTIPLE_OFFERS');
  for (const required of [
    'crm-state',
    'consent-and-suppression',
    'message-preparation',
    'revenue-attribution'
  ]) {
    assert.ok(summary.uniqueReusableCapabilities.includes(required), required);
  }
});

test('cold outreach explicitly carries provenance, suppression, deliverability and complaint-risk boundaries', () => {
  const service = getCreatorAiAutomationService('creator-cold-outreach-system');
  assert.ok(service.reusableCapabilities.includes('contact-provenance'));
  assert.ok(service.reusableCapabilities.includes('deliverability-guard'));
  assert.ok(service.reusableCapabilities.includes('suppression'));
  assert.ok(service.deliveryRisks.some(item => /complaint/i.test(item)));
});
