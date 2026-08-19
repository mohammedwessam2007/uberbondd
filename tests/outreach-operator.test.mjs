import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEvidenceLeadSearch,
  buildDetailedComparison,
  buildOwnerCopilotPlan,
  buildOwnerEdgePlan,
  buildOwnerUseCaseScorecard,
  buildSenderRoutingPlan
} from '../src/outreach-operator.mjs';

test('multi-sector comparison covers functional dimensions and industry fit with explicit boundaries', () => {
  const comparison = buildDetailedComparison({ externalProvider: 'gmail-api', asOf: '2026-08-12T00:00:00.000Z' });
  assert.equal(comparison.functionalSectors.length, 8);
  assert.equal(comparison.functionalSectors.reduce((sum, sector) => sum + sector.dimensions.length, 0), 37);
  assert.equal(comparison.industrySectors.length, 15);
  assert.equal(comparison.aggregates.functional.scores.uberbond, 4.05);
  assert.equal(comparison.aggregates.functional.scores.instantly, 3.21);
  assert.equal(comparison.aggregates.industry.scores.uberbond, 4.25);
  assert.equal(comparison.aggregates.industry.scores.instantly, 3.39);
  assert.equal(comparison.functionalSectors.find(sector => sector.id === 'analytics_and_commercial').winner, 'UberBond');
  assert.equal(comparison.functionalSectors.find(sector => sector.id === 'sender_and_deliverability').winner, 'Instantly');
  assert.equal(comparison.industrySectors.find(sector => sector.id === 'website_qa_operations').winner, 'UberBond');
  assert.equal(comparison.industrySectors.find(sector => sector.id === 'multi_client_agencies').winner, 'Instantly');
  for (const sector of comparison.functionalSectors) {
    for (const dimension of sector.dimensions) {
      assert(dimension.instantly >= 0 && dimension.instantly <= 5);
      assert(dimension.uberbond >= 0 && dimension.uberbond <= 5);
      assert.equal(dimension.winner, dimension.uberbond === dimension.instantly ? 'Tie' : dimension.uberbond > dimension.instantly ? 'UberBond' : 'Instantly');
    }
  }
  assert(comparison.limitations.some(item => /warmup network/i.test(item)));
});

test('owner-use-case scorecard makes the weighted objective explicit and UberBond wins it', () => {
  const scorecard = buildOwnerUseCaseScorecard({ externalProvider: 'gmail-api', asOf: '2026-08-12T00:00:00.000Z' });
  assert.equal(scorecard.scores.uberbondWins, true);
  assert.equal(scorecard.scores.uberbond, 4.48);
  assert.equal(scorecard.scores.instantly, 2.63);
  assert.equal(scorecard.scores.margin, 1.85);
  assert(scorecard.wins.includes('payment_continuity'));
  assert(scorecard.limitations.some(item => /warmup/i.test(item)));
});

test('evidence search ranks observed prospects and excludes suppressed records without inventing contacts', () => {
  const result = buildEvidenceLeadSearch({
    suppressions: [{ value: 'blocked.example', reason: 'owner suppression' }],
    prospects: [
      {
        id: 'high', company: 'High Evidence Clinic', domain: 'high.example', country: 'GB', status: 'ready', score: { total: 90 },
        contact: { email: 'careers@high.example', verified: 'valid' }, tags: ['medical'],
        issue: { title: 'Booking error', confidence: 0.95, evidenceUrl: 'https://high.example/book', evidenceExcerpt: 'The booking button failed.' }
      },
      {
        id: 'blocked', company: 'Blocked Clinic', domain: 'blocked.example', country: 'GB', status: 'ready', score: { total: 99 },
        contact: { email: 'careers@blocked.example', verified: 'valid' }, issue: { title: 'Issue', confidence: 1, evidenceUrl: 'https://blocked.example', evidenceExcerpt: 'Observed.' }
      },
      { id: 'missing', company: 'Missing Evidence', domain: 'missing.example', country: 'GB', status: 'new', score: { total: 70 }, contact: {} }
    ],
    query: { country: 'GB', researchedOnly: true, hasEmail: true, tags: ['medical'] },
    limit: 10
  });
  assert.equal(result.totalMatched, 1);
  assert.equal(result.results[0].id, 'high');
  assert.equal(result.results[0].evidence.readiness, 'observed');
  assert.match(result.policy, /no invented contacts/);
});

test('sender mesh routes by sticky assignment, provider match, health and capacity without reserving a sender', () => {
  const plan = buildSenderRoutingPlan({
    now: '2026-08-12T12:00:00.000Z',
    campaigns: [{ id: 'campaign', sequence: { settings: { stickySendingAccount: true, providerMatching: 'same_esp' } } }],
    accounts: [
      { slot: 'A', email: 'mohamed@gmail.com', provider: 'gmail', connected: true, dailyCap: 20 },
      { slot: 'B', email: 'mohamed@outlook.com', provider: 'outlook', connected: true, dailyCap: 20 }
    ],
    senderHealth: [{ inbox: 'B', paused: true, pauseReason: 'complaint' }],
    prospects: [
      { id: 'gmail-lead', campaignId: 'campaign', inbox: 'A', contact: { email: 'careers@clinic.example' }, sequenceState: { status: 'active' } },
      { id: 'outlook-lead', campaignId: 'campaign', inbox: 'B', contact: { email: 'owner@outlook.com' }, sequenceState: { status: 'active' } }
    ]
  });
  assert.equal(plan.assignments.find(item => item.prospectId === 'gmail-lead').slot, 'A');
  assert.equal(plan.assignments.find(item => item.prospectId === 'outlook-lead').blocked, true);
  assert.match(plan.assignments.find(item => item.prospectId === 'outlook-lead').reason, /sender-paused/);
  assert.match(plan.policy, /no provider call/);
});

test('edge plan exposes conservative deliverability, evidence supply and owner-copilot controls', () => {
  const edge = buildOwnerEdgePlan({
    now: '2026-08-12T12:00:00.000Z',
    accounts: [{ slot: 'A', email: 'mohamed@gmail.com', provider: 'gmail', connected: true, authentication: { spf: true, dkim: true, dmarc: true }, createdAt: '2026-08-10T12:00:00.000Z' }],
    senderHealth: [{ inbox: 'A', paused: false }],
    prospects: [{ id: 'p1', company: 'Observed Clinic', domain: 'clinic.example', status: 'ready', score: { total: 88 }, contact: { email: 'careers@clinic.example', verified: 'valid' }, issue: { title: 'Booking issue', confidence: 0.9, evidenceUrl: 'https://clinic.example/book', evidenceObservedAt: '2026-08-11T12:00:00.000Z' } }],
    campaigns: [{ id: 'c1', sequence: { settings: { providerMatching: 'same_esp' } } }],
    inbox: [{ latestReply: { classification: { label: 'positive' } } }]
  });
  assert.equal(edge.deliverability.summary.authenticationObserved, 1);
  assert.equal(edge.evidenceSupply.summary.readyForOwnerReview, 1);
  assert.equal(edge.copilot.summary.externalEffects, 0);
  assert(edge.upgrades.some(item => item.category === 'warmup' && item.status === 'edge-covered'));
  assert.match(edge.policy, /no provider call/);
});

test('copilot keeps sending, negotiation and payment outside autonomous action', () => {
  const plan = buildOwnerCopilotPlan({ health: { uncertain: 1 }, prospects: [{ id: 'ready', status: 'ready' }] });
  assert.equal(plan.next[0].action, 'reconcile-uncertain-effects');
  assert.equal(plan.actions.find(item => item.id === 'send-message').status, 'owner-and-v9-required');
  assert.equal(plan.actions.find(item => item.id === 'negotiate-or-quote').status, 'owner-required');
  assert.equal(plan.actions.find(item => item.id === 'mark-payment-cleared').status, 'proof-required');
});
