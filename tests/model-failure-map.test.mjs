import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FAILURE_MODES,
  MAX_TOTAL_PENALTY,
  SYSTEMATIC_THRESHOLD,
  candidateKey,
  compileModelFailureMap,
  failurePenaltyFor,
  normalizeFailureObservation
} from '../src/model-failure-map.mjs';

const observation = (over = {}) => ({
  provider: 'acme',
  model: 'acme-large',
  taskClass: 'research',
  failureMode: 'FABRICATED_CITATION',
  observationSource: 'INDEPENDENT_VERIFIER',
  observationId: 'obs-1',
  observedAt: '2026-09-10T00:00:00.000Z',
  ...over
});

const many = (count, over = {}) => Array.from({ length: count }, (_, i) =>
  observation({ observationId: `obs-${i + 1}`, ...over }));

test('an observation needs a provider, model, task class, recognized mode, source, identity and time', () => {
  assert.equal(normalizeFailureObservation(observation()).ok, true);
  for (const [field, codes] of [
    ['provider', 'observation-provider-required'],
    ['model', 'observation-model-required'],
    ['taskClass', 'observation-task-class-required'],
    ['observationId', 'observation-identity-required']
  ]) {
    const out = normalizeFailureObservation(observation({ [field]: '' }));
    assert.equal(out.ok, false);
    assert.ok(out.reasonCodes.includes(codes), `${field} -> ${out.reasonCodes}`);
  }
  assert.ok(normalizeFailureObservation(observation({ failureMode: 'VIBES_WERE_OFF' }))
    .reasonCodes.includes('recognized-failure-mode-required'));
  assert.ok(normalizeFailureObservation(observation({ observationSource: 'A_FEELING' }))
    .reasonCodes.includes('recognized-observation-source-required'));
  assert.ok(normalizeFailureObservation(observation({ observedAt: 'yesterday' }))
    .reasonCodes.includes('observation-timestamp-required'));
});

test('an invented failure mode cannot attach a routing penalty to a provider', () => {
  // The vocabulary is closed so the map records what a model did rather than
  // what a caller thinks of it.
  const out = compileModelFailureMap({ observations: [observation({ failureMode: 'SLOW_AND_ANNOYING' })] });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('recognized-failure-mode-required'));
  assert.ok(FAILURE_MODES.length > 0);
});

test('two observations are an anecdote and three are a pattern', () => {
  const two = compileModelFailureMap({ observations: many(2) });
  assert.equal(two.findings[0].verdict, 'OBSERVED');
  assert.equal(two.findings[0].routingPenalty, 0);
  assert.equal(two.counts.systematic, 0);

  const three = compileModelFailureMap({ observations: many(SYSTEMATIC_THRESHOLD) });
  assert.equal(three.findings[0].verdict, 'SYSTEMATIC');
  assert.ok(three.findings[0].routingPenalty > 0);
  assert.equal(three.counts.systematic, 1);
});

test('replaying the same observation cannot manufacture a pattern', () => {
  // Ten copies of one receipt is one fact. Without this, any loop that
  // re-reads its own history promotes an anecdote by running twice.
  const replayed = Array.from({ length: 10 }, () => observation({ observationId: 'the-same-one' }));
  const out = compileModelFailureMap({ observations: replayed });
  assert.equal(out.findings[0].independentObservations, 1);
  assert.equal(out.findings[0].verdict, 'OBSERVED');
  assert.equal(out.findings[0].routingPenalty, 0);
});

test('a model reporting its own failure never establishes a systematic one', () => {
  const selfReported = many(6, { observationSource: 'MODEL_SELF_REPORT' });
  const out = compileModelFailureMap({ observations: selfReported });
  assert.equal(out.findings[0].verdict, 'OBSERVED');
  assert.equal(out.findings[0].independentObservations, 0);
  assert.equal(out.findings[0].selfReportedObservations, 6);
  assert.equal(out.findings[0].routingPenalty, 0);
});

test('a failure on one task class does not penalize the model everywhere', () => {
  // The whole point: a model that fabricates citations in research is still a
  // fine model for classification, and an averaged reliability score loses that.
  const map = compileModelFailureMap({ observations: many(4) });
  const research = failurePenaltyFor(map, { provider: 'acme', model: 'acme-large', taskClass: 'research' });
  const extraction = failurePenaltyFor(map, { provider: 'acme', model: 'acme-large', taskClass: 'classification' });
  assert.ok(research.penalty > 0);
  assert.deepEqual(research.systematicModes.map(mode => mode.failureMode), ['FABRICATED_CITATION']);
  assert.equal(extraction.penalty, 0);
  assert.deepEqual(extraction.systematicModes, []);
});

test('one provider failing does not penalize a different provider or model', () => {
  const map = compileModelFailureMap({ observations: many(4) });
  assert.equal(failurePenaltyFor(map, { provider: 'other', model: 'acme-large', taskClass: 'research' }).penalty, 0);
  assert.equal(failurePenaltyFor(map, { provider: 'acme', model: 'acme-small', taskClass: 'research' }).penalty, 0);
});

test('an observed-but-not-systematic mode is visible without moving a route', () => {
  const map = compileModelFailureMap({ observations: many(2) });
  const advice = failurePenaltyFor(map, { provider: 'acme', model: 'acme-large', taskClass: 'research' });
  assert.equal(advice.penalty, 0);
  assert.deepEqual(advice.observedModes, ['FABRICATED_CITATION']);
  // And it must not be reported as systematic. A zero penalty is only half the
  // promise: a caller reading systematicModes would otherwise be told this
  // model does something it has merely been seen doing twice.
  assert.deepEqual(advice.systematicModes, []);
});

test('the penalty is bounded no matter how much evidence accumulates', () => {
  // An unbounded penalty is a blacklist by arithmetic. A model with a long
  // history of one failure mode must stay routable for everything else.
  const heavy = [];
  for (const mode of FAILURE_MODES) {
    for (let i = 0; i < 40; i += 1) {
      heavy.push(observation({ failureMode: mode, observationId: `${mode}-${i}` }));
    }
  }
  const map = compileModelFailureMap({ observations: heavy });
  const advice = failurePenaltyFor(map, { provider: 'acme', model: 'acme-large', taskClass: 'research' });
  assert.ok(advice.penalty > 0);
  assert.ok(advice.penalty <= MAX_TOTAL_PENALTY, `penalty ${advice.penalty} exceeded the cap`);
  for (const finding of map.findings) assert.ok(finding.routingPenalty <= 0.4);
});

test('candidate keys are case-insensitive on provider and exact on model', () => {
  assert.equal(candidateKey('ACME', 'acme-large'), candidateKey('acme', 'acme-large'));
  assert.notEqual(candidateKey('acme', 'acme-Large'), candidateKey('acme', 'acme-large'));
});

test('a malformed or absent map advises nothing rather than throwing', () => {
  for (const bad of [null, undefined, {}, { ok: false }, { ok: true }]) {
    const advice = failurePenaltyFor(bad, { provider: 'acme', model: 'acme-large', taskClass: 'research' });
    assert.equal(advice.penalty, 0);
    assert.deepEqual(advice.systematicModes, []);
  }
  const map = compileModelFailureMap({ observations: many(4) });
  assert.equal(failurePenaltyFor(map, {}).penalty, 0);
  assert.equal(failurePenaltyFor(map, { provider: 'acme', model: 'acme-large' }).penalty, 0);
});

test('the map holds no authority and carries a zero effect ledger', () => {
  const map = compileModelFailureMap({ observations: many(4) });
  assert.equal(map.businessEffectAuthority, 'NONE');
  assert.equal(map.externalEffectLedger.providerCalls, 0);
  assert.equal(map.externalEffectLedger.spendCents, 0);
  assert.match(map.truthBoundary, /CANNOT_DISABLE_A_MODEL_CALL_A_PROVIDER_OR_GRANT_AUTHORITY/);
  assert.match(map.truthBoundary, /NOT_THAT_THE_MODEL_ALWAYS_FAILS/);
  assert.equal(failurePenaltyFor(map, { provider: 'acme', model: 'acme-large', taskClass: 'research' }).businessEffectAuthority, 'NONE');
});

test('the digest changes when a verdict changes and not when order does', () => {
  const a = compileModelFailureMap({ observations: many(4) });
  const shuffled = compileModelFailureMap({ observations: [...many(4)].reverse() });
  assert.equal(a.mapDigest, shuffled.mapDigest);
  const changed = compileModelFailureMap({ observations: many(2) });
  assert.notEqual(a.mapDigest, changed.mapDigest);
});

// --- integration with the router the map exists to advise ---

test('a systematic failure moves the route away from an otherwise better model', async () => {
  const { routeModel } = await import('../src/agent-model-router.mjs');
  const candidates = [
    { provider: 'acme', model: 'acme-large', taskClasses: ['research'] },
    { provider: 'other', model: 'other-mid', taskClasses: ['research'] }
  ];
  const benchmarks = [
    { provider: 'acme', model: 'acme-large', taskClass: 'research', quality: 0.92, reliability: 0.9, latencyScore: 0.9, economicImpact: 0.8, costEfficiency: 0.8, evidenceConfidence: 0.9 },
    { provider: 'other', model: 'other-mid', taskClass: 'research', quality: 0.78, reliability: 0.8, latencyScore: 0.8, economicImpact: 0.7, costEfficiency: 0.7, evidenceConfidence: 0.9 }
  ];
  const deterministic = () => 0.99; // never explore

  const withoutMap = routeModel({ taskClass: 'research', candidates, benchmarks, random: deterministic });
  assert.equal(withoutMap.ok, true);
  assert.equal(withoutMap.selected.model, 'acme-large', 'the stronger benchmark wins when nothing is known against it');
  assert.equal(withoutMap.failurePenalty, 0);

  const failureMap = compileModelFailureMap({ observations: many(6) });
  const withMap = routeModel({ taskClass: 'research', candidates, benchmarks, random: deterministic, failureMap });
  assert.equal(withMap.ok, true);
  assert.equal(withMap.selected.model, 'other-mid', 'a systematic research failure must cost the stronger model this route');
  assert.deepEqual(withMap.knownFailureModes, []);

  // ...and only for the task class it was observed on.
  const elsewhere = routeModel({ taskClass: 'classification', candidates: candidates.map(c => ({ ...c, taskClasses: ['classification'] })), benchmarks: benchmarks.map(b => ({ ...b, taskClass: 'classification' })), random: deterministic, failureMap });
  assert.equal(elsewhere.selected.model, 'acme-large', 'a research failure must not follow the model into classification');
});

test('an absent failure map leaves routing exactly as it was', async () => {
  const { routeModel } = await import('../src/agent-model-router.mjs');
  const candidates = [{ provider: 'acme', model: 'acme-large', taskClasses: ['research'] }];
  const benchmarks = [{ provider: 'acme', model: 'acme-large', taskClass: 'research', quality: 0.9, reliability: 0.9, latencyScore: 0.9, economicImpact: 0.8, costEfficiency: 0.8, evidenceConfidence: 0.9 }];
  const bare = routeModel({ taskClass: 'research', candidates, benchmarks, random: () => 0.99 });
  const nulled = routeModel({ taskClass: 'research', candidates, benchmarks, random: () => 0.99, failureMap: null });
  assert.equal(bare.score, nulled.score);
  assert.equal(bare.selected.model, nulled.selected.model);
});
