import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { ZERO_EFFECTS } from '../src/cloud-agent-relay.mjs';
import { compileRelayDeploymentAttemptReceipt } from '../src/relay-deployment-attempt.mjs';
import { compileRelayPreviewReceipt } from '../src/relay-preview-proof.mjs';
import { createRelayPreviewRun } from '../src/relay-preview-runbook.mjs';
import { compileRelayShadowBindingPlan } from '../src/relay-shadow-binding.mjs';

const EXPECTED = {
  providerCalls: 0,
  messages: 0,
  purchases: 0,
  deployments: 0,
  credentialChanges: 0,
  dnsChanges: 0,
  productionMutations: 0,
  spendCents: 0
};

const CONSUMERS = [
  'src/relay-deployment-attempt.mjs',
  'src/relay-preview-proof.mjs',
  'src/relay-preview-runbook.mjs',
  'src/relay-shadow-binding.mjs'
];

test('canonical zero-effect ledger has the complete immutable contract', () => {
  assert.deepEqual(ZERO_EFFECTS, EXPECTED);
  assert.equal(Object.isFrozen(ZERO_EFFECTS), true);
});

test('relay safety consumers import the canonical ledger and declare no private copy', () => {
  for (const path of CONSUMERS) {
    const source = fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
    assert.match(source, /import \{ ZERO_EFFECTS \} from '\.\/cloud-agent-relay\.mjs';/);
    assert.doesNotMatch(source, /const ZERO_EFFECTS\s*=/);
  }
});

test('deployment attempt default receipt uses the canonical shape', () => {
  const receipt = compileRelayDeploymentAttemptReceipt({
    eligibilityDecision: { ok: false },
    bundleDigest: 'a'.repeat(64),
    date: '2026-08-20T20:00:00.000Z'
  });
  assert.deepEqual(receipt.externalEffectLedger, EXPECTED);
});

test('preview proof failure uses the canonical shape', () => {
  const receipt = compileRelayPreviewReceipt({});
  assert.deepEqual(receipt.externalEffectLedger, EXPECTED);
});

test('preview run starts with the canonical shape', () => {
  const run = createRelayPreviewRun({
    bundleDigest: 'b'.repeat(64),
    resetAt: '2026-08-21T01:26:31.833Z',
    date: '2026-08-20T20:00:00.000Z'
  });
  assert.deepEqual(run.externalEffectLedger, EXPECTED);
});

test('shadow binding rejection uses the canonical shape', () => {
  const decision = compileRelayShadowBindingPlan({});
  assert.deepEqual(decision.externalEffectLedger, EXPECTED);
});
