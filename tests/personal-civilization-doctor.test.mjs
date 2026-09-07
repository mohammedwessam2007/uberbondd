import test from 'node:test';
import assert from 'node:assert/strict';
import { compilePersonalCivilizationDoctor } from '../scripts/personal-civilization-doctor.mjs';

test('Personal Civilization doctor proves executable zero-effect foundation', () => {
  const report = compilePersonalCivilizationDoctor();
  assert.equal(report.ok, true, JSON.stringify(report));
  assert.equal(report.status, 'PERSONAL_CIVILIZATION_FOUNDATION_READY');
  assert.equal(report.decisionAuthority, 'FOUNDER_ONLY');
  assert.equal(report.externalEffectAuthority, 'NONE');
  assert.equal(report.publicFixtureOnly, true);
  assert.equal(report.privateLifeStatePersisted, false);
  assert.equal(report.checks.noAutomaticLifeWinner, true);
  assert.equal(report.checks.founderDecisionRequired, true);
  assert.deepEqual(report.externalEffectLedger, {
    providerCalls: 0,
    messages: 0,
    purchases: 0,
    deployments: 0,
    credentialChanges: 0,
    dnsChanges: 0,
    productionMutations: 0,
    spendCents: 0
  });
});
