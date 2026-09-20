import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildResurrectionIndex,
  compileAncestorResearchFrontier,
  compileLiteralMoonshotCorpus,
  proposeNearDuplicateMoonshots
} from '../src/moonshot-corpus-compiler.mjs';

const idea = (id, name, extra = {}) => ({
  id,
  literalName: name,
  thesis: `${name} should be treated as a falsifiable research program.`,
  domains: ['META_RESEARCH'],
  claims: [{
    claimId: 'primary',
    statement: `${name} can create a measurable new capability under bounded conditions.`,
    type: 'META_RESEARCH',
    falsifier: 'No measurable advantage over baseline under a preregistered test.',
    feasibility: 'INSUFFICIENT_INFORMATION',
    assumptions: ['A measurable proxy exists.'],
    requiredEvidence: ['Held-out comparison.'],
    evidenceRefs: []
  }],
  constraints: [],
  dependencies: [],
  unknowns: ['Whether the effect transfers.'],
  ...extra
});

test('literal corpus preserves source identity and ordinal provenance', () => {
  const result = compileLiteralMoonshotCorpus({
    sourceId: 'founder-chat-2026-09-20',
    sourceDate: '2026-09-20',
    ideas: [
      idea('reality-api', 'THE REALITY API'),
      idea('possibility-engine', 'THE POSSIBILITY ENGINE')
    ]
  });
  assert.equal(result.ok, true);
  assert.equal(result.compiledCount, 2);
  assert.equal(result.programs[0].literalName, 'THE REALITY API');
  assert.equal(result.programs[0].provenance.ordinal, 1);
  assert.equal(result.programs[0].realityState, 'IMAGINED');
  assert.match(result.noDropBoundary, /PRESERVES_LITERAL_SOURCE_IDENTITY/);
});

test('literal corpus rejects duplicate identity instead of silently merging it', () => {
  const result = compileLiteralMoonshotCorpus({
    sourceId: 's',
    sourceDate: '2026-09-20',
    ideas: [idea('x', 'X'), idea('x', 'Y')]
  });
  assert.equal(result.ok, true);
  assert.equal(result.compiledCount, 1);
  assert.equal(result.rejectedCount, 1);
  assert.ok(result.rejected[0].reasonCodes.includes('duplicate-id'));
});

test('near duplicate detection proposes review only', () => {
  const corpus = compileLiteralMoonshotCorpus({
    sourceId: 's',
    sourceDate: '2026-09-20',
    ideas: [
      idea('a', 'Reality Programming Language', {
        thesis: 'Compile desired outcomes into causal programs.'
      }),
      idea('b', 'Reality Language', {
        thesis: 'Compile desired outcomes into causal programs.'
      }),
      idea('c', 'Biological Compiler', {
        thesis: 'Compile biological functions into cellular mechanisms.'
      })
    ]
  });
  const result = proposeNearDuplicateMoonshots({ programs: corpus.programs, threshold: 0.45 });
  assert.equal(result.ok, true);
  assert.ok(result.candidatePairs.some(pair => pair.aId === 'a' && pair.bId === 'b'));
  assert.ok(result.candidatePairs.every(pair => pair.decision === 'REVIEW_ONLY__DO_NOT_AUTO_MERGE'));
  assert.match(result.claimBoundary, /UNIQUE_PURPOSE_MUST_BE_PRESERVED/);
});

test('shared ancestor frontier prioritizes experimentally reachable common prerequisites', () => {
  const prerequisiteNodes = [
    { id: 'truth', name: 'Truth substrate', realityState: 'FIELD_PROVEN', requires: [] },
    { id: 'experiment-compiler', name: 'Experiment compiler', realityState: 'SOFTWARE_DEMONSTRATED', requires: ['truth'] },
    { id: 'new-instrument', name: 'New instrument', realityState: 'IMAGINED', requires: ['experiment-compiler'], experimentallyReachable: true },
    { id: 'matter', name: 'Programmable matter', realityState: 'IMAGINED', requires: ['new-instrument'] },
    { id: 'sense', name: 'New sense', realityState: 'IMAGINED', requires: ['new-instrument'] }
  ];
  const moonshots = [
    { id: 'matter-shot', domains: ['PHYSICAL'], rootPrerequisiteIds: ['matter'] },
    { id: 'sense-shot', domains: ['COGNITIVE'], rootPrerequisiteIds: ['sense'] }
  ];
  const result = compileAncestorResearchFrontier({ moonshots, prerequisiteNodes });
  assert.equal(result.ok, true);
  assert.equal(result.prioritizedExperimentableAncestors[0].id, 'new-instrument');
  assert.equal(result.researchPackets[0].effectAuthority, 'NONE_AT_PACKET_COMPILATION');
  assert.match(result.law, /SHARED_ANCESTORS/);
});

test('resurrection index preserves terminal programs instead of deleting them', () => {
  const result = buildResurrectionIndex({
    programs: [
      { id: 'x', realityState: 'EXTERNALLY_BLOCKED', resurrectionConditions: ['instrument resolution improves'] },
      { id: 'y', realityState: 'FIELD_PROVEN' }
    ]
  });
  assert.equal(result.ok, true);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].id, 'x');
  assert.match(result.noAmputationLaw, /REMAIN_RECOVERABLE/);
});
