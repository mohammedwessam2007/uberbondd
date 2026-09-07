// The no-drop guarantee, and the two ways it could quietly stop meaning anything.
//
// UberBond's recurring failure has never been losing code -- it has been losing
// concepts. So the matrix must account for every extracted concept, and it must
// not manufacture coverage to do so. Both halves are asserted here, because a
// matrix that drops rows and a matrix that invents green ones fail identically
// from the outside: they both look complete.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

import {
  compileCoverageMatrix, classifyState, locateEvidence, evidencePhrases,
  evidenceTokens, canonicalConceptId, verifyImplementationManifest,
  mergeDeclaredEvidence, COVERAGE_STATES
} from '../src/sovereign-coverage-matrix.mjs';

const index = {
  sourceFiles: ['src/wallbreaker.mjs', 'scripts/mutation-war.mjs', 'src/event-horizon.mjs'],
  testFiles: ['tests/wallbreaker.test.mjs', 'tests/mutation-verdict-honesty.test.mjs'],
  productionReachable: ['src/wallbreaker.mjs', 'src/event-horizon.mjs'],
  operatorReachable: ['src/wallbreaker.mjs', 'scripts/mutation-war.mjs', 'src/event-horizon.mjs']
};

test('every extracted concept gets a row, and losing one fails the build', () => {
  const concepts = Array.from({ length: 40 }, (_, i) => ({ name: `Concept ${i}`, source: 's', class: 'CONCEPT' }));
  const matrix = compileCoverageMatrix({ concepts, repoIndex: index });
  assert.equal(matrix.ok, true);
  assert.equal(matrix.counts.extractedConcepts, 40);
  assert.equal(matrix.counts.rows + matrix.counts.mergedAliasRows, 40);
});

test('the same concept named twice becomes one row that remembers both namings', () => {
  // An alias list exists precisely because canon says the same thing in
  // different words. Keeping the first and discarding the second would lose a
  // phrasing a future session searches for.
  const matrix = compileCoverageMatrix({
    concepts: [
      { name: 'Thought Ocean', source: 's', class: 'CONCEPT', sourceArtifact: 'a.json' },
      { name: 'Thought Ocean', source: 's', class: 'CONCEPT', sourceArtifact: 'b.json' }
    ],
    repoIndex: index
  });
  assert.equal(matrix.counts.rows, 1);
  assert.equal(matrix.counts.mergedAliasRows, 1);
  assert.deepEqual(matrix.rows[0].sourceArtifacts, ['a.json', 'b.json']);
});

test('a sub-phrase match can never reach VERIFIED_CURRENT', () => {
  // Finding "Postal" inside "Postal/free-first provider mesh and sender
  // infrastructure" says a component exists, not the mesh. This is the cap that
  // stops a compound concept being scored off one of its parts.
  const evidence = locateEvidence({ name: 'Mutation War and independent verification' }, index);
  assert.equal(evidence.matchScope, 'SUB_PHRASE');
  assert.equal(evidence.matchedPhrase, 'Mutation War');
  assert.equal(classifyState({ name: 'Mutation War and independent verification' }, evidence), 'PARTIAL_CURRENT');

  // The same evidence, matched as a whole name, is allowed to.
  const whole = locateEvidence({ name: 'Wallbreaker' }, index);
  assert.equal(whole.matchScope, 'WHOLE_NAME');
  assert.equal(classifyState({ name: 'Wallbreaker' }, whole), 'VERIFIED_CURRENT');
});

test('a name is never split on whitespace, so a life organ cannot inherit a frontier engine', () => {
  // The single most dangerous shortcut available here. "GENESIS for Life"
  // contains "GENESIS"; scoring it off that would invent a Personal
  // Civilization organ out of an unrelated world-sensing engine.
  const { parts } = evidencePhrases('GENESIS for Life');
  assert.deepEqual(parts, [], 'a name with no conjunction must not be split');

  const genesisIndex = { sourceFiles: ['src/genesis-evolution-engine.mjs'], testFiles: [], productionReachable: [], operatorReachable: [] };
  assert.equal(locateEvidence({ name: 'GENESIS for Life' }, genesisIndex).matchStrength, 'NO_MATCH');
  assert.equal(classifyState({ name: 'GENESIS for Life' }, locateEvidence({ name: 'GENESIS for Life' }, genesisIndex)), 'SPEC_ONLY');
});

test('source without a test is never VERIFIED, because nothing has exercised it', () => {
  const untested = { sourceFiles: ['src/event-horizon.mjs'], testFiles: [], productionReachable: ['src/event-horizon.mjs'], operatorReachable: ['src/event-horizon.mjs'] };
  assert.equal(classifyState({ name: 'Event Horizon' }, locateEvidence({ name: 'Event Horizon' }, untested)), 'PARTIAL_CURRENT');
});

test('a declared boundary outranks any amount of code', () => {
  // An owner decision, an absent provider or elapsed time cannot be satisfied
  // by a file, so no evidence may promote these rows.
  for (const [klass, expected] of [['BOUNDARY', 'OWNER_BOUNDARY'], ['EXTERNAL_GATE', 'EXTERNAL_BLOCKED'], ['ELAPSED_TIME', 'ELAPSED_TIME_REQUIRED']]) {
    const state = classifyState({ name: 'Wallbreaker', class: klass }, locateEvidence({ name: 'Wallbreaker' }, index));
    assert.equal(state, expected, `${klass} was overridden by source evidence`);
  }
});

test('common vocabulary cannot become evidence', () => {
  // Without this, every concept containing "system" collects every module with
  // "system" in its name, and the matrix goes green on nothing.
  assert.deepEqual(evidenceTokens('The System'), []);
  assert.equal(locateEvidence({ name: 'The System' }, index).matchStrength, 'NO_DISTINCTIVE_TOKENS');
  assert.equal(classifyState({ name: 'The System' }, locateEvidence({ name: 'The System' }, index)), 'UNKNOWN');
});

test('every row carries a state the schema allows and a boundary on its evidence', () => {
  const matrix = compileCoverageMatrix({
    concepts: [{ name: 'Wallbreaker', source: 's', class: 'CONCEPT' }, { name: 'Nothing At All Here', source: 's', class: 'CONCEPT' }],
    repoIndex: index
  });
  for (const row of matrix.rows) {
    assert.ok(COVERAGE_STATES.includes(row.currentState), `${row.canonicalId} holds an unknown state`);
    assert.match(row.currentEvidence.boundary, /NOT_PROOF_OF_BEHAVIOUR/);
    assert.ok(row.owningLane, 'every row must have an owning lane');
    assert.ok(Array.isArray(row.literalNames) && row.literalNames.length > 0);
  }
});

test('a concept id survives rewording that does not change the concept', () => {
  assert.equal(canonicalConceptId('s', 'Thought Ocean'), canonicalConceptId('s', 'thought   ocean'));
  assert.notEqual(canonicalConceptId('s', 'Thought Ocean'), canonicalConceptId('s', 'Thought Oceans'));
});

// ---- The declaration layer -------------------------------------------------
//
// A declaration exists because most canonical names never became filenames:
// `personal-civilization-core.mjs` implements the Thought Ocean without the
// phrase appearing in its path. That is also exactly the shape of the abuse --
// a line of JSON asserting that something is built. So every test below is
// about what a declaration is *not* allowed to do.

const declared = concept => [{
  concept, sources: ['src/wallbreaker.mjs'], tests: ['tests/wallbreaker.test.mjs']
}];

test('a declaration cannot invent a file that does not exist', () => {
  const matrix = compileCoverageMatrix({
    concepts: [{ name: 'Thought Ocean', source: 's', class: 'CONCEPT' }],
    repoIndex: index,
    manifest: [{ concept: 'Thought Ocean', sources: ['src/does-not-exist.mjs'], tests: [] }]
  });
  assert.equal(matrix.ok, false);
  assert.equal(matrix.status, 'COVERAGE_MANIFEST_INVALID');
  assert.deepEqual(matrix.reasonCodes, ['manifest-names-missing-files']);
});

test('a declaration cannot name a test file that does not exist', () => {
  const matrix = compileCoverageMatrix({
    concepts: [{ name: 'Thought Ocean', source: 's', class: 'CONCEPT' }],
    repoIndex: index,
    manifest: [{ concept: 'Thought Ocean', sources: ['src/wallbreaker.mjs'], tests: ['tests/imaginary.test.mjs'] }]
  });
  assert.equal(matrix.ok, false);
  assert.equal(matrix.status, 'COVERAGE_MANIFEST_INVALID');
});

test('a declaration for a concept no source artifact names fails the compile', () => {
  // The rot case. Canon renames a concept, the manifest keeps asserting the old
  // name, and without this the matrix would go on reporting coverage for
  // something that is no longer in the canon at all.
  const matrix = compileCoverageMatrix({
    concepts: [{ name: 'Thought Ocean', source: 's', class: 'CONCEPT' }],
    repoIndex: index,
    manifest: declared('Concept That Canon Never Mentions')
  });
  assert.equal(matrix.ok, false);
  assert.deepEqual(matrix.reasonCodes, ['manifest-names-unknown-concept']);
});

test('one bad declaration fails the whole matrix, never just its own row', () => {
  // A manifest that skipped its own broken entries would be a slower way of
  // writing the states by hand: the rows that still compiled would look
  // authoritative while the reader had no way to know some were dropped.
  const matrix = compileCoverageMatrix({
    concepts: [
      { name: 'Thought Ocean', source: 's', class: 'CONCEPT' },
      { name: 'Wallbreaker', source: 's', class: 'CONCEPT' }
    ],
    repoIndex: index,
    manifest: [
      { concept: 'Thought Ocean', sources: ['src/wallbreaker.mjs'], tests: ['tests/wallbreaker.test.mjs'] },
      { concept: 'Wallbreaker', sources: ['src/gone.mjs'], tests: [] }
    ]
  });
  assert.equal(matrix.ok, false);
  assert.equal(matrix.rows, undefined, 'no rows may be emitted from an invalid manifest');
});

test('a declaration supplies files, and the state is still derived from them', () => {
  // The load-bearing property. A declared concept with no test file must land
  // exactly where a discovered one does -- otherwise a declaration would be a
  // way to write VERIFIED_CURRENT by hand.
  const matrix = compileCoverageMatrix({
    concepts: [{ name: 'Thought Ocean', source: 's', class: 'CONCEPT' }],
    repoIndex: index,
    manifest: [{ concept: 'Thought Ocean', sources: ['src/wallbreaker.mjs'], tests: [] }]
  });
  assert.equal(matrix.ok, true);
  assert.equal(matrix.rows[0].currentState, 'PARTIAL_CURRENT');

  const withTests = compileCoverageMatrix({
    concepts: [{ name: 'Thought Ocean', source: 's', class: 'CONCEPT' }],
    repoIndex: index,
    manifest: declared('Thought Ocean')
  });
  assert.equal(withTests.rows[0].currentState, 'VERIFIED_CURRENT');
});

test('a declaration for an unreachable module cannot reach VERIFIED_CURRENT', () => {
  const unreachable = { ...index, productionReachable: [], operatorReachable: [] };
  const matrix = compileCoverageMatrix({
    concepts: [{ name: 'Thought Ocean', source: 's', class: 'CONCEPT' }],
    repoIndex: unreachable,
    manifest: declared('Thought Ocean')
  });
  assert.equal(matrix.rows[0].currentState, 'PARTIAL_CURRENT');
});

test('a declaration with no source at all is refused', () => {
  const verdict = verifyImplementationManifest({
    manifest: [{ concept: 'Thought Ocean', sources: [], tests: ['tests/wallbreaker.test.mjs'] }],
    repoIndex: index,
    conceptSlugs: new Set(['thought-ocean'])
  });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.problems[0].reason, 'manifest-entry-requires-source');
});

test('a declaration adds to discovered evidence rather than replacing it', () => {
  // A concept can be both named by one module and declared by another. Taking
  // only one of the two would understate what is actually there.
  const discovered = locateEvidence({ name: 'Wallbreaker' }, index);
  const merged = mergeDeclaredEvidence(
    discovered,
    { concept: 'Wallbreaker', sources: ['src/event-horizon.mjs'], tests: [] },
    index
  );
  assert.ok(merged.sources.includes('src/wallbreaker.mjs'), 'discovered evidence must survive');
  assert.ok(merged.sources.includes('src/event-horizon.mjs'), 'declared evidence must be added');
  assert.deepEqual(merged.tests, discovered.tests);
});

test('the repository manifest that ships with the matrix actually compiles', () => {
  // The declarations in artifacts/ are checked against the real tree by the
  // generator; this asserts the file is wired in rather than sitting unread.
  const parsed = JSON.parse(readFileSync('artifacts/sovereign/implementation-manifest.json', 'utf8'));
  assert.ok(Array.isArray(parsed.entries) && parsed.entries.length > 0);
  for (const entry of parsed.entries) {
    assert.ok(entry.concept, 'every entry names a concept');
    assert.ok(entry.sources?.length, `${entry.concept} must name at least one source`);
    for (const file of [...entry.sources, ...(entry.tests || [])]) {
      assert.ok(existsSync(file), `${entry.concept} declares ${file}, which is not in the tree`);
    }
  }
});
