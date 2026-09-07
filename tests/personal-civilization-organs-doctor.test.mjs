import test from 'node:test';
import assert from 'node:assert/strict';
import { compilePersonalCivilizationOrgansDoctor } from '../scripts/personal-civilization-organs-doctor.mjs';

test('Personal Civilization organs doctor proves all first-wave organs are reachable and zero-effect', () => {
  const report = compilePersonalCivilizationOrgansDoctor();
  assert.equal(report.ok, true, JSON.stringify(report));
  assert.equal(report.status, 'PERSONAL_CIVILIZATION_ORGANS_READY');
  assert.equal(report.allZeroEffect, true);
  assert.equal(report.founderPrivateStateLoaded, false);
  assert.equal(report.decisionAuthority, 'FOUNDER_ONLY');
  assert.ok(Object.values(report.checks).every(Boolean));
});
