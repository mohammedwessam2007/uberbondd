import test from 'node:test';
import assert from 'node:assert/strict';

import {
  deriveSharedFutureAncestors,
  findExperimentFrontier,
  compileResearchPackets
} from '../src/moonshot-portfolio-compiler.mjs';

const nodes = [
  { id: 'truth', realityState: 'FIELD_PROVEN', requires: [] },
  { id: 'experiment-compiler', realityState: 'SOFTWARE_DEMONSTRATED', requires: ['truth'] },
  { id: 'robotic-lab', realityState: 'IMAGINED', requires: ['experiment-compiler'], experimentallyReachable: true },
  { id: 'programmable-matter', realityState: 'IMAGINED', requires: ['robotic-lab'] },
  { id: 'new-sense', realityState: 'IMAGINED', requires: ['experiment-compiler'], experimentallyReachable: true }
];

test('shared ancestor rewards cross-moonshot cross-domain reuse', () => {
  const result = deriveSharedFutureAncestors({
    prerequisiteNodes: nodes,
    moonshots: [
      { id: 'matter', domains: ['PHYSICAL'], rootPrerequisiteIds: ['programmable-matter'] },
      { id: 'sense', domains: ['COGNITIVE'], rootPrerequisiteIds: ['new-sense'] }
    ],
    minimumMoonshots: 2,
    minimumDomains: 2
  });
  assert.equal(result.ok, true);
  assert.ok(result.sharedAncestors.some(x => x.id === 'experiment-compiler'));
  assert.ok(result.sharedAncestors.some(x => x.id === 'truth'));
  assert.ok(!result.sharedAncestors.some(x => x.id === 'robotic-lab'));
});

test('experiment frontier contains only nodes whose declared prerequisites are mature', () => {
  const result = findExperimentFrontier({ prerequisiteNodes: nodes });
  assert.equal(result.ok, true);
  assert.deepEqual(result.frontier.map(x => x.id), ['new-sense', 'robotic-lab']);
});

test('cycles are rejected', () => {
  const result = deriveSharedFutureAncestors({
    prerequisiteNodes: [
      { id: 'a', requires: ['b'] },
      { id: 'b', requires: ['a'] }
    ],
    moonshots: [{ id: 'x', domains: ['X'], rootPrerequisiteIds: ['a'] }]
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('prerequisite-cycle-prohibited'));
});

test('research packets grant no effect authority', () => {
  const result = compileResearchPackets({
    sharedAncestors: [{
      id: 'new-sense',
      moonshotIds: ['sense'],
      domains: ['COGNITIVE']
    }],
    frontier: [{
      id: 'new-sense',
      realityState: 'IMAGINED'
    }]
  });
  assert.equal(result.ok, true);
  assert.equal(result.packets[0].effectAuthority, 'NONE_AT_PACKET_COMPILATION');
});
