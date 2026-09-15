import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DIRECTIVE_STATES,
  classifyDirectiveState,
  corpusReferenceCounts,
  matchCanonicalConcepts,
  reconcileFounderDirective
} from '../src/founder-directive-reconciler.mjs';

const section = (over = {}) => ({
  sectionId: 'nullstar:001-example-organ',
  numeral: 'I',
  title: 'Example Organ',
  class: 'ORGAN',
  requirement: 'An example organ that exists so these tests have a subject with distinctive tokens.',
  ...over
});

const directive = (sections) => ({
  directiveId: 'test-directive',
  corpusDigest: 'sha256:test',
  sectionCount: sections.length,
  sections
});

const repo = (over = {}) => ({ sourceFiles: [], testFiles: [], productionReachable: [], operatorReachable: [], ...over });

const strongEvidence = {
  sources: ['src/example-organ.mjs'],
  tests: ['tests/example-organ.test.mjs'],
  reachability: 'PRODUCTION',
  matchStrength: 'EXACT_SLUG',
  matchScope: 'WHOLE_NAME'
};

test('every section gets a row and none may be dropped', () => {
  const sections = Array.from({ length: 12 }, (_, i) => section({
    sectionId: `nullstar:${String(i + 1).padStart(3, '0')}-row`,
    numeral: `S${i}`,
    title: `Distinct Organ ${i}`
  }));
  const out = reconcileFounderDirective({ directive: directive(sections), repoIndex: repo() });
  assert.equal(out.ok, true);
  assert.equal(out.counts.rows, 12);
  assert.equal(out.counts.sections, 12);
  assert.equal(out.rows.length, 12);
  assert.equal(new Set(out.rows.map(row => row.sectionId)).size, 12);
  assert.equal(Object.values(out.counts.byState).reduce((a, b) => a + b, 0), 12);
});

test('a declared section count that disagrees with the corpus fails closed', () => {
  const doc = directive([section()]);
  doc.sectionCount = 7;
  const out = reconcileFounderDirective({ directive: doc, repoIndex: repo() });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('declared-section-count-must-equal-materialized-sections'));
});

test('duplicate ids, unknown classes and empty requirements are refused', () => {
  const dup = reconcileFounderDirective({ directive: directive([section(), section()]), repoIndex: repo() });
  assert.ok(dup.reasonCodes.some(code => code.startsWith('duplicate-section-id:')));

  const badClass = reconcileFounderDirective({ directive: directive([section({ class: 'SOMETHING_ELSE' })]), repoIndex: repo() });
  assert.ok(badClass.reasonCodes.some(code => code.startsWith('unrecognized-section-class:')));

  const thin = reconcileFounderDirective({ directive: directive([section({ requirement: '   ' })]), repoIndex: repo() });
  assert.ok(thin.reasonCodes.some(code => code.startsWith('section-requirement-required:')));
});

test('a name match alone never reaches VERIFIED_CURRENT', () => {
  // A module named after a section proves somebody used the words, not that the
  // behaviour exists. This is the exact overclaim the coverage matrix refuses,
  // and it must not sneak back in through the directive lane.
  const sourceOnly = { ...strongEvidence, tests: [] };
  assert.equal(classifyDirectiveState(section(), { evidence: sourceOnly }), 'PARTIAL');

  const subPhrase = { ...strongEvidence, matchScope: 'SUB_PHRASE' };
  assert.equal(classifyDirectiveState(section(), { evidence: subPhrase }), 'PARTIAL');

  const weakMatch = { ...strongEvidence, matchStrength: 'ALL_TOKENS' };
  assert.equal(classifyDirectiveState(section(), { evidence: weakMatch }), 'PARTIAL');

  const unreachable = { ...strongEvidence, reachability: 'CLASSIFIED_OR_UNREACHABLE' };
  assert.equal(classifyDirectiveState(section(), { evidence: unreachable }), 'PARTIAL');

  assert.equal(classifyDirectiveState(section(), { evidence: strongEvidence }), 'VERIFIED_CURRENT');
});

test('boundaries, gates and non-build-target classes cannot be satisfied by code', () => {
  for (const cls of ['BOUNDARY', 'EXTERNAL_GATE']) {
    assert.equal(classifyDirectiveState(section({ class: cls }), { evidence: strongEvidence }), 'BLOCKED',
      `${cls} must stay blocked no matter what the tree contains`);
  }
  for (const cls of ['MISSION', 'ONTOLOGY', 'RESEARCH_QUESTION']) {
    assert.equal(classifyDirectiveState(section({ class: cls }), { evidence: strongEvidence }), 'NOT_CURRENTLY_JUSTIFIED');
  }
});

test('a milestone is blocked until a receipt is supplied, and a filename is not a receipt', () => {
  assert.equal(classifyDirectiveState(section({ class: 'MILESTONE' }), { evidence: strongEvidence }), 'BLOCKED');
  assert.equal(
    classifyDirectiveState(section({ class: 'MILESTONE' }), { evidence: strongEvidence, milestoneReceipt: { evidenceRef: 'receipt://x' } }),
    'VERIFIED_CURRENT'
  );
});

test('a milestone receipt without an evidence reference is refused, not believed', () => {
  const out = reconcileFounderDirective({
    directive: directive([section({ class: 'MILESTONE' })]),
    repoIndex: repo(),
    milestoneReceipts: [{ sectionId: 'nullstar:001-example-organ' }]
  });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.some(code => code.startsWith('milestone-receipt-requires-evidence-reference:')));
});

test('a terminal declaration may only excuse work, never claim it, and must name a real section', () => {
  const claimed = reconcileFounderDirective({
    directive: directive([section()]),
    repoIndex: repo(),
    terminalDeclarations: [{ sectionId: 'nullstar:001-example-organ', state: 'VERIFIED_CURRENT', reason: 'trust me' }]
  });
  assert.equal(claimed.ok, false);
  assert.ok(claimed.reasonCodes.some(code => code.startsWith('terminal-declaration-state-not-declarable:')));

  const unreasoned = reconcileFounderDirective({
    directive: directive([section()]),
    repoIndex: repo(),
    terminalDeclarations: [{ sectionId: 'nullstar:001-example-organ', state: 'NOT_CURRENTLY_JUSTIFIED' }]
  });
  assert.ok(unreasoned.reasonCodes.some(code => code.startsWith('terminal-declaration-requires-reason:')));

  const unknown = reconcileFounderDirective({
    directive: directive([section()]),
    repoIndex: repo(),
    terminalDeclarations: [{ sectionId: 'nullstar:999-ghost', state: 'NOT_CURRENTLY_JUSTIFIED', reason: 'x' }]
  });
  assert.ok(unknown.reasonCodes.some(code => code.startsWith('terminal-declaration-names-unknown-section:')));
});

test('canonical matching reads literal names and refuses a single ordinary token', () => {
  const rows = [
    { canonicalId: 'canon:example-organ', literalNames: ['Example Organ'], currentState: 'VERIFIED_CURRENT' },
    { canonicalId: 'canon:tests', literalNames: ['tests'], currentState: 'VERIFIED_CURRENT' }
  ];
  const matches = matchCanonicalConcepts(section(), rows);
  assert.deepEqual(matches.map(match => match.canonicalId), ['canon:example-organ']);

  // A concept whose only distinctive token happens to appear in the section
  // text is a coincidence. Accepting it would mark the corpus covered by
  // vocabulary rather than by anything built.
  const coincidence = matchCanonicalConcepts(
    section({ requirement: 'This requirement mentions subject matter and exists.' }),
    [{ canonicalId: 'canon:subject', literalNames: ['subject'], currentState: 'VERIFIED_CURRENT' }]
  );
  assert.deepEqual(coincidence, []);
});

test('a canonical concept lifts a row only as high as that concept was independently rated', () => {
  const verified = [{ canonicalId: 'c', name: 'Example Organ', coverageState: 'VERIFIED_CURRENT' }];
  const partial = [{ canonicalId: 'c', name: 'Example Organ', coverageState: 'SPEC_ONLY' }];
  assert.equal(classifyDirectiveState(section(), { evidence: null, canonicalMatches: verified }), 'VERIFIED_CURRENT');
  assert.equal(classifyDirectiveState(section(), { evidence: null, canonicalMatches: partial }), 'PARTIAL');
});

test('no evidence and no canonical match is MISSING, and canon presence alone is DONOR_ONLY', () => {
  assert.equal(classifyDirectiveState(section(), { evidence: null }), 'MISSING');
  assert.equal(classifyDirectiveState(section({ canonPresence: true }), { evidence: null }), 'DONOR_ONLY');
});

test('corpus reference counts come from the corpus, not from a score', () => {
  const sections = [
    section({ sectionId: 's1', title: 'Reality Bus', requirement: 'One canonical stream of authorized reality changes.' }),
    section({ sectionId: 's2', title: 'Second Thing', requirement: 'Consumers subscribe to the reality bus rather than polling.' }),
    section({ sectionId: 's3', title: 'Third Thing', requirement: 'Unrelated vocabulary entirely, mentioning nothing shared.' })
  ];
  const counts = corpusReferenceCounts(sections);
  assert.equal(counts.get('s1'), 1, 'exactly one other section refers to the reality bus');
  assert.equal(counts.get('s3'), 0);
});

test('the cut set contains only unmet build targets and never a boundary or a mission', () => {
  const sections = [
    section({ sectionId: 'a', title: 'Unbuilt Organ Alpha', class: 'ORGAN' }),
    section({ sectionId: 'b', title: 'Hard Physical Boundary', class: 'BOUNDARY' }),
    section({ sectionId: 'c', title: 'Stated Purpose Beta', class: 'MISSION' }),
    section({ sectionId: 'd', title: 'Outside World Gate', class: 'EXTERNAL_GATE' })
  ];
  const out = reconcileFounderDirective({ directive: directive(sections), repoIndex: repo() });
  assert.equal(out.ok, true);
  assert.deepEqual(out.cutSet.map(row => row.sectionId), ['a']);
  assert.equal(out.counts.byState.BLOCKED, 2);
  assert.equal(out.counts.byState.NOT_CURRENTLY_JUSTIFIED, 1);
});

test('the reconciliation carries no authority and a zero effect ledger', () => {
  const out = reconcileFounderDirective({ directive: directive([section()]), repoIndex: repo() });
  assert.equal(out.businessEffectAuthority, 'NONE');
  assert.equal(out.externalEffectLedger.providerCalls, 0);
  assert.equal(out.externalEffectLedger.spendCents, 0);
  assert.match(out.truthBoundary, /DOES_NOT_PROVE_IMPLEMENTATION/);
  assert.match(out.truthBoundary, /NOT_AN_ESTIMATE_OF_COST_VALUE_OR_UNLOCK/);
});

test('every emitted state is one of the canonical states', () => {
  const doc = JSON.parse(readFileSync(new URL('../artifacts/project-nullstar-directive.json', import.meta.url), 'utf8'));
  const out = reconcileFounderDirective({ directive: doc, repoIndex: repo() });
  assert.equal(out.ok, true);
  assert.equal(out.rows.length, doc.sections.length);
  for (const row of out.rows) assert.ok(DIRECTIVE_STATES.includes(row.currentState), `${row.sectionId} -> ${row.currentState}`);
});

test('an alias supplies a name to search under and never a state', () => {
  const repoIndex = {
    sourceFiles: ['src/renamed-organ.mjs'],
    testFiles: [],
    productionReachable: ['src/renamed-organ.mjs'],
    operatorReachable: ['src/renamed-organ.mjs']
  };
  const out = reconcileFounderDirective({
    directive: directive([section()]),
    repoIndex,
    aliasDeclarations: [{
      sectionId: 'nullstar:001-example-organ',
      repositoryName: 'Renamed Organ',
      reason: 'the repository implements this under another name'
    }]
  });
  assert.equal(out.ok, true);
  // The alias found the module, so the row leaves MISSING -- and stops at
  // PARTIAL because nothing tests it. An alias that could promote a row would
  // be a way to declare coverage, which is the whole thing this refuses.
  assert.equal(out.rows[0].currentState, 'PARTIAL');
  assert.equal(out.rows[0].aliasedTo, 'Renamed Organ');
});

test('an alias that resolves to nothing fails the compile instead of reverting to MISSING', () => {
  // A silently-dead alias is worse than no alias: the row quietly returns to
  // MISSING and nobody learns the mapping rotted.
  const out = reconcileFounderDirective({
    directive: directive([section()]),
    repoIndex: repo(),
    aliasDeclarations: [{
      sectionId: 'nullstar:001-example-organ',
      repositoryName: 'Module That Does Not Exist Anywhere',
      reason: 'stale mapping'
    }]
  });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.some(code => code.startsWith('alias-declaration-resolves-to-nothing:')));
});

test('an alias needs a known section, a name and a stated reason', () => {
  const base = { sectionId: 'nullstar:001-example-organ', repositoryName: 'Renamed Organ', reason: 'r' };
  const repoIndex = { sourceFiles: ['src/renamed-organ.mjs'], testFiles: [], productionReachable: ['src/renamed-organ.mjs'], operatorReachable: [] };
  for (const [patch, prefix] of [
    [{ sectionId: 'nullstar:999-ghost' }, 'alias-declaration-names-unknown-section:'],
    [{ repositoryName: '' }, 'alias-declaration-requires-repository-name:'],
    [{ reason: '' }, 'alias-declaration-requires-reason:']
  ]) {
    const out = reconcileFounderDirective({
      directive: directive([section()]),
      repoIndex,
      aliasDeclarations: [{ ...base, ...patch }]
    });
    assert.equal(out.ok, false);
    assert.ok(out.reasonCodes.some(code => code.startsWith(prefix)), `${prefix} -> ${out.reasonCodes}`);
  }
});

test('a section the repository answers under its own title is never redirected by an alias', () => {
  const repoIndex = {
    sourceFiles: ['src/example-organ.mjs', 'src/renamed-organ.mjs'],
    testFiles: ['tests/example-organ.test.mjs'],
    productionReachable: ['src/example-organ.mjs', 'src/renamed-organ.mjs'],
    operatorReachable: []
  };
  const out = reconcileFounderDirective({
    directive: directive([section()]),
    repoIndex,
    aliasDeclarations: [{ sectionId: 'nullstar:001-example-organ', repositoryName: 'Renamed Organ', reason: 'r' }]
  });
  assert.equal(out.rows[0].aliasedTo, null, 'the own-name match must win');
  assert.equal(out.rows[0].currentState, 'VERIFIED_CURRENT');
});

test('an empty directive is refused rather than reported as fully covered', () => {
  assert.equal(reconcileFounderDirective({ directive: { sections: [] } }).ok, false);
  assert.equal(reconcileFounderDirective({}).ok, false);
});
