import test from 'node:test';
import assert from 'node:assert/strict';
import { capabilityAtom, findBottleneck } from '../src/human-capability-genome.mjs';

const atom = (name, over = {}) => {
  const built = capabilityAtom({ name, level: 0.5, basis: 'REPEATED_OBSERVATION', ...over });
  assert.equal(built.ok, true, JSON.stringify(built.reasonCodes));
  return built.capability;
};

test('ANY_OF chooses a causally viable lower-score substitute over a broken higher-score route', () => {
  const found = findBottleneck({
    goal: 'ship reliably',
    required: [
      { capability: 'primary-runtime', substitutes: ['portable-runtime'] },
      'operations'
    ],
    capabilities: [
      atom('primary-runtime', { level: 0.9, dependsOn: ['missing-primary-dependency'] }),
      atom('portable-runtime', { level: 0.8 }),
      atom('operations', { level: 0.2 })
    ]
  });

  assert.equal(found.ok, true);
  assert.equal(found.status, 'BOTTLENECK_IDENTIFIED');
  assert.equal(found.bottleneck.capability, 'operations');
  assert.equal(found.bottleneck.reason, 'WEAKEST_PRESENT');
  assert.deepEqual(found.substitutionsUsed, [{
    requirementId: 'required:0:primary-runtime|portable-runtime',
    requested: 'primary-runtime',
    used: 'portable-runtime'
  }]);
  assert.equal(found.missing.includes('missing-primary-dependency'), false,
    'a dependency on a route we did not choose cannot become the goal bottleneck');
  const route = found.requirementAnalysis.find(row => row.requirementId === 'required:0:primary-runtime|portable-runtime');
  assert.equal(route.chosen, 'portable-runtime');
  assert.equal(route.status, 'ROUTE_SATISFIED');
});

test('when every alternative is blocked, choose the least-blocked route rather than the highest score', () => {
  const found = findBottleneck({
    goal: 'ship reliably',
    required: [{ capability: 'route-a', substitutes: ['route-b'] }],
    capabilities: [
      atom('route-a', { level: 0.95, dependsOn: ['missing-a-1', 'missing-a-2'] }),
      atom('route-b', { level: 0.7, dependsOn: ['missing-b'] })
    ]
  });

  assert.equal(found.ok, true);
  assert.equal(found.status, 'BOTTLENECK_IDENTIFIED');
  assert.equal(found.bottleneck.capability, 'missing-b');
  assert.equal(found.bottleneck.reason, 'DEPENDENCY_ABSENT');
  const route = found.requirementAnalysis[0];
  assert.equal(route.chosen, 'route-b');
});
