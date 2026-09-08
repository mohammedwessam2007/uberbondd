import test from 'node:test';
import assert from 'node:assert/strict';
import {
  registerHypothesis,
  supersedeHypothesis,
  rankHypotheses,
  assertProvenancedEdge,
  reconcileGraphAfterDeletion,
  HYPOTHESIS_TYPES,
  TRAIT_PROMOTION_FORBIDDEN_FROM
} from '../src/personal-civilization-model-graph.mjs';
import { appendPrivateRecord, deletePrivateRecords } from '../src/personal-civilization-core.mjs';

// This module exists to stop two failures that are invisible from inside a
// system that only checks "did a claim get stored": a competing explanation
// silently promoted into a permanent trait, and a graph claim that outlives
// the private record it was built from. The tests below weight toward those
// two failures rather than toward happy-path coverage of every field.

const OWNER = { subject: 'FOUNDER', grant: 'PRIVATE_LIFE_STATE', issuedAt: '2026-09-08T00:00:00.000Z' };

const event = (store, body, occurredAt = '2026-01-04T00:00:00.000Z') =>
  appendPrivateRecord({
    store, authorization: OWNER, destination: '/home/mohamed/.uberbond-private/life.jsonl',
    input: { kind: 'LIFE_EVENT', body, occurredAt }
  });

// ---- Competing hypotheses, never collapsed ---------------------------------

test('a skill deficit backed by evidence must not be promotable to an immutable TRAIT', () => {
  let store = [];
  const e = event(store, 'froze twice presenting to a large unfamiliar room');
  store = e.store;

  const skillDeficit = registerHypothesis({
    store, hypothesisStore: [], authorization: OWNER,
    subjectId: 'mohamed', dimension: 'public-speaking', type: 'SKILL_DEFICIT',
    statement: 'has not yet built comfort presenting to large unfamiliar rooms',
    derivedFrom: [e.record.id], evidenceStrength: 0.6
  });
  assert.equal(skillDeficit.ok, true);

  const promotion = supersedeHypothesis({
    store: skillDeficit.store, hypothesisStore: skillDeficit.hypothesisStore, authorization: OWNER,
    previousId: skillDeficit.hypothesis.id,
    next: { type: 'TRAIT', statement: 'is bad at public speaking', derivedFrom: [e.record.id], evidenceStrength: 0.9 },
    reason: 'attempting to harden a skill deficit into a permanent trait'
  });

  assert.equal(promotion.ok, false);
  assert.equal(promotion.status, 'HYPOTHESIS_TRAIT_PROMOTION_REFUSED');
  assert.deepEqual(promotion.reasonCodes, ['trait-promotion-from-non-durable-type-refused']);
  assert.equal(promotion.businessEffectAuthority, 'NONE');

  // The refusal must not have written a new hypothesis into the store.
  assert.equal(skillDeficit.hypothesisStore.length, 1);
});

test('an environment effect backed by evidence must not be promotable to an immutable TRAIT', () => {
  let store = [];
  const e = event(store, 'writing stalls every time the open-plan office is loud');
  store = e.store;

  const envEffect = registerHypothesis({
    store, hypothesisStore: [], authorization: OWNER,
    subjectId: 'mohamed', dimension: 'deep-work', type: 'ENVIRONMENT_EFFECT',
    statement: 'concentration drops in the loud open-plan office specifically',
    derivedFrom: [e.record.id], evidenceStrength: 0.7
  });

  const promotion = supersedeHypothesis({
    store: envEffect.store, hypothesisStore: envEffect.hypothesisStore, authorization: OWNER,
    previousId: envEffect.hypothesis.id,
    next: { type: 'TRAIT', statement: 'cannot do deep work', derivedFrom: [e.record.id] },
    reason: 'attempting to harden an environment effect into a trait'
  });

  assert.equal(promotion.ok, false);
  assert.equal(promotion.status, 'HYPOTHESIS_TRAIT_PROMOTION_REFUSED');
});

test('every forbidden-promotion type is actually forbidden, and TRAIT itself is not self-forbidden', () => {
  assert.deepEqual([...TRAIT_PROMOTION_FORBIDDEN_FROM].sort(), [
    'ENVIRONMENT_EFFECT', 'INSUFFICIENT_EXPOSURE', 'SKILL_DEFICIT', 'TEMPORARY_STATE'
  ]);
  assert.equal(TRAIT_PROMOTION_FORBIDDEN_FROM.includes('TRAIT'), false);
});

test('a non-durable hypothesis may still be superseded, as long as the next type is not TRAIT', () => {
  let store = [];
  const e = event(store, 'gave three more talks, each easier than the last');
  store = e.store;

  const skillDeficit = registerHypothesis({
    store, hypothesisStore: [], authorization: OWNER,
    subjectId: 'mohamed', dimension: 'public-speaking', type: 'SKILL_DEFICIT',
    statement: 'has not yet built comfort presenting', derivedFrom: [e.record.id], evidenceStrength: 0.6
  });

  const promoted = supersedeHypothesis({
    store: skillDeficit.store, hypothesisStore: skillDeficit.hypothesisStore, authorization: OWNER,
    previousId: skillDeficit.hypothesis.id,
    next: { type: 'PREFERENCE', statement: 'now finds presenting mostly comfortable', derivedFrom: [e.record.id], evidenceStrength: 0.8 },
    reason: 'three additional talks changed the picture'
  });

  assert.equal(promoted.ok, true);
  assert.equal(promoted.status, 'HYPOTHESIS_SUPERSEDED');
  assert.equal(promoted.next.type, 'PREFERENCE');
});

test('competing hypotheses for the same dimension are preserved side by side, never collapsed to one conclusion', () => {
  let store = [];
  const e1 = event(store, 'skipped the gym three weeks running');
  store = e1.store;
  const e2 = event(store, 'the nearest gym closed for renovation the same three weeks');
  store = e2.store;

  const skillOrHabit = registerHypothesis({
    store, hypothesisStore: [], authorization: OWNER,
    subjectId: 'mohamed', dimension: 'exercise-consistency', type: 'HABIT',
    statement: 'has not built a durable exercise habit', derivedFrom: [e1.record.id], evidenceStrength: 0.3
  });

  const competing = registerHypothesis({
    store: skillOrHabit.store, hypothesisStore: skillOrHabit.hypothesisStore, authorization: OWNER,
    subjectId: 'mohamed', dimension: 'exercise-consistency', type: 'ENVIRONMENT_EFFECT',
    statement: 'the closure of the nearest gym removed the easy option', derivedFrom: [e2.record.id], evidenceStrength: 0.5
  });

  assert.equal(competing.ok, true);
  // Registering the second hypothesis must not have touched the first.
  assert.equal(competing.hypothesisStore.length, 2);
  assert.equal(competing.hypothesisStore[0].status, 'ACTIVE');
  assert.equal(competing.hypothesisStore[1].status, 'ACTIVE');
  assert.deepEqual(
    competing.hypothesisStore.map(row => row.type).sort(),
    ['ENVIRONMENT_EFFECT', 'HABIT']
  );

  const ranked = rankHypotheses({
    hypothesisStore: competing.hypothesisStore, subjectId: 'mohamed', dimension: 'exercise-consistency'
  });
  assert.equal(ranked.competing, true);
  assert.equal(ranked.ranked.length, 2);
});

test('a superseded hypothesis survives with its supersession reason rather than being deleted', () => {
  let store = [];
  const e = event(store, 'first attempt');
  store = e.store;

  const first = registerHypothesis({
    store, hypothesisStore: [], authorization: OWNER,
    subjectId: 'mohamed', dimension: 'cooking', type: 'SELF_STORY',
    statement: 'tells people cooking is not for him', derivedFrom: [e.record.id], evidenceStrength: 0.2
  });

  const superseded = supersedeHypothesis({
    store: first.store, hypothesisStore: first.hypothesisStore, authorization: OWNER,
    previousId: first.hypothesis.id,
    next: { type: 'SKILL_DEFICIT', statement: 'has simply had little practice cooking', derivedFrom: [e.record.id], evidenceStrength: 0.4 },
    reason: 'self-story was not supported once actual practice hours were counted'
  });

  assert.equal(superseded.ok, true);
  assert.equal(superseded.hypothesisStore.length, 2, 'the previous hypothesis must still be present, not removed');

  const stillThere = superseded.hypothesisStore.find(row => row.id === first.hypothesis.id);
  assert.ok(stillThere, 'the superseded hypothesis must still be findable by its original id');
  assert.equal(stillThere.status, 'SUPERSEDED');
  assert.equal(stillThere.supersessionReason, 'self-story was not supported once actual practice hours were counted');
  assert.equal(stillThere.supersededBy, superseded.next.id);

  assert.equal(superseded.next.supersedes, first.hypothesis.id);
  assert.equal(superseded.next.status, 'ACTIVE');
});

test('superseding an already-superseded hypothesis is refused, not silently re-applied', () => {
  let store = [];
  const e = event(store, 'evidence');
  store = e.store;

  const first = registerHypothesis({
    store, hypothesisStore: [], authorization: OWNER,
    subjectId: 'mohamed', dimension: 'x', type: 'UNKNOWN', statement: 'unclear yet',
    derivedFrom: [e.record.id]
  });
  const once = supersedeHypothesis({
    store: first.store, hypothesisStore: first.hypothesisStore, authorization: OWNER,
    previousId: first.hypothesis.id,
    next: { type: 'PREFERENCE', statement: 'now clearer', derivedFrom: [e.record.id] },
    reason: 'first update'
  });

  const twice = supersedeHypothesis({
    store: once.store, hypothesisStore: once.hypothesisStore, authorization: OWNER,
    previousId: first.hypothesis.id,
    next: { type: 'VALUE', statement: 'even more clear', derivedFrom: [e.record.id] },
    reason: 'trying to supersede the already-superseded original'
  });
  assert.equal(twice.ok, false);
  assert.deepEqual(twice.reasonCodes, ['previous-hypothesis-not-active']);
});

// ---- Evidence-weighted ranking ----------------------------------------------

test('a hypothesis with no supporting evidence strength never outranks one that has evidence', () => {
  let store = [];
  const e1 = event(store, 'one offhand remark');
  store = e1.store;
  const e2 = event(store, 'a pattern observed across a dozen occasions', '2026-02-01T00:00:00.000Z');
  store = e2.store;

  // The unscored hypothesis is registered *first*, so plain insertion order
  // would already (coincidentally) put it ahead of nothing -- an insufficient
  // fixture for this claim. The evidenced hypothesis is registered *second*,
  // so only an actual evidence-strength sort -- not registration order, not
  // recency -- can put it first in the ranking.
  const unscored = registerHypothesis({
    store, hypothesisStore: [], authorization: OWNER,
    subjectId: 'mohamed', dimension: 'risk-tolerance', type: 'SELF_STORY',
    statement: 'thinks of himself as a big risk-taker',
    derivedFrom: [e1.record.id]
  });
  assert.equal(unscored.hypothesis.evidenceStrength, 0);

  const evidenced = registerHypothesis({
    store: unscored.store, hypothesisStore: unscored.hypothesisStore, authorization: OWNER,
    subjectId: 'mohamed', dimension: 'risk-tolerance', type: 'VALUE',
    statement: 'consistently chooses the reversible option under uncertainty',
    derivedFrom: [e2.record.id], evidenceStrength: 0.75
  });

  const ranked = rankHypotheses({
    hypothesisStore: evidenced.hypothesisStore, subjectId: 'mohamed', dimension: 'risk-tolerance'
  });
  assert.equal(ranked.ranked.length, 2);
  assert.equal(ranked.ranked[0].id, evidenced.hypothesis.id, 'the evidenced hypothesis must rank first even though it was registered second');
  assert.equal(ranked.ranked[1].id, unscored.hypothesis.id);
  assert.ok(ranked.ranked[0].evidenceStrength > ranked.ranked[1].evidenceStrength);
});

// ---- Hypothesis validation ---------------------------------------------------

test('an unrecognised hypothesis type is refused, and TRAIT is not silently substituted', () => {
  let store = [];
  const e = event(store, 'x');
  store = e.store;
  const result = registerHypothesis({
    store, hypothesisStore: [], authorization: OWNER,
    subjectId: 'mohamed', dimension: 'x', type: 'DIAGNOSIS', statement: 'x', derivedFrom: [e.record.id]
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasonCodes, ['valid-hypothesis-type-required']);
  assert.equal(HYPOTHESIS_TYPES.includes('DIAGNOSIS'), false);
});

test('a hypothesis with no citable evidence is refused, not stored as a floating conclusion', () => {
  const result = registerHypothesis({
    store: [], hypothesisStore: [], authorization: OWNER,
    subjectId: 'mohamed', dimension: 'x', type: 'UNKNOWN', statement: 'a claim from nowhere', derivedFrom: []
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'HYPOTHESIS_INVALID');
  assert.deepEqual(result.reasonCodes, ['claim-provenance-required']);
});

test('every hypothesis operation refuses without founder authorization', () => {
  const calls = [
    () => registerHypothesis({ store: [], hypothesisStore: [], subjectId: 'm', dimension: 'd', type: 'UNKNOWN', statement: 's', derivedFrom: ['a'] }),
    () => supersedeHypothesis({ store: [], hypothesisStore: [{ id: 'h1', status: 'ACTIVE', type: 'UNKNOWN', subjectId: 'm', dimension: 'd' }], previousId: 'h1', next: { type: 'VALUE', statement: 's', derivedFrom: ['a'] }, reason: 'r' })
  ];
  for (const call of calls) {
    const result = call();
    assert.equal(result.ok, false);
    assert.equal(result.status, 'PRIVATE_STATE_FOUNDER_AUTHORITY_REQUIRED');
  }
});

// ---- Graph provenance --------------------------------------------------------

test('an inferred claim is never presentable as an observation', () => {
  let store = [];
  const e = event(store, 'reads three books about a topic and then changes careers, twice');
  store = e.store;

  const inferred = assertProvenancedEdge({
    store, edges: [], authorization: OWNER, sourceRecordId: e.record.id,
    edgeInput: { from: 'curiosity-pattern', to: 'career-change', kind: 'MAY_EXPLAIN', basis: 'INFERRED' }
  });
  assert.equal(inferred.ok, true);
  assert.equal(inferred.edge.provenance.assertionKind, 'INFERENCE');
  assert.notEqual(inferred.edge.provenance.assertionKind, 'OBSERVATION');

  const observed = assertProvenancedEdge({
    store, edges: [], authorization: OWNER, sourceRecordId: e.record.id,
    edgeInput: { from: 'reading', to: 'career-change', kind: 'MAY_EXPLAIN', basis: 'DIRECTLY_MEASURED' }
  });
  assert.equal(observed.edge.provenance.assertionKind, 'OBSERVATION');
});

test('an edge citing a record absent from the private store is refused', () => {
  const result = assertProvenancedEdge({
    store: [], edges: [], authorization: OWNER, sourceRecordId: 'pcr_never_existed',
    edgeInput: { from: 'a', to: 'b', kind: 'SUPPORTS', basis: 'LONGITUDINAL' }
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasonCodes, ['source-record-not-found-in-private-store']);
});

test('a malformed edge is refused by the same validation life-knowledge-graph already enforces', () => {
  let store = [];
  const e = event(store, 'x');
  store = e.store;
  const result = assertProvenancedEdge({
    store, edges: [], authorization: OWNER, sourceRecordId: e.record.id,
    edgeInput: { from: 'a', to: 'b', kind: 'NOT_A_REAL_KIND', basis: 'LONGITUDINAL' }
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'EDGE_INVALID');
  assert.deepEqual(result.reasonCodes, ['valid-edge-kind-required']);
});

test('a graph claim whose source record was deleted does not silently persist', () => {
  let store = [];
  const e = event(store, 'the event the whole claim rests on');
  store = e.store;

  const asserted = assertProvenancedEdge({
    store, edges: [], authorization: OWNER, sourceRecordId: e.record.id,
    edgeInput: { from: 'event-node', to: 'trait-node', kind: 'SUPPORTS', basis: 'REPEATED_OBSERVATION' }
  });
  assert.equal(asserted.ok, true);

  const unrelatedEvent = event(store, 'a second, unrelated event');
  const unrelatedEdge = assertProvenancedEdge({
    store: unrelatedEvent.store, edges: asserted.edges, authorization: OWNER,
    sourceRecordId: unrelatedEvent.record.id,
    edgeInput: { from: 'unrelated-node', to: 'other-node', kind: 'SUPPORTS', basis: 'REPEATED_OBSERVATION' }
  });

  const deletion = deletePrivateRecords({ store: unrelatedEvent.store, ids: [e.record.id], authorization: OWNER });
  assert.equal(deletion.ok, true);

  const reconciled = reconcileGraphAfterDeletion({
    storeBeforeDeletion: unrelatedEvent.store,
    deletedIds: deletion.requestedIds,
    edges: unrelatedEdge.edges
  });
  assert.equal(reconciled.ok, true);
  assert.equal(reconciled.status, 'GRAPH_EDGES_PRUNED');
  assert.equal(reconciled.prunedCount, 1);
  assert.equal(reconciled.edges.length, 1, 'the edge from the unrelated, undeleted event must remain');
  assert.equal(reconciled.edges[0].from, 'unrelated-node');
  assert.equal(reconciled.guarantee, 'NO_GRAPH_CLAIM_FROM_A_DELETED_RECORD_REMAINS');
});

test('reconciliation follows transitive closure, matching what deletePrivateRecords itself deletes', () => {
  // A hypothesis (a DERIVED_MODEL private record) built on the deleted event,
  // with a graph edge asserted from that derived record rather than the raw
  // event. The edge must still be pruned, because the record it cites is
  // itself gone even though it was never named directly in `deletedIds`.
  let store = [];
  const e = event(store, 'root event');
  store = e.store;

  const hyp = registerHypothesis({
    store, hypothesisStore: [], authorization: OWNER,
    subjectId: 'mohamed', dimension: 'x', type: 'UNKNOWN', statement: 'derived claim',
    derivedFrom: [e.record.id]
  });
  store = hyp.store;

  const edgeFromDerived = assertProvenancedEdge({
    store, edges: [], authorization: OWNER, sourceRecordId: hyp.hypothesis.recordId,
    edgeInput: { from: 'derived-node', to: 'other-node', kind: 'SUPPORTS', basis: 'LONGITUDINAL' }
  });

  const deletion = deletePrivateRecords({ store, ids: [e.record.id], authorization: OWNER });
  assert.ok(deletion.deletedIds.includes(hyp.hypothesis.recordId), 'the derived record must be in the deletion closure');

  const reconciled = reconcileGraphAfterDeletion({
    storeBeforeDeletion: store, deletedIds: deletion.requestedIds, edges: edgeFromDerived.edges
  });
  assert.equal(reconciled.prunedCount, 1);
  assert.equal(reconciled.edges.length, 0);
});

test('reconciliation refuses malformed input instead of guessing there was nothing to delete', () => {
  const result = reconcileGraphAfterDeletion({ storeBeforeDeletion: [], deletedIds: [], edges: [] });
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasonCodes, ['deleted-ids-required']);
});

test('no receipt in this module ever claims business effect authority', () => {
  let store = [];
  const e = event(store, 'x');
  store = e.store;
  const hyp = registerHypothesis({
    store, hypothesisStore: [], authorization: OWNER,
    subjectId: 'm', dimension: 'd', type: 'UNKNOWN', statement: 's', derivedFrom: [e.record.id]
  });
  const ranked = rankHypotheses({ hypothesisStore: hyp.hypothesisStore });
  const edgeResult = assertProvenancedEdge({
    store, edges: [], authorization: OWNER, sourceRecordId: e.record.id,
    edgeInput: { from: 'a', to: 'b', kind: 'SUPPORTS', basis: 'LONGITUDINAL' }
  });
  for (const result of [hyp, ranked, edgeResult]) {
    assert.equal(result.businessEffectAuthority, 'NONE');
  }
});
