import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildFreeFirstOutreachDoctor, ownerActionQueue, readOutreachArtifacts } from '../scripts/free-first-outreach-doctor.mjs';
import { deriveProviderStatesFromReceipts } from '../src/provider-activation-receipt.mjs';
import { containsSecretValue } from '../src/secret-patterns.mjs';

const AT = '2026-09-01T00:00:00.000Z';
const { registry, receipts } = readOutreachArtifacts();
const doctor = () => buildFreeFirstOutreachDoctor({ registry, receipts, at: AT });

test('the doctor separates what policy permits from what this company can send', () => {
  const report = doctor();
  assert.equal(report.capacity.researchCapacity30d, 75100);
  assert.equal(report.capacity.liveUsableCapacity30d, 0);
  assert.equal(report.status, 'FREE_FIRST_ROUTER_PLAN_ONLY__NO_ACTIVATED_PROVIDER');
  assert.deepEqual(report.liveReadyProviderIds, []);
});

test('proven free cold-B2B transport across the whole reviewed pool is zero', () => {
  const report = doctor();
  assert.equal(report.capacity.researchCapacityByPurposePlan.COLD_B2B, 0);
  assert.equal(report.capacity.coldCapableTransportProven, false);
  assert.deepEqual(report.capacity.coldRouteRefusal, ['no-proven-free-cold-b2b-provider-route']);
});

test('the owner action queue is short enough to finish and ordered by what is at stake', () => {
  const report = doctor();
  assert.ok(report.ownerActionQueue.length <= 3, 'a queue nobody can finish is a backlog');
  const stakes = report.ownerActionQueue.map(row => row.atStakeMessagesPer30Days);
  assert.deepEqual(stakes, [...stakes].sort((a, b) => b - a), 'actions are not ordered by capacity at stake');
  for (const action of report.ownerActionQueue) {
    assert.ok(action.action.length > 10);
    assert.ok(action.screen.length > 10);
    assert.equal(typeof action.estimatedMinutes, 'number');
    assert.equal(action.estimatedCostUsd, 0, 'no owner action in this lane may cost money');
    assert.ok(action.evidenceOfCompletion.includes('doctor'));
  }
});

test('an activated provider leaves the queue', () => {
  const before = ownerActionQueue({
    registry,
    providerStates: deriveProviderStatesFromReceipts({ receipts, registryProviders: registry, now: new Date(AT) }).providerStates,
    maxOwnerActions: 16
  });
  const activated = receipts.map(row => (row.providerId !== 'sender-net-free' ? row : {
    ...row,
    accountState: 'EXISTING',
    freePlanVerified: true,
    credentialRuntimeState: 'CONFIGURED_SECURELY',
    domainVerificationState: 'VERIFIED',
    healthObservation: { state: 'HEALTHY', observedAt: AT }
  }));
  const after = ownerActionQueue({
    registry,
    providerStates: deriveProviderStatesFromReceipts({ receipts: activated, registryProviders: registry, now: new Date(AT) }).providerStates,
    maxOwnerActions: 16
  });
  assert.equal(before.length - after.length, 1);
  assert.equal(after.some(row => row.providerId === 'sender-net-free'), false);
});

test('the doctor is deterministic and performs no external effect', () => {
  assert.deepEqual(doctor(), doctor());
  const report = doctor();
  assert.equal(report.businessEffectAuthority, 'NONE');
  for (const value of Object.values(report.externalEffectLedger)) assert.equal(value, 0);
  assert.deepEqual(report.commercialTruth, {
    realCustomers: 0, clearedRevenueUsd: 0, acceptedPaidDeliveries: 0, retainedCustomers: 0
  });
});

test('nothing the doctor prints is a credential value', () => {
  // Scanned leaf by leaf rather than over the serialized blob. Serializing
  // first makes `"credentialRuntimeState":"NOT_CONFIGURED"` read as a
  // credential assignment -- the exact false positive the receipt module
  // exempts by name -- and a test that trips on a state's name would push
  // someone to rename the state rather than to stop leaking anything.
  const offenders = [];
  const walk = (value, path) => {
    if (typeof value === 'string') {
      if (containsSecretValue(value)) offenders.push(path);
      return;
    }
    if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) walk(child, `${path}.${key}`);
  };
  walk(doctor(), 'report');
  assert.deepEqual(offenders, []);
});

test('the committed artifacts are the ones the doctor reads', () => {
  const registryFile = JSON.parse(readFileSync('artifacts/outreach/free-first-provider-registry-2026-09-01.json', 'utf8'));
  const receiptFile = JSON.parse(readFileSync('artifacts/outreach/provider-activation-receipts-2026-09-01.json', 'utf8'));
  assert.equal(registry.length, registryFile.providers.length);
  assert.equal(receipts.length, receiptFile.receipts.length);
  assert.equal(registry.length, receipts.length, 'every reviewed provider needs an activation row, even a NOT_STARTED one');
});
