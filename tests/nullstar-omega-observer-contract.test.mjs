import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PARSING_RULES,
  INDEPENDENCE_CLASSES,
  declareObserver,
  differentialObservation,
  reconcileObservations,
  classifyProvenance
} from '../src/nullstar-omega-observer-contract.mjs';

const observer = (overrides = {}) => declareObserver({
  id: 'mutation-summary',
  observes: 'whether every registered mutation died',
  inputSource: 'scripts/mutation-war.mjs summary line',
  producesStructuredOutput: true,
  parsingRule: PARSING_RULES.STRUCTURED_FIELD,
  expectedSchema: 'a summary object carrying total, killed and survived counts',
  independenceClass: INDEPENDENCE_CLASSES.INDEPENDENT,
  validationRule: 'killed plus survived must equal total, or the read is rejected',
  failureState: 'OBSERVER_READ_REJECTED',
  ...overrides
});

test('a complete declaration is accepted and counts as evidence', () => {
  const result = observer();
  assert.equal(result.status, 'OBSERVER_DECLARED');
  assert.equal(result.countsAsEvidence, true);
});

test('text matching is refused when the producer emits structured output', () => {
  // The live defect: the mutation runner printed a summary line and the
  // observer matched the word "survived" inside the guard catalogue instead.
  const result = observer({ parsingRule: PARSING_RULES.TEXT_PATTERN });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('text-matching-is-refused-when-the-producer-emits-structured-output'));
});

test('text matching is allowed only when there is no structure to read', () => {
  const result = observer({
    parsingRule: PARSING_RULES.TEXT_PATTERN,
    producesStructuredOutput: false,
    expectedSchema: null
  });
  assert.equal(result.ok, true);
});

test('a structured read must name the field it expects', () => {
  const result = observer({ expectedSchema: null });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('structured-reads-must-name-the-field-or-schema-they-expect'));
});

test('an observer reading the artifact that states its own claim is refused', () => {
  // The live defect: the triage observer read the classification file this
  // session had just written to declare those modules NEEDS_TRIAGE.
  const result = observer({
    id: 'triage-reachability',
    inputSource: 'config/reachability-classification.json',
    readsArtifactsAuthoredBy: ['config/reachability-classification.json'],
    claimArtifact: 'config/reachability-classification.json',
    independenceClass: INDEPENDENCE_CLASSES.INDEPENDENT
  });
  assert.equal(result.ok, false);
  assert.equal(result.readsOwnClaim, true);
  assert.ok(result.reasonCodes.includes('an-observer-reading-the-artifact-that-states-its-own-claim-is-self-referential'));
});

test('the same observer declared honestly as self-referential is recorded but not evidence', () => {
  const result = observer({
    readsArtifactsAuthoredBy: ['config/reachability-classification.json'],
    claimArtifact: 'config/reachability-classification.json',
    independenceClass: INDEPENDENCE_CLASSES.SELF_REFERENTIAL
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'OBSERVER_DECLARED_NOT_EVIDENTIAL');
  assert.equal(result.countsAsEvidence, false);
  assert.match(result.why, /restates the claim/);
});

test('an observer must say how a bad read is detected and what it reports on failure', () => {
  assert.ok(observer({ validationRule: null }).reasonCodes.includes('observer-must-state-how-a-bad-read-is-detected'));
  assert.ok(observer({ failureState: null }).reasonCodes.includes('observer-must-name-the-state-it-reports-on-failure'));
});

test('two observers sharing an input source are not independent derivations', () => {
  const a = observer({ id: 'a' });
  const b = observer({ id: 'b' });
  const result = differentialObservation({ fact: 'all mutations died', first: a, second: b });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('independent-derivations-must-not-share-an-input-source'));
  assert.match(result.note, /agree by construction/);
});

test('two observers on different sources can be compared', () => {
  const a = observer({ id: 'summary-line' });
  const b = observer({ id: 'exit-code', inputSource: 'process exit status', parsingRule: PARSING_RULES.EXIT_CODE, expectedSchema: null });
  const result = differentialObservation({ fact: 'all mutations died', first: a, second: b });
  assert.equal(result.ok, true);
  assert.equal(result.bothEvidential, true);
});

test('disagreement opens a contradiction instead of picking the authoritative-looking one', () => {
  const a = observer({ id: 'summary-line' });
  const b = observer({ id: 'exit-code', inputSource: 'process exit status', parsingRule: PARSING_RULES.EXIT_CODE, expectedSchema: null });
  const differential = differentialObservation({ fact: 'all mutations died', first: a, second: b });
  const result = reconcileObservations({ differential, firstValue: 'SOME_SURVIVED', secondValue: 'ALL_KILLED' });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'OBSERVER_CONTRADICTION');
  assert.deepEqual(result.values, ['SOME_SURVIVED', 'ALL_KILLED']);
  assert.match(result.note, /not decidable from the disagreement alone/);
});

test('agreement across independent sources is corroboration', () => {
  const a = observer({ id: 'summary-line' });
  const b = observer({ id: 'exit-code', inputSource: 'process exit status', parsingRule: PARSING_RULES.EXIT_CODE, expectedSchema: null });
  const differential = differentialObservation({ fact: 'all mutations died', first: a, second: b });
  const result = reconcileObservations({ differential, firstValue: 'ALL_KILLED', secondValue: 'ALL_KILLED' });
  assert.equal(result.status, 'OBSERVATION_CORROBORATED');
  assert.equal(result.corroborationStrength, 'INDEPENDENT_AGREEMENT');
  assert.ok(result.digest.startsWith('sha256:'));
});

test('agreement involving a non-evidential observer is labelled as such', () => {
  const a = observer({ id: 'summary-line' });
  const b = observer({
    id: 'self-read',
    inputSource: 'artifacts/claim.json',
    readsArtifactsAuthoredBy: ['artifacts/claim.json'],
    claimArtifact: 'artifacts/claim.json',
    independenceClass: INDEPENDENCE_CLASSES.SELF_REFERENTIAL
  });
  const differential = differentialObservation({ fact: 'all mutations died', first: a, second: b });
  const result = reconcileObservations({ differential, firstValue: 'ALL_KILLED', secondValue: 'ALL_KILLED' });
  assert.equal(result.corroborationStrength, 'AGREEMENT_WITH_A_NON_EVIDENTIAL_OBSERVER');
});

test('provenance reaching a session-authored artifact is self-referential', () => {
  const result = classifyProvenance({
    node: 'triage-observation',
    edges: { 'triage-observation': ['config/reachability-classification.json'] },
    sessionAuthored: ['config/reachability-classification.json']
  });
  assert.equal(result.independenceClass, 'SELF_REFERENTIAL');
  assert.equal(result.countsAsEvidence, false);
});

test('provenance that loops back to itself is cyclic', () => {
  const result = classifyProvenance({
    node: 'a',
    edges: { a: ['b'], b: ['a'] },
    sessionAuthored: []
  });
  assert.equal(result.independenceClass, 'CYCLIC');
  assert.equal(result.countsAsEvidence, false);
});

test('provenance over untouched inputs is derived, and a leaf is independent', () => {
  assert.equal(classifyProvenance({ node: 'a', edges: { a: ['b'], b: ['c'] } }).independenceClass, 'DERIVED');
  assert.equal(classifyProvenance({ node: 'a', edges: {} }).independenceClass, 'INDEPENDENT');
});
