import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildIgnoranceMap,
  mineUnknownUnknownProbes,
  prioritizeIgnoranceProbes
} from '../src/universal-ignorance-map.mjs';

test('empty visible-gap result never claims complete knowledge', () => {
  const map = buildIgnoranceMap({ question: 'What are we missing?' });
  assert.equal(map.ok, true);
  assert.equal(map.status, 'NO_VISIBLE_GAPS__NOT_COMPLETE_KNOWLEDGE');
  assert.match(map.truthBoundary, /DOES_NOT_MEAN_NO_UNKNOWN_UNKNOWNS/);
  assert.equal(map.businessEffectAuthority, 'NONE');
});

test('untested assumptions missing domains and missing option families remain visible', () => {
  const map = buildIgnoranceMap({
    question: 'Should we launch?',
    assumptions: [{ id: 'a1', claim: 'buyers care', tested: false, falsifier: 'buyer interviews show no pain' }],
    representedDomains: ['buyer'],
    expectedDomains: ['buyer', 'operations', 'legal'],
    optionFamilies: ['FULL_COMMITMENT'],
    expectedOptionFamilies: ['FULL_COMMITMENT', 'REVERSIBLE_EXPERIMENT']
  });
  assert.equal(map.ok, true);
  const classes = new Set(map.entries.map(row => row.class));
  assert.ok(classes.has('ASSUMPTION_EXPOSED'));
  assert.ok(classes.has('COVERAGE_GAP'));
  assert.ok(classes.has('OPTION_SPACE_GAP'));
});

test('one evidence lineage and missing counterevidence search create explicit gaps', () => {
  const map = buildIgnoranceMap({
    question: 'Is the claim supported?',
    evidence: [
      { id: 'e1', lineage: 'shared', direction: 'SUPPORTS' },
      { id: 'e2', lineage: 'shared', direction: 'SUPPORTS' }
    ]
  });
  const classes = new Set(map.entries.map(row => row.class));
  assert.ok(classes.has('EVIDENCE_ANCESTRY_GAP'));
  assert.ok(classes.has('COUNTEREVIDENCE_GAP'));
});

test('opposing evidence generates a hidden-variable or regime-change probe, not forced averaging', () => {
  const map = buildIgnoranceMap({
    question: 'Does X work?',
    evidence: [
      { id: 'e1', lineage: 'a', direction: 'SUPPORTS', counterevidenceSearched: true },
      { id: 'e2', lineage: 'b', direction: 'OPPOSES', counterevidenceSearched: true }
    ]
  });
  const row = map.entries.find(entry => entry.class === 'REGIME_OR_HIDDEN_VARIABLE_CANDIDATE');
  assert.ok(row);
  assert.match(row.nextProbe, /hidden variable|subgroup|regime/i);
});

test('probe generation never claims an unknown-unknown has already been found', () => {
  const map = buildIgnoranceMap({
    question: 'What are we missing?',
    knownUnknowns: ['buyer willingness to pay']
  });
  const mined = mineUnknownUnknownProbes({ ignoranceMap: map, maxProbes: 8 });
  assert.equal(mined.ok, true);
  assert.equal(mined.claimAboutUnknownUnknownsFound, false);
  assert.ok(mined.probes.length >= 1);
  assert.ok(mined.probes.every(row => row.status === 'UNKNOWN_UNKNOWN_PROBE_CANDIDATE'));
  assert.ok(mined.probes.every(row => row.authority === 'QUESTION_ONLY'));
});

test('even an empty visible map still attacks the representation itself', () => {
  const map = buildIgnoranceMap({ question: 'What are we missing?' });
  const mined = mineUnknownUnknownProbes({ ignoranceMap: map, maxProbes: 5 });
  assert.equal(mined.ok, true);
  assert.equal(mined.probes.length, 5);
  assert.ok(mined.probes.every(row => row.sourceClass === 'REPRESENTATION_BOUNDARY'));
});

test('probe prioritization counts leverage dimensions without inventing hidden weights', () => {
  const map = buildIgnoranceMap({
    question: 'What are we missing?',
    knownUnknowns: ['price elasticity', 'catastrophic tail']
  });
  const mined = mineUnknownUnknownProbes({ ignoranceMap: map, maxProbes: 2 });
  const [a, b] = mined.probes;
  const ranked = prioritizeIgnoranceProbes({
    probes: mined.probes,
    leverage: {
      [a.id]: { opensOptions: true, couldFlipRecommendation: true },
      [b.id]: { couldRevealRuin: true, cheapToTest: true }
    }
  });
  assert.equal(ranked.ok, true);
  assert.equal(ranked.tiers.length, 1, 'two leverage dimensions each must remain tied');
  assert.equal(ranked.tiers[0].leverageDimensions, 2);
  assert.equal(ranked.tiers[0].probes.length, 2);
  assert.equal(ranked.businessEffectAuthority, 'NONE');
});
