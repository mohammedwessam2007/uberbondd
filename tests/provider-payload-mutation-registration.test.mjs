import test from 'node:test';
import assert from 'node:assert/strict';

import { MUTATIONS } from '../scripts/mutation-war.mjs';

test('PRIV-01 is registered in the canonical mutation war and targets durable raw provider payload retention', () => {
  const mutation = MUTATIONS.find(entry => entry.id === 'PRIV-01');

  assert.ok(mutation, 'PRIV-01 must exist before provider-payload minimization can be considered mutation-proven');
  assert.equal(mutation.file, 'src/revenue.mjs');
  assert.ok(
    mutation.suites.includes('tests/provider-payload-minimization.test.mjs'),
    'PRIV-01 must be killed by the behavioral persistence regression, not only a source-shape guard'
  );
  assert.match(mutation.guard, /payload|privacy|provider/i);
  assert.match(mutation.replace, /raw\s*:\s*payload|rawPayload|providerPayload/i);
});
