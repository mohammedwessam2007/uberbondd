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
  mergeDeclaredEvidence, classifyTerminalState, COVERAGE_STATES,
  STRUCTURAL_CLASSES, FIELD_CLASSES, DONOR_CLASSES, LAW_CLASSES,
  ALIAS_CLASSES, EXTERNAL_GATES
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

test('a category cannot be implemented by a file that happens to share a word', () => {
  // The real regression this guards: "Possibility" is one of the twelve terminal
  // ontology domains, and it read VERIFIED_CURRENT because a module was named
  // life-possibility-engine.mjs. "Action" did the same off browser-action-contract,
  // "Knowledge" off life-knowledge-graph. Twenty-nine rows were claiming
  // implementation of things that are categories, while the artifact advertised
  // that it never overstates.
  for (const klass of STRUCTURAL_CLASSES) {
    const state = classifyState({ name: 'Wallbreaker', class: klass }, locateEvidence({ name: 'Wallbreaker' }, index));
    assert.equal(state, 'STRUCTURAL_NOT_A_BUILD_TARGET', `${klass} was promoted by source evidence`);
  }
  for (const klass of ALIAS_CLASSES) {
    const state = classifyState({ name: 'Wallbreaker', class: klass }, locateEvidence({ name: 'Wallbreaker' }, index));
    assert.equal(state, 'ALIAS_OF_CANONICAL_CONCEPT', `${klass} was promoted by source evidence`);
  }
});

test('a genuine organ is still promoted by the same evidence a category is refused', () => {
  // The guard must be about the class, not about weakening the matcher. The
  // identical evidence that leaves an ONTOLOGY row structural still promotes an
  // ORGAN row, or the fix would have bought truth by going blind.
  const evidence = locateEvidence({ name: 'Wallbreaker' }, index);
  assert.equal(classifyState({ name: 'Wallbreaker', class: 'ORGAN' }, evidence), 'VERIFIED_CURRENT');
  assert.equal(classifyState({ name: 'Wallbreaker', class: 'ONTOLOGY' }, evidence), 'STRUCTURAL_NOT_A_BUILD_TARGET');
});

test('a historical donor with real code is not flattened by the category guard', () => {
  // NAMED_INITIATIVE and ECONOMIC_DONOR are deliberately outside the guard: a
  // named programme genuinely can have an implementation, and forcing those to
  // HISTORICAL_DONOR_PRESERVED would buy consistency by deleting real signal.
  const evidence = locateEvidence({ name: 'Wallbreaker' }, index);
  for (const klass of DONOR_CLASSES) {
    assert.equal(classifyState({ name: 'Wallbreaker', class: klass }, evidence), 'VERIFIED_CURRENT');
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

// ---- The terminal classifier ------------------------------------------------
//
// SPEC_ONLY was doing two jobs: "nobody built this organ" and "this is a line
// of canon that was never a module". Separating them is right, and it is also
// the single most abusable change in this file -- a triage that can relabel
// inconvenient rows is a way to make a number go away. Every test below is
// about a relabel that must not be possible.

const lawConcept = { name: 'Capability does not create authority', class: 'AUTHORITY_LAW', source: 's' };

test('a law nothing enforces stays SPEC_ONLY, which is the alarming answer', () => {
  assert.equal(classifyTerminalState(lawConcept, { enforcement: null }), 'SPEC_ONLY');
  assert.equal(
    classifyTerminalState(lawConcept, { enforcement: { sources: ['src/wallbreaker.mjs'], tests: ['tests/wallbreaker.test.mjs'] } }),
    'ENFORCED_BY_CODE'
  );
});

test('an enforcement declaration naming a missing file fails the whole compile', () => {
  const matrix = compileCoverageMatrix({
    concepts: [lawConcept],
    repoIndex: index,
    enforcement: [{ concept: 'Capability does not create authority', sources: ['src/not-here.mjs'], tests: [] }]
  });
  assert.equal(matrix.ok, false);
  assert.equal(matrix.status, 'COVERAGE_ENFORCEMENT_INVALID');
  assert.equal(matrix.rows, undefined, 'no rows may be emitted from an invalid enforcement manifest');
});

test('an enforcement entry for a law no artifact states fails the compile', () => {
  const matrix = compileCoverageMatrix({
    concepts: [lawConcept],
    repoIndex: index,
    enforcement: [{ concept: 'A law nobody wrote down', sources: ['src/wallbreaker.mjs'], tests: [] }]
  });
  assert.equal(matrix.ok, false);
  assert.deepEqual(matrix.reasonCodes, ['manifest-names-unknown-concept']);
});

test('a field cannot inherit coverage from an organ nobody built', () => {
  // The abuse this blocks: declare a parent, never build it, and 113 field
  // rows go green behind it.
  const field = { name: 'expected_regret', class: 'FORECAST_DIMENSION', source: 's' };
  assert.equal(classifyTerminalState(field, { parentState: 'SPEC_ONLY' }), 'SPEC_ONLY');
  assert.equal(classifyTerminalState(field, { parentState: null }), 'SPEC_ONLY');
  assert.equal(classifyTerminalState(field, { parentState: 'VERIFIED_CURRENT' }), 'COVERED_BY_PARENT_ORGAN');
  assert.equal(classifyTerminalState(field, { parentState: 'PARTIAL_CURRENT' }), 'COVERED_BY_PARENT_ORGAN');
});

test('the parent state is computed from the tree, not asserted by the field', () => {
  // Both concepts are compiled together; the field's state must follow what
  // the compile actually found for the parent.
  const withRealParent = compileCoverageMatrix({
    concepts: [
      { name: 'Wallbreaker', source: 's', class: 'CONCEPT' },
      { name: 'expected_regret', source: 's', class: 'FORECAST_DIMENSION', parent: 'Wallbreaker' }
    ],
    repoIndex: index
  });
  const field = withRealParent.rows.find(row => row.literalNames[0] === 'expected_regret');
  assert.equal(field.currentState, 'COVERED_BY_PARENT_ORGAN');

  const withUnbuiltParent = compileCoverageMatrix({
    concepts: [
      { name: 'Organ Nobody Built', source: 's', class: 'CONCEPT' },
      { name: 'some_field', source: 's', class: 'FORECAST_DIMENSION', parent: 'Organ Nobody Built' }
    ],
    repoIndex: index
  });
  assert.equal(withUnbuiltParent.rows.find(row => row.literalNames[0] === 'some_field').currentState, 'SPEC_ONLY');
});

test('a row with real evidence is never overwritten by its class', () => {
  // The ordering is the safeguard. If the terminal classifier ran first, a
  // NAMED_INITIATIVE with a working module would be filed as historical
  // lineage and its implementation would vanish from the count.
  const matrix = compileCoverageMatrix({
    concepts: [{ name: 'Wallbreaker', source: 's', class: 'NAMED_INITIATIVE' }],
    repoIndex: index,
    manifest: [{ concept: 'Wallbreaker', sources: ['src/wallbreaker.mjs'], tests: ['tests/wallbreaker.test.mjs'] }]
  });
  assert.equal(matrix.rows[0].currentState, 'VERIFIED_CURRENT');
});

test('the unbuilt residue cannot be shrunk by the classifier', () => {
  // The classes that carry genuine unbuilt organs must fall through to
  // SPEC_ONLY, or the triage becomes a way to report zero work remaining.
  for (const cls of ['CONCEPT', 'ORGAN', 'PERSONAL_CIVILIZATION_ORGAN', 'CAPABILITY_ATOM', 'GENESIS_MECHANISM', 'SOVEREIGNTY_DIMENSION']) {
    assert.equal(classifyTerminalState({ name: 'x', class: cls }, {}), 'SPEC_ONLY',
      `${cls} carries unbuilt organs and must not be reclassified`);
  }
});

test('the reviewed class tables are disjoint, so no class has two terminal meanings', () => {
  const tables = { STRUCTURAL_CLASSES, FIELD_CLASSES, DONOR_CLASSES, LAW_CLASSES };
  const seen = new Map();
  for (const [table, classes] of Object.entries(tables)) {
    for (const cls of classes) {
      assert.equal(seen.has(cls), false, `${cls} is in both ${seen.get(cls)} and ${table}`);
      seen.set(cls, table);
    }
  }
});

test('every terminal state the classifier can return is in the schema', () => {
  const reachable = [
    'SPEC_ONLY', 'ENFORCED_BY_CODE', 'STRUCTURAL_NOT_A_BUILD_TARGET',
    'COVERED_BY_PARENT_ORGAN', 'REFERENCE_ONLY_BY_CANON', 'HISTORICAL_DONOR_PRESERVED'
  ];
  for (const state of reachable) assert.ok(COVERAGE_STATES.includes(state), `${state} missing from the schema`);
});

test('the declared lane wins, so the manifest lane field is not decoration', () => {
  // It was decoration: every row took its lane from its concept class, so the
  // calibration ledger reported under OMEGA-14 and OMEGA-13 read as an empty
  // lane while its organ was built and mutation-covered.
  const matrix = compileCoverageMatrix({
    concepts: [{ name: 'Wallbreaker', source: 's', class: 'CONCEPT' }],
    repoIndex: index,
    laneMap: { CONCEPT: 'OMEGA-14' },
    manifest: [{ concept: 'Wallbreaker', lane: 'OMEGA-10', sources: ['src/wallbreaker.mjs'], tests: ['tests/wallbreaker.test.mjs'] }]
  });
  assert.equal(matrix.rows[0].owningLane, 'OMEGA-10');
});

// ---- External gates ---------------------------------------------------------
//
// "Blocked" is the most abusable label in this file: anything unbuilt can be
// described as waiting on something, and a system that can call its own
// unfinished work externally blocked will report itself finished. So a gate is
// verified three ways before it is granted, and each of those is tested here.

const gated = { name: 'OMNIROUTE', class: 'COMPUTE_RUNTIME', source: 's' };

test('a gate outside the reviewed vocabulary fails the whole compile', () => {
  const matrix = compileCoverageMatrix({
    concepts: [gated], repoIndex: index,
    externalGates: [{ concept: 'OMNIROUTE', gate: 'FEELS_HARD', evidence: 'it is difficult' }]
  });
  assert.equal(matrix.ok, false);
  assert.equal(matrix.status, 'COVERAGE_EXTERNAL_GATES_INVALID');
  assert.deepEqual(matrix.reasonCodes, ['gate-not-in-reviewed-vocabulary']);
});

test('a gate naming a concept no artifact states fails the compile', () => {
  const matrix = compileCoverageMatrix({
    concepts: [gated], repoIndex: index,
    externalGates: [{ concept: 'Something Nobody Wrote Down', gate: 'HOST_RUNTIME_NOT_INSTALLED', evidence: 'x' }]
  });
  assert.equal(matrix.ok, false);
  assert.deepEqual(matrix.reasonCodes, ['gate-names-unknown-concept']);
});

test('a gate with no stated evidence is refused', () => {
  // Without this the manifest becomes a list of assertions, and the whole
  // point is that a blocker names the fact outside the repository.
  const matrix = compileCoverageMatrix({
    concepts: [gated], repoIndex: index,
    externalGates: [{ concept: 'OMNIROUTE', gate: 'HOST_RUNTIME_NOT_INSTALLED' }]
  });
  assert.equal(matrix.ok, false);
  assert.deepEqual(matrix.reasonCodes, ['gate-requires-stated-evidence']);
});

test('a valid gate produces the state its vocabulary entry names', () => {
  const matrix = compileCoverageMatrix({
    concepts: [gated], repoIndex: index,
    externalGates: [{ concept: 'OMNIROUTE', gate: 'HOST_RUNTIME_NOT_INSTALLED', evidence: 'doctor reports no host installation' }]
  });
  assert.equal(matrix.rows[0].currentState, 'EXTERNAL_BLOCKED');
  assert.equal(EXTERNAL_GATES.ELAPSED_TIME_NOT_YET_OBSERVED, 'ELAPSED_TIME_REQUIRED');
});

test('a gate cannot mark something blocked that is actually built', () => {
  // The ordering again. Evidence classification runs first, so declaring a gate
  // on a working module cannot hide it -- which is the shape of the abuse where
  // finished work gets parked as blocked to avoid maintaining it.
  const matrix = compileCoverageMatrix({
    concepts: [{ name: 'Wallbreaker', source: 's', class: 'CONCEPT' }],
    repoIndex: index,
    manifest: [{ concept: 'Wallbreaker', sources: ['src/wallbreaker.mjs'], tests: ['tests/wallbreaker.test.mjs'] }],
    externalGates: [{ concept: 'Wallbreaker', gate: 'NO_CUSTOMER_EVIDENCE', evidence: 'no customers exist' }]
  });
  assert.equal(matrix.rows[0].currentState, 'VERIFIED_CURRENT');
});

test('every reviewed gate maps to a state the schema allows', () => {
  for (const [gate, state] of Object.entries(EXTERNAL_GATES)) {
    assert.ok(COVERAGE_STATES.includes(state), `${gate} maps to unknown state ${state}`);
    assert.ok(state === 'EXTERNAL_BLOCKED' || state === 'ELAPSED_TIME_REQUIRED',
      `${gate} must not map a blocker to a current state`);
  }
});

test('an alias is a preserved name, not an organ awaiting a second build', () => {
  // Canon keeps chat-born names for literal searchability and says in as many
  // words that this is "not a duplicate-implementation instruction". Recording
  // 45 of them as unbuilt invited exactly the duplicate build canon forbids.
  assert.equal(classifyTerminalState({ name: 'Personal Big Bang', class: 'ALIAS' }, {}), 'ALIAS_OF_CANONICAL_CONCEPT');
  assert.deepEqual(ALIAS_CLASSES, ['ALIAS']);
});
