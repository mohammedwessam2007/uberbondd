import test from 'node:test';
import assert from 'node:assert/strict';
import { eventFromEventHorizonDoctor } from '../src/event-horizon-cognitive-adapter.mjs';

test('healthy Event Horizon emits allocation attention without converting score to demand', () => {
  const event = eventFromEventHorizonDoctor({
    ok: true,
    health: 'EVENT_HORIZON_HEALTHY',
    candidateCount: 5,
    activeExperimentCount: 1,
    champion: { id: 'lead-path-evidence-sprint', decisionScore: 71, state: 'PREPARED_NOT_EXTERNALLY_ACTIVATED' },
    strongestChallenger: { id: 'gcc-einvoice-exception-evidence', decisionScore: 62, state: 'RESEARCH_ONLY' },
    commercialTruth: { realCustomers: 0, clearedRevenueUsd: 0, acceptedDeliveries: 0, retainedCustomers: 0 }
  });
  assert.equal(event.ok, true);
  assert.equal(event.event.kind, 'OPPORTUNITY_CANDIDATE');
  assert.equal(event.event.sourceNodeId, 'event-horizon');
  assert.match(event.event.summary, /customers=0/);
  assert.match(event.event.summary, /not demand or revenue proof/);
});

test('invalid Event Horizon becomes a contradiction instead of an allocation signal', () => {
  const event = eventFromEventHorizonDoctor({ ok: false, health: 'EVENT_HORIZON_INVALID', failures: ['decision-score-mismatch'] });
  assert.equal(event.ok, true);
  assert.equal(event.event.kind, 'CONTRADICTION');
  assert.match(event.event.summary, /route the contradiction for repair/i);
});
