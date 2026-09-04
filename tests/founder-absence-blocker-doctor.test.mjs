import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import {
  BLOCKER_CLASSES,
  BLOCKING_CLASS_ORDER,
  BLOCKER_REMOVABILITY,
  PROHIBITED_BLOCKER_STATUSES,
  RAGNAROK_BLOCKER_LEDGER,
  evaluateFounderAbsenceBlockers
} from '../src/founder-absence-blocker-doctor.mjs';
import { containsSecretValue } from '../src/secret-patterns.mjs';

const NOW = new Date('2026-09-02T00:00:00.000Z');
const CANARY = 'NOT_A_REAL_CREDENTIAL_0000000000000000';

// The probes the evaluator declares. Supplying only one silently falls back to
// the refusing default for the other, which is how this doctor once reported
// every source-resolved row as open.
const REPO_PROBES = {
  fileExists: relative => existsSync(relative),
  sourceIncludes: (relative, needle) => {
    try { return readFileSync(relative, 'utf8').includes(String(needle)); }
    catch { return false; }
  }
};

const NO_PROBES = { fileExists: () => false, sourceIncludes: () => false };

const FULL_ENV = Object.freeze({
  DATABASE_URL: CANARY,
  TOKEN_ENCRYPTION_KEY: CANARY,
  ADMIN_TOKEN: CANARY,
  UBERBOND_AGENT_RELAY_TOKEN: CANARY,
  AI_GATEWAY_API_KEY: CANARY,
  AI_GATEWAY_INPUT_USD_PER_MILLION: '1',
  AI_GATEWAY_OUTPUT_USD_PER_MILLION: '2',
  AI_GATEWAY_PRICING_SOURCE: 'https://vercel.com/docs/ai-gateway/pricing',
  AI_GATEWAY_PRICING_VERIFIED_AT: '2026-09-01T00:00:00.000Z',
  LEMONSQUEEZY_WEBHOOK_SECRET: CANARY,
  POSTAL_WEBHOOK_PUBLIC_KEY: CANARY,
  OUTREACH_APPROVAL_SECRET: CANARY,
  OUTBOUND_MESSAGE_ID_DOMAIN: 'uberbond.agency'
});

const report = (overrides = {}) => evaluateFounderAbsenceBlockers({ now: NOW, probes: REPO_PROBES, ...overrides });

test('every ledger row is classified, removable and non-prohibited by construction', () => {
  const result = report({ env: {} });
  assert.equal(result.ok, true);
  assert.deepEqual(result.unclassifiable, [], 'a blocker nobody could classify is a blocker nobody will fix');
  for (const row of result.blockers) {
    assert.ok(BLOCKER_CLASSES.includes(row.blockerClass), `${row.id}: undeclared class ${row.blockerClass}`);
    assert.ok(BLOCKER_REMOVABILITY.includes(row.removability), `${row.id}: undeclared removability`);
    assert.equal(PROHIBITED_BLOCKER_STATUSES.includes(row.status), false,
      `${row.id}: resting in ${row.status}, which is a synonym for unfinished`);
  }
  assert.equal(result.blockers.length, RAGNAROK_BLOCKER_LEDGER.length);
});

test('with nothing configured the first blocking class is the first one in dependency order', () => {
  const result = report({ env: {} });
  assert.equal(result.firstBlockingClass, 'CREDENTIAL_BLOCKED');
  assert.equal(result.overallStatus, 'CREDENTIAL_BLOCKED');
  assert.equal(BLOCKING_CLASS_ORDER[0], 'CREDENTIAL_BLOCKED');
});

test('CODE_READY is unreportable while any credential, account or payment blocker is open', () => {
  for (const env of [{}, { DATABASE_URL: CANARY }, FULL_ENV]) {
    const result = report({ env });
    if (result.overallStatus === 'CODE_READY') {
      const blocking = result.blockers.filter(row => ['CREDENTIAL_BLOCKED', 'ACCOUNT_BLOCKED', 'PAYMENT_BLOCKED'].includes(row.blockerClass)
        && !['RESOLVED', 'VERIFIED_RESOLVED'].includes(row.status));
      assert.deepEqual(blocking.map(row => row.id), [],
        'CODE_READY was reported while a credential, account or payment blocker was open');
    }
  }
});

test('software gaps are measured against the tree, not asserted', () => {
  // The same ledger, the same moment, two different answers -- because the
  // probes see different trees. A gap list that did not move here would be a
  // hardcoded list wearing a measurement's clothes.
  const measured = report({ env: FULL_ENV });
  const blind = evaluateFounderAbsenceBlockers({ env: FULL_ENV, now: NOW, probes: NO_PROBES });
  assert.ok(blind.softwareGaps.length > measured.softwareGaps.length,
    'the gap list is identical whether or not anything can look at the repository');
});

test('elapsed founder-absence evidence cannot be produced by running this', () => {
  const withoutProof = report({ env: FULL_ENV });
  assert.equal(withoutProof.elapsedEvidence.satisfied, false);

  // A proof whose commit is not this tree's is somebody else's proof.
  const wrongCommit = report({
    env: FULL_ENV,
    currentSourceCommit: 'a'.repeat(40),
    observationProof: {
      observedFrom: '2026-08-01T00:00:00.000Z',
      observedThrough: '2026-09-01T00:00:00.000Z',
      successfulTicks: 5000,
      sourceCommit: 'b'.repeat(40)
    }
  });
  assert.equal(wrongCommit.elapsedEvidence.satisfied, false,
    'an observation of a different tree counted as this one running unattended');
});

test('the owner action queue stays short, atomic and free', () => {
  const result = report({ env: {} });
  assert.ok(result.ownerActionQueueLength <= 3, 'more owner actions than a person will do in one sitting');
  assert.equal(result.ownerActionQueue.length, result.ownerActionQueueLength);
  for (const action of result.ownerActionQueue) {
    assert.ok(action.action && action.action.length > 10);
    assert.ok(action.screen && action.screen.length > 5);
    assert.equal(typeof action.minutes, 'number');
    assert.ok(action.evidenceOfCompletion && action.evidenceOfCompletion.length > 5,
      `${action.blockerId}: no way to tell whether it was done`);
  }
});

test('an owner action exists only for a blocker a person can actually clear', () => {
  const result = report({ env: {} });
  for (const action of result.ownerActionQueue) {
    const row = result.blockers.find(item => item.id === action.blockerId);
    assert.ok(row, `${action.blockerId}: queued action for an unknown blocker`);
    assert.equal(row.removability, 'EXTERNAL_HUMAN_ATOMIC',
      `${row.id}: asked a person to clear a ${row.removability} blocker`);
  }
});

test('environment values never reach the report', () => {
  const printed = JSON.stringify(report({ env: FULL_ENV }));
  assert.equal(printed.includes(CANARY), false);
  assert.equal(containsSecretValue(printed), false);
});

test('the report performs no external effect', () => {
  const result = report({ env: FULL_ENV });
  assert.equal(result.businessEffectAuthority, 'NONE');
  for (const value of Object.values(result.externalEffectLedger)) assert.equal(value, 0);
});
