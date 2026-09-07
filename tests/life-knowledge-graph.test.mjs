import test from 'node:test';
import assert from 'node:assert/strict';
import {
  edge, traverse, contradictions, authenticate, identityBranches, narrative,
  traversable, EDGE_BASIS, CONTENT_ORIGINS
} from '../src/life-knowledge-graph.mjs';

// An edge asserted from one anecdote looks identical to one established across
// a decade, and once both are in the graph every query treats them the same.
// That is where personal knowledge graphs go wrong quietly.

const strong = (from, to, kind = 'CAUSES') =>
  edge({ from, to, kind, basis: 'LONGITUDINAL' }).edge;
const weak = (from, to, kind = 'CAUSES') =>
  edge({ from, to, kind, basis: 'SINGLE_ANECDOTE' }).edge;

test('an edge with no stated basis is refused', () => {
  const refused = edge({ from: 'a', to: 'b', kind: 'CAUSES' });
  assert.equal(refused.ok, false);
  assert.match(refused.note, /every later query inherits its confidence/);
});

test('only edges at repeated observation or better are traversable', () => {
  assert.equal(traversable({ basis: 'SINGLE_ANECDOTE' }), false);
  assert.equal(traversable({ basis: 'INFERRED' }), false);
  assert.equal(traversable({ basis: 'SELF_REPORTED' }), false);
  assert.equal(traversable({ basis: 'REPEATED_OBSERVATION' }), true);
  assert.equal(traversable({ basis: 'DIRECTLY_MEASURED' }), true);
  assert.equal(EDGE_BASIS[0], 'SINGLE_ANECDOTE');
});

test('traversal refuses weak edges by default', () => {
  // A path that crossed one anecdote is an anecdote, however many strong
  // edges surround it.
  const edges = [strong('sleep', 'energy'), weak('energy', 'genius'), strong('energy', 'focus')];
  const strict = traverse({ edges, from: 'sleep' });
  assert.deepEqual(strict.reached.map(row => row.node).sort(), ['energy', 'focus']);
  assert.equal(strict.edgesSkipped, 1);
  assert.match(strict.law, /IS_AN_ANECDOTE_HOWEVER_MANY_STRONG_EDGES_SURROUND_IT/);
});

test('weak edges can be included only by asking for them explicitly', () => {
  const edges = [strong('sleep', 'energy'), weak('energy', 'genius')];
  const loose = traverse({ edges, from: 'sleep', strictOnly: false });
  assert.ok(loose.reached.some(row => row.node === 'genius'));
  assert.equal(loose.edgesSkipped, 0);
});

test('contradictions are held open rather than resolved by arrival order', () => {
  // Last-write-wins silently makes recency the arbiter of truth about a person.
  const edges = [
    edge({ from: 'travel', to: 'creativity', kind: 'CAUSES', basis: 'SINGLE_ANECDOTE' }).edge,
    edge({ from: 'travel', to: 'creativity', kind: 'PREVENTS', basis: 'LONGITUDINAL' }).edge
  ];
  const found = contradictions(edges);
  assert.equal(found.conflicts.length, 1);
  assert.equal(found.conflicts[0].claims.length, 2, 'both claims survive');
  assert.equal(found.conflicts[0].strongestBasis, 'LONGITUDINAL');
  assert.match(found.law, /BOTH CLAIMS STAY/);
});

test('opposed future-direction claims count as a contradiction', () => {
  const edges = [
    edge({ from: 'the move', to: 'options', kind: 'EXPANDS_FUTURES', basis: 'INFERRED' }).edge,
    edge({ from: 'the move', to: 'options', kind: 'CLOSES_FUTURES', basis: 'REPEATED_OBSERVATION' }).edge
  ];
  assert.equal(contradictions(edges).conflicts.length, 1);
});

test('agreeing edges are not reported as conflicts', () => {
  const edges = [strong('a', 'b', 'CAUSES'), strong('a', 'b', 'SUPPORTS')];
  assert.equal(contradictions(edges).status, 'NO_CONTRADICTIONS_FOUND');
});

test('an unattributed claim is untraceable rather than false', () => {
  // It reads identically to a primary observation as text. Only the chain
  // distinguishes them.
  const untraceable = authenticate({ claim: 'most people regret this', origin: 'UNATTRIBUTED' });
  assert.equal(untraceable.status, 'UNTRACEABLE');
  assert.match(untraceable.note, /which is a different problem/);
});

test('corroboration rescues a weak origin', () => {
  const corroborated = authenticate({
    claim: 'x', origin: 'PLAUSIBLY_GENERATED', corroboratedBy: ['a named study', 'his own records']
  });
  assert.equal(corroborated.status, 'PROVENANCE_RECORDED');
  assert.equal(corroborated.independentCorroboration, 2);
  assert.equal(corroborated.syntheticRisk, 'ORIGIN_MAY_BE_GENERATED');
  assert.ok(CONTENT_ORIGINS.includes('PRIMARY_OBSERVATION'));
});

test('identities coexist and none is named primary', () => {
  // Naming a primary is identity compression one level up.
  const branches = identityBranches([
    { identity: 'clinician', state: 'ACTIVE', yearsHeld: 6 },
    { identity: 'founder', state: 'ACTIVE', yearsHeld: 3 },
    { identity: 'musician', state: 'DORMANT', yearsHeld: 10 }
  ]);
  assert.equal(branches.coexisting, true);
  assert.equal(Object.hasOwn(branches, 'primary'), false);
  assert.match(branches.law, /PREMATURE_UNTIL_SOMETHING_ESTABLISHES_ONLY_ONE_CAN_BE/);
});

test('a story claimed as a mechanism needs evidence beyond the story', () => {
  const refused = narrative({ story: 'leaving made him who he is', claimedAsCausal: true });
  assert.equal(refused.ok, false);
  assert.match(refused.note, /explains everything afterwards predicts nothing beforehand/);
});

test('a story held as meaning needs no mechanism', () => {
  const held = narrative({ story: 'leaving made him who he is' });
  assert.equal(held.status, 'NARRATIVE_HELD_AS_MEANING');
  assert.match(held.boundary, /TRUE AS MEANING AND FALSE AS MECHANISM/);
});
