import test from 'node:test';
import assert from 'node:assert/strict';
import {
  composeDecisionPacket,
  attachRegretAndOptionValue,
  recordPacketOutcomeForecast,
  closePacketLoop,
  derivePacketAsPrivateRecord,
  exportOrDeleteDecisionHistory,
  decisionClosure,
  decisionTiming,
  stressTestRecommendation,
  NO_RECOMMENDATION_VALUE_BOUNDARY,
  FOUNDER_REMAINS_CHOOSER
} from '../src/personal-civilization-decision-loop.mjs';
import { normalizePrivateRecord } from '../src/personal-civilization-core.mjs';

// This module composes the reality calibration ledger and the private core
// into one loop: a decision packet that never collapses a genuine value
// tradeoff into a winner, and a private record of that decision that cannot
// outlive the source record it was built from. Both guarantees are cheap to
// silently break in review -- a comparison that "helpfully" picks a favorite
// anyway, or a summary derived with no provenance -- so the tests below spend
// their weight there.

const OWNER = { subject: 'FOUNDER', grant: 'PRIVATE_LIFE_STATE', issuedAt: '2026-09-08T00:00:00.000Z' };
const AT = '2026-09-08T00:00:00.000Z';

const dominatedOptions = () => ([
  { name: 'stay', scores: { meaning: 0.8, financial_cost: 0.2 } },
  { name: 'move', scores: { meaning: 0.3, financial_cost: 0.9 } }
]);

const tradeoffOptions = () => ([
  { name: 'stay', scores: { meaning: 0.8, financial_cost: 0.2 } },
  { name: 'move', scores: { meaning: 0.3, financial_cost: 0.1 } }
]);

// ---- The packet never collapses materially different options -------------

test('every materially distinct option is reported, not only the winner', () => {
  const built = composeDecisionPacket({ decision: 'stay or move', options: dominatedOptions(), now: AT });
  assert.equal(built.ok, true);
  assert.deepEqual(built.packet.materiallyDistinctOptions.sort(), ['move', 'stay']);
  assert.equal(built.packet.outcomeDistributions.length, 2,
    'the packet must carry an outcome-distribution slot for every option, not only the recommended one');
});

test('a clear factual winner is recommended when one option dominates on every compared dimension', () => {
  const built = composeDecisionPacket({ decision: 'stay or move', options: dominatedOptions(), now: AT });
  assert.equal(built.packet.recommendation, 'stay');
  assert.equal(built.packet.recommendationIsValueBoundary, false);
});

// ---- LOAD-BEARING: a genuine value tradeoff yields no recommendation -----

test('a genuine value tradeoff with no dominating option yields NO_RECOMMENDATION__VALUE_BOUNDARY_REACHED and picks no winner', () => {
  const built = composeDecisionPacket({ decision: 'stay or move', options: tradeoffOptions(), now: AT });
  assert.equal(built.ok, true);
  assert.equal(built.packet.recommendation, NO_RECOMMENDATION_VALUE_BOUNDARY,
    'the exact terminal string must be produced, not a paraphrase');
  assert.equal(built.packet.recommendation, 'NO_RECOMMENDATION__VALUE_BOUNDARY_REACHED');
  assert.equal(built.packet.recommendationIsValueBoundary, true);
  // Both options must still be present -- a value boundary is not permission
  // to quietly drop one option from the packet.
  assert.deepEqual(built.packet.materiallyDistinctOptions.sort(), ['move', 'stay']);
  assert.ok(built.packet.tradeoffs.length > 0, 'the underlying tradeoff must still be reported');
});

test('the packet always states the founder remains the chooser, on every recommendation shape', () => {
  const dominated = composeDecisionPacket({ decision: 'stay or move', options: dominatedOptions(), now: AT });
  const boundary = composeDecisionPacket({ decision: 'stay or move', options: tradeoffOptions(), now: AT });
  assert.equal(dominated.packet.sovereigntyStatement, FOUNDER_REMAINS_CHOOSER);
  assert.equal(boundary.packet.sovereigntyStatement, FOUNDER_REMAINS_CHOOSER);
  assert.match(dominated.packet.sovereigntyStatement, /FOUNDER REMAINS THE CHOOSER/);
  assert.match(boundary.packet.sovereigntyStatement, /ACQUIRES NO AUTHORITY/);
});

test('the packet never produces a total across incommensurable dimensions', () => {
  const built = composeDecisionPacket({ decision: 'stay or move', options: tradeoffOptions(), now: AT });
  assert.match(built.packet.noTotal, /NO WEIGHTED TOTAL IS PRODUCED/);
  assert.equal(Object.hasOwn(built.packet, 'totalScore'), false);
});

// ---- Malformed decision-packet inputs are refused with reason codes ------

test('a decision packet with fewer than two options is refused', () => {
  const built = composeDecisionPacket({ decision: 'stay or move', options: [{ name: 'stay', scores: {} }], now: AT });
  assert.equal(built.ok, false);
  assert.equal(built.status, 'DECISION_PACKET_INVALID');
  assert.ok(built.reasonCodes.includes('at-least-two-materially-distinct-options-required'));
});

test('a decision packet with no decision statement is refused', () => {
  const built = composeDecisionPacket({ options: dominatedOptions(), now: AT });
  assert.equal(built.ok, false);
  assert.ok(built.reasonCodes.includes('decision-statement-required'));
});

test('a decision packet with an invalid clock is refused', () => {
  const built = composeDecisionPacket({ decision: 'x', options: dominatedOptions(), now: 'not-a-date' });
  assert.equal(built.ok, false);
  assert.ok(built.reasonCodes.includes('valid-clock-required'));
});

// ---- Outcome vs decision quality stay separate ----------------------------

test('a good outcome from a poorly considered decision is not scored as a good decision', () => {
  const packet = composeDecisionPacket({ decision: 'stay or move', options: dominatedOptions(), now: AT }).packet;
  const recorded = recordPacketOutcomeForecast({
    packet, chosenOption: 'stay',
    probabilities: { yes: 0.5, no: 0.5 },
    evidenceCutoff: AT, at: AT,
    // Deliberately no assumptions recorded -- the decision did not weigh the
    // available cost-of-living evidence.
    assumptions: []
  });
  assert.equal(recorded.ok, true);

  const closed = closePacketLoop({
    packet, chosenForecast: recorded.forecast, outcome: 'yes', observedAt: '2027-01-01T00:00:00.000Z',
    availableAtTime: ['cost-of-living data was available and ignored']
  });
  assert.equal(closed.ok, true);
  assert.equal(closed.score.observed, 'yes', 'the outcome was good');
  assert.equal(closed.decisionQuality.quality, 'IMPROVABLE',
    'the good outcome must not launder a decision that ignored available evidence');
  assert.equal(closed.decisionQuality.outcomeWas, 'yes');
  assert.match(closed.separation, /NOT_ON_THE_OUTCOME/);
});

test('a well-considered decision that weighed its options and available evidence scores as well made, independent of the outcome', () => {
  const packet = composeDecisionPacket({ decision: 'stay or move', options: tradeoffOptions(), now: AT }).packet;
  const recorded = recordPacketOutcomeForecast({
    packet, chosenOption: 'move',
    probabilities: { yes: 0.4, no: 0.6 },
    evidenceCutoff: AT, at: AT,
    assumptions: ['cost-of-living data considered']
  });
  const closed = closePacketLoop({
    packet, chosenForecast: recorded.forecast, outcome: 'no', observedAt: '2027-01-01T00:00:00.000Z',
    availableAtTime: ['cost-of-living data considered']
  });
  assert.equal(closed.decisionQuality.quality, 'WELL_MADE',
    'both packet options were weighed and the cited evidence was used -- a bad outcome must not make this a bad decision');
  assert.equal(closed.decisionQuality.outcomeWas, 'no');
});

// ---- The forecast cannot be rewritten after its outcome is known ---------

test('the ledger seal holds through this module\'s composition: a tampered forecast refuses to close the loop', () => {
  const packet = composeDecisionPacket({ decision: 'stay or move', options: dominatedOptions(), now: AT }).packet;
  const recorded = recordPacketOutcomeForecast({
    packet, chosenOption: 'stay', probabilities: { yes: 0.3, no: 0.7 }, evidenceCutoff: AT, at: AT
  });
  const doctored = { ...recorded.forecast, probabilities: { yes: 0.99, no: 0.01 } };
  const closed = closePacketLoop({ packet, chosenForecast: doctored, outcome: 'yes', observedAt: '2027-01-01T00:00:00.000Z' });
  assert.equal(closed.ok, false);
  assert.equal(closed.status, 'PACKET_OUTCOME_NOT_SCORABLE');
  assert.equal(closed.scoreFailure.status, 'FORECAST_TAMPERED');
});

test('a chosen option must be one of the packet\'s own options', () => {
  const packet = composeDecisionPacket({ decision: 'stay or move', options: dominatedOptions(), now: AT }).packet;
  const recorded = recordPacketOutcomeForecast({
    packet, chosenOption: 'emigrate to the moon', probabilities: { yes: 0.5, no: 0.5 }, evidenceCutoff: AT, at: AT
  });
  assert.equal(recorded.ok, false);
  assert.ok(recorded.reasonCodes.includes('chosen-option-not-among-packet-options'));
});

// ---- LOAD-BEARING: a deleted decision does not survive in any summary ----

test('a deleted decision does not survive inside a derived summary', () => {
  const source = normalizePrivateRecord({
    kind: 'LIFE_EVENT', body: 'considered a relocation for work', occurredAt: '2026-09-01T00:00:00.000Z'
  });
  assert.equal(source.ok, true);
  let store = [source.record];

  const packet = composeDecisionPacket({ decision: 'stay or move', options: dominatedOptions(), now: AT }).packet;
  const derived = derivePacketAsPrivateRecord({
    store, packet, sourceRecordIds: [source.record.id], authorization: OWNER, now: AT
  });
  assert.equal(derived.ok, true);
  store = derived.store;
  assert.equal(store.length, 2, 'the source record and the derived decision summary are both present');

  const closure = decisionClosure(store, [source.record.id]);
  assert.ok(closure.has(derived.record.id),
    'the decision summary must be reachable from its source record, or deletion cannot find it');

  const deleted = exportOrDeleteDecisionHistory({ mode: 'DELETE', store, ids: [source.record.id], authorization: OWNER, now: AT });
  assert.equal(deleted.ok, true);
  assert.deepEqual(new Set(deleted.deletedIds), new Set([source.record.id, derived.record.id]));
  assert.equal(deleted.remainingCount, 0);

  const exported = exportOrDeleteDecisionHistory({
    mode: 'EXPORT', store: deleted.store, authorization: OWNER,
    destination: '/home/mohamed/.uberbond-private/export.json', now: AT
  });
  assert.equal(exported.ok, true);
  assert.equal(exported.recordCount, 0);
  assert.equal(exported.records.some(row => row.id === derived.record.id), false,
    'the derived decision summary must not survive inside a post-deletion export');
  assert.equal(JSON.stringify(exported).includes(packet.decision), false,
    'the deleted decision text must not leak into any exported summary');
});

test('a decision summary derived with no source-record provenance is refused, because it could never be found by deletion', () => {
  const packet = composeDecisionPacket({ decision: 'stay or move', options: dominatedOptions(), now: AT }).packet;
  const derived = derivePacketAsPrivateRecord({ store: [], packet, sourceRecordIds: [], authorization: OWNER, now: AT });
  assert.equal(derived.ok, false);
  assert.ok(derived.reasonCodes.includes('packet-must-cite-source-private-records'));
});

test('deriving or exporting or deleting private decision state without founder authorization is refused', () => {
  const source = normalizePrivateRecord({ kind: 'LIFE_EVENT', body: 'x', occurredAt: AT });
  const packet = composeDecisionPacket({ decision: 'x', options: dominatedOptions(), now: AT }).packet;

  const derived = derivePacketAsPrivateRecord({ store: [source.record], packet, sourceRecordIds: [source.record.id], authorization: null, now: AT });
  assert.equal(derived.ok, false);
  assert.equal(derived.status, 'PACKET_PRIVATE_RECORD_FOUNDER_AUTHORITY_REQUIRED');

  const exported = exportOrDeleteDecisionHistory({ mode: 'EXPORT', store: [source.record], authorization: { subject: 'SOMEONE_ELSE' }, destination: '/home/mohamed/x.json', now: AT });
  assert.equal(exported.ok, false);

  const deleted = exportOrDeleteDecisionHistory({ mode: 'DELETE', store: [source.record], ids: [source.record.id], authorization: null, now: AT });
  assert.equal(deleted.ok, false);
});

test('an unknown export/delete mode is refused', () => {
  const result = exportOrDeleteDecisionHistory({ mode: 'DESTROY_EVERYTHING', store: [], authorization: OWNER });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('mode-must-be-export-or-delete'));
});

// ---- Composition, not reimplementation ------------------------------------

test('attachRegretAndOptionValue composes regretGeometry per option without collapsing them into one figure', () => {
  const packet = composeDecisionPacket({ decision: 'stay or move', options: dominatedOptions(), now: AT }).packet;
  const attached = attachRegretAndOptionValue(packet, [
    { option: 'stay', expectedValue: 0.7, worstCase: 'stagnation', recoveryTime: 'months' },
    { option: 'move', expectedValue: 0.4, worstCase: 'failed relocation', recoveryTime: 'years' },
    { option: 'not-a-packet-option', expectedValue: 1 }
  ]);
  assert.equal(attached.ok, true);
  assert.equal(attached.packet.regretGeometryByOption.length, 2,
    'an option not on the packet must not be silently attached');
  for (const row of attached.packet.regretGeometryByOption) {
    assert.equal(row.combinedScore, null, 'regret geometry must not collapse expected value and worst case into one figure');
  }
});

test('decisionTiming composes valueOfInformation, decisionShelfLife and predictionHalfLife rather than reimplementing them', () => {
  const timing = decisionTiming({
    decision: 'stay or move', wouldChangeChoice: true, acquisitionCost: 2, delayCost: 1,
    option: 'move', availability: 'EXPIRING', expiresAround: 'end of quarter',
    forecastClaim: 'moving increases income', forecastAssumptions: ['x'],
    invalidationTriggers: ['offer withdrawn'], expectedHalfLife: 'one quarter'
  });
  assert.equal(timing.ok, true);
  assert.equal(timing.valueOfInformation.status, 'INFORMATION_WORTH_ACQUIRING');
  assert.equal(timing.shelfLife.urgent, true);
  assert.equal(timing.predictionHalfLife.status, 'HALF_LIFE_RECORDED');
});

test('decisionTiming reports information not worth acquiring when it would not change the choice, without inventing a cost figure', () => {
  const timing = decisionTiming({ decision: 'x', wouldChangeChoice: false, option: 'stay', availability: 'AVAILABLE_NOW' });
  assert.equal(timing.valueOfInformation.status, 'INFORMATION_NOT_WORTH_ACQUIRING');
  assert.equal(Object.hasOwn(timing.valueOfInformation, 'totalCost'), false);
});

test('stressTestRecommendation composes adversarialFutureSelves and goodhartRisk against the packet\'s own recommendation', () => {
  const packet = composeDecisionPacket({ decision: 'stay or move', options: dominatedOptions(), now: AT }).packet;
  const stressed = stressTestRecommendation({
    packet,
    attacks: [
      { from: 'risk-averse future self', attacks: 'staying assumes the current job stays stable', survived: false },
      { from: 'ambitious future self', attacks: 'financial cost alone should not decide this', survived: true }
    ],
    proxyMetric: 'financial_cost',
    standsFor: 'long-term security',
    optimizedBy: ['minimizing spend even where it forecloses future income']
  });
  assert.equal(stressed.ok, true);
  assert.deepEqual(stressed.adversarial.invariants, ['financial cost alone should not decide this']);
  assert.equal(stressed.goodhart.status, 'PROXY_DIVERGENCE_POSSIBLE');
});

test('a decision packet cites the exact forecast for each option it was supplied, and reports missing forecasts rather than dropping the option', () => {
  const built = composeDecisionPacket({
    decision: 'stay or move',
    options: dominatedOptions(),
    forecasts: { stay: { status: 'FORECAST_BUILT', estimate: 0.6 } },
    now: AT
  });
  const stayRow = built.packet.outcomeDistributions.find(row => row.option === 'stay');
  const moveRow = built.packet.outcomeDistributions.find(row => row.option === 'move');
  assert.equal(stayRow.forecastStatus, 'FORECAST_BUILT');
  assert.equal(moveRow.forecastStatus, 'NO_FORECAST_SUPPLIED');
  assert.equal(moveRow.forecast, null);
});
