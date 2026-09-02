import test from 'node:test';
import assert from 'node:assert/strict';
import {
  auditHumanWriting,
  buildProposalGenerationBrief,
  inspectProposalEvidence,
  scoreProposalReadiness,
  summarizeProposalOutcome
} from '../src/proposal-acceptance-engine.mjs';

const packet = {
  buyerName: 'Jordan',
  companyName: 'Northstar HVAC Agency',
  stakeholderRole: 'Owner',
  decisionAuthorityConfidence: 'HIGH',
  problemEvidence: 'lost booked jobs after attribution breaks',
  desiredOutcome: 'find and quantify the leak before changing campaigns',
  scope: 'Audit lead path from ad click to booked job and produce an evidence pack.',
  timeline: '5 business days',
  price: '450',
  currency: 'USD',
  nextStep: 'Approve the fixed-scope sprint',
  proofRefs: ['evidence://lead-path-sample-1'],
  knownObjections: ['We already use call tracking.'],
  buyerVocabulary: ['booked jobs', 'attribution']
};

test('incomplete discovery blocks proposal generation', () => {
  const result = inspectProposalEvidence({ companyName: 'X' });
  assert.equal(result.ok, false);
  assert.ok(result.missingFields.includes('problemEvidence'));
  const brief = buildProposalGenerationBrief({ companyName: 'X' });
  assert.equal(brief.status, 'DISCOVERY_REQUIRED');
});

test('generation brief is buyer-first and never grants send authority', () => {
  const result = buildProposalGenerationBrief(packet);
  assert.equal(result.ok, true);
  assert.match(result.brief.opening, /buyer-specific problem/i);
  assert.equal(result.businessEffectAuthority, 'NONE');
  assert.equal(result.brief.pricing.amount, '450');
});

test('human-writing audit catches common generic AI filler', () => {
  const result = auditHumanWriting("I hope this email finds you well. In today's fast-paced landscape, our cutting-edge platform can unlock the power of seamless growth.");
  assert.equal(result.ok, false);
  assert.ok(result.findings.some(item => item.startsWith('ai-slop:')));
  assert.ok(result.score < 100);
});

test('proposal readiness penalizes generic copy with no buyer evidence or next step', () => {
  const result = scoreProposalReadiness({
    packet,
    stakeholderCount: 1,
    proposalText: 'We are excited to revolutionize your business with our cutting-edge solution and unmatched expertise.'
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes('buyer-specific-evidence-not-reflected-in-copy'));
  assert.ok(result.reasons.includes('next-step-not-explicit-in-copy'));
  assert.ok(result.reasons.includes('single-threaded-deal-risk'));
});

test('buyer-specific compact proposal can become a send candidate but still has zero effect authority', () => {
  const copy = `Northstar HVAC Agency is losing booked jobs after attribution breaks between the lead path and scheduling. The goal is to find and quantify that leak before changing campaigns.\n\nWe will audit the path from ad click to booked job, document each break with evidence, and deliver a fixed-scope evidence pack within 5 business days.\n\nThe fixed price is 450 USD.\n\nApprove the fixed-scope sprint to begin.`;
  const result = scoreProposalReadiness({ packet, stakeholderCount: 2, proposalText: copy });
  assert.equal(result.status, 'PROPOSAL_SEND_CANDIDATE');
  assert.equal(result.businessEffectAuthority, 'NONE');
  assert.ok(result.score >= 75);
});

test('a won proposal without cleared money cannot manufacture commercial truth', () => {
  const result = summarizeProposalOutcome({ status: 'WON', revenueCleared: 0, currency: 'USD' });
  assert.equal(result.ok, true);
  assert.equal(result.commercialTruthEligible, false);
});

test('commercial truth eligibility requires won plus cleared revenue and currency', () => {
  const result = summarizeProposalOutcome({
    status: 'WON',
    sentAt: '2026-09-01T00:00:00Z',
    decidedAt: '2026-09-03T00:00:00Z',
    founderMinutes: 5,
    revenueCleared: 450,
    currency: 'USD'
  });
  assert.equal(result.commercialTruthEligible, true);
  assert.equal(result.metrics.daysToDecision, 2);
});
