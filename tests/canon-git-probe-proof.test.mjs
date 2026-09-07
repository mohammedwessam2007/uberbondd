import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceUnchangedSince } from '../scripts/founder-absence-doctor.mjs';

test('canon freshness refuses an unreachable git witness', () => {
  assert.equal(sourceUnchangedSince('0'.repeat(40)), false);
});
