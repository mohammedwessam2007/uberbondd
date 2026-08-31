import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  validateExternalCapabilityRegistry,
  summarizeExternalCapabilities,
  planExternalCapabilityUse,
  defaultCapabilityForTask
} from '../src/external-capability-control-plane.mjs';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const registry = JSON.parse(fs.readFileSync(path.join(root, 'artifacts/external-skill-plugin-registry.json'), 'utf8'));

test('owner-provided external capability registry is complete, bounded, and zero-authority', () => {
  const result = validateExternalCapabilityRegistry(registry);
  assert.equal(result.ok, true);
  assert.equal(result.registry.entries.length, 8);
  assert.match(result.capabilityDigest, /^[a-f0-9]{64}$/);
  assert.equal(result.businessEffectAuthority, 'NONE');
  assert.equal(result.externalEffectLedger.spendCents, 0);
});

test('summary exposes every capability without promoting runtime installation', () => {
  const result = summarizeExternalCapabilities(registry);
  assert.equal(result.ok, true);
  assert.equal(result.capabilityCount, 8);
  assert.deepEqual(new Set(result.capabilities.map(item => item.id)), new Set([
    'find-skills',
    'claude-code-setup',
    'task-observer',
    'claude-mem',
    'headroom',
    'omniroute',
    'strix',
    'agent-reach'
  ]));
  assert.ok(result.capabilities.every(item => item.integrationStatus));
});

test('task defaults route to the intended supplier', () => {
  assert.equal(defaultCapabilityForTask('skill-discovery'), 'find-skills');
  assert.equal(defaultCapabilityForTask('automation-audit'), 'claude-code-setup');
  assert.equal(defaultCapabilityForTask('skill-learning'), 'task-observer');
  assert.equal(defaultCapabilityForTask('session-memory'), 'claude-mem');
  assert.equal(defaultCapabilityForTask('context-compression'), 'headroom');
  assert.equal(defaultCapabilityForTask('model-routing'), 'omniroute');
  assert.equal(defaultCapabilityForTask('security-verification'), 'strix');
  assert.equal(defaultCapabilityForTask('world-sensing'), 'agent-reach');
});

test('project-local discovery and audit skills are immediately usable with no business authority', () => {
  for (const capabilityId of ['find-skills', 'claude-code-setup']) {
    const result = planExternalCapabilityUse({ registry, capabilityId });
    assert.equal(result.ok, true);
    assert.equal(result.decision, 'ALLOW');
    assert.equal(result.status, 'PROJECT_SKILL_READY');
    assert.equal(result.businessEffectAuthority, 'NONE');
  }
});

test('task observer can recommend but never silently mutate skills', () => {
  const result = planExternalCapabilityUse({ registry, capabilityId: 'task-observer' });
  assert.equal(result.ok, true);
  assert.equal(result.decision, 'ALLOW');
  assert.equal(result.requiredOutputClass, 'PROPOSED_SKILL_UPDATE_OR_OBSERVATION');
  assert.ok(result.reasonCodes.includes('skill-mutation-remains-review-gated'));
});

test('claude-mem remains dormant until a real runtime exists and cannot ingest secrets', () => {
  const dormant = planExternalCapabilityUse({ registry, capabilityId: 'claude-mem', runtimeAvailable: false });
  assert.equal(dormant.decision, 'REVIEW');
  assert.equal(dormant.status, 'RUNTIME_NOT_ACTIVE');

  const secret = planExternalCapabilityUse({ registry, capabilityId: 'claude-mem', runtimeAvailable: true, dataClass: 'SECRET' });
  assert.equal(secret.decision, 'DENY');
  assert.equal(secret.status, 'SENSITIVE_DATA_NOT_APPROVED');

  const ready = planExternalCapabilityUse({ registry, capabilityId: 'claude-mem', runtimeAvailable: true });
  assert.equal(ready.decision, 'ALLOW');
  assert.equal(ready.truthAuthority, 'ADVISORY_WORKING_MEMORY_ONLY');
});

test('headroom cannot save tokens by destroying authoritative proof', () => {
  const denied = planExternalCapabilityUse({
    registry,
    capabilityId: 'headroom',
    runtimeAvailable: true,
    preserveAuthoritativeOriginal: false
  });
  assert.equal(denied.decision, 'DENY');
  assert.equal(denied.status, 'AUTHORITATIVE_ORIGINAL_REQUIRED');

  const allowed = planExternalCapabilityUse({
    registry,
    capabilityId: 'headroom',
    runtimeAvailable: true,
    preserveAuthoritativeOriginal: true
  });
  assert.equal(allowed.decision, 'ALLOW');
});

test('omniroute cannot silently route through an unobservable provider', () => {
  const hidden = planExternalCapabilityUse({
    registry,
    capabilityId: 'omniroute',
    runtimeAvailable: true,
    explicitProviderConfig: true,
    providerIdentityObservable: false
  });
  assert.equal(hidden.decision, 'DENY');
  assert.equal(hidden.status, 'PROVIDER_IDENTITY_MUST_REMAIN_OBSERVABLE');

  const allowed = planExternalCapabilityUse({
    registry,
    capabilityId: 'omniroute',
    runtimeAvailable: true,
    explicitProviderConfig: true,
    providerIdentityObservable: true
  });
  assert.equal(allowed.decision, 'ALLOW');
  assert.equal(allowed.status, 'BOUNDED_MODEL_ROUTING_ALLOWED');
});

test('strix is allowed for owned preview targets but denied for unrelated third parties', () => {
  const preview = planExternalCapabilityUse({
    registry,
    capabilityId: 'strix',
    runtimeAvailable: true,
    targetClass: 'OWNED_PREVIEW',
    dataClass: 'SOURCE_CODE'
  });
  assert.equal(preview.decision, 'ALLOW');
  assert.equal(preview.businessEffectAuthority, 'SECURITY_TEST_ONLY');

  const thirdParty = planExternalCapabilityUse({
    registry,
    capabilityId: 'strix',
    runtimeAvailable: true,
    targetClass: 'THIRD_PARTY'
  });
  assert.equal(thirdParty.decision, 'DENY');
  assert.equal(thirdParty.status, 'UNAUTHORIZED_SECURITY_TARGET');
});

test('strix production scope requires explicit production security authority', () => {
  const review = planExternalCapabilityUse({
    registry,
    capabilityId: 'strix',
    runtimeAvailable: true,
    targetClass: 'OWNED_PRODUCTION'
  });
  assert.equal(review.decision, 'REVIEW');

  const allowed = planExternalCapabilityUse({
    registry,
    capabilityId: 'strix',
    runtimeAvailable: true,
    targetClass: 'OWNED_PRODUCTION',
    explicitAuthority: true
  });
  assert.equal(allowed.decision, 'ALLOW');
});

test('agent reach fails closed around login sessions and access bypass', () => {
  const login = planExternalCapabilityUse({
    registry,
    capabilityId: 'agent-reach',
    runtimeAvailable: true,
    targetClass: 'PUBLIC_WEB',
    sourceAuthorized: true,
    requiresLogin: true
  });
  assert.equal(login.decision, 'DENY');
  assert.equal(login.status, 'PRIVATE_SESSION_NOT_APPROVED');

  const bypass = planExternalCapabilityUse({
    registry,
    capabilityId: 'agent-reach',
    runtimeAvailable: true,
    targetClass: 'PUBLIC_WEB',
    sourceAuthorized: true,
    bypassRequired: true
  });
  assert.equal(bypass.decision, 'DENY');
  assert.equal(bypass.status, 'ACCESS_BYPASS_PROHIBITED');
});

test('agent reach permits bounded public research only when the source is authorized', () => {
  const unresolved = planExternalCapabilityUse({
    registry,
    capabilityId: 'agent-reach',
    runtimeAvailable: true,
    targetClass: 'PUBLIC_WEB',
    sourceAuthorized: false
  });
  assert.equal(unresolved.decision, 'REVIEW');
  assert.equal(unresolved.status, 'SOURCE_AUTHORIZATION_REQUIRED');

  const allowed = planExternalCapabilityUse({
    registry,
    capabilityId: 'agent-reach',
    runtimeAvailable: true,
    targetClass: 'PUBLIC_WEB',
    sourceAuthorized: true
  });
  assert.equal(allowed.decision, 'ALLOW');
  assert.equal(allowed.status, 'PUBLIC_RESEARCH_ALLOWED');
  assert.equal(allowed.externalEffectLedger.providerCalls, 0);
  assert.equal(allowed.externalEffectLedger.messages, 0);
  assert.equal(allowed.externalEffectLedger.spendCents, 0);
});

test('registry corruption fails closed', () => {
  const corrupted = structuredClone(registry);
  corrupted.entries[0].authority = 'DO_WHATEVER';
  const result = validateExternalCapabilityRegistry(corrupted);
  assert.equal(result.ok, false);
  assert.equal(result.decision, 'DENY');
  assert.ok(result.reasonCodes.includes('invalid-capability-entry'));
});
