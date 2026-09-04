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
const expectedIds = new Set([
  'find-skills',
  'claude-code-setup',
  'task-observer',
  'claude-mem',
  'headroom',
  'omniroute',
  'strix',
  'agent-reach',
  'fable-orchestrator',
  'metaswarm',
  'superpowers'
]);

test('external capability registry is expandable, bounded, complete, and zero-authority', () => {
  const result = validateExternalCapabilityRegistry(registry);
  assert.equal(result.ok, true);
  assert.equal(result.registry.entries.length, 11);
  assert.match(result.capabilityDigest, /^[a-f0-9]{64}$/);
  assert.equal(result.businessEffectAuthority, 'NONE');
  assert.equal(result.externalEffectLedger.spendCents, 0);
});

test('summary exposes every current supplier without promoting optional runtimes', () => {
  const result = summarizeExternalCapabilities(registry);
  assert.equal(result.ok, true);
  assert.equal(result.capabilityCount, 11);
  assert.deepEqual(new Set(result.capabilities.map(item => item.id)), expectedIds);
  assert.ok(result.capabilities.every(item => item.integrationStatus));
});

test('registry can grow beyond the current pack without relaxing required seeds or policy', () => {
  const expanded = structuredClone(registry);
  expanded.entries.push({
    id: 'future-safe-donor',
    name: 'Future Safe Donor',
    source: 'https://github.com/example/future-safe-donor',
    upstream: 'example/future-safe-donor',
    sourceRef: '0123456789abcdef0123456789abcdef01234567',
    license: 'MIT',
    class: 'REFERENCE_ONLY',
    role: 'Synthetic future registry-extension fixture.',
    uberbondUse: 'Proves bounded growth does not require rewriting a magic capability count.',
    activation: 'REFERENCE_ONLY',
    authority: 'NONE',
    risk: 'LOW',
    projectIntegration: { status: 'DECLARED_REFERENCE' },
    notes: []
  });
  const result = validateExternalCapabilityRegistry(expanded);
  assert.equal(result.ok, true);
  assert.equal(result.registry.entries.length, 12);
});

test('removing a core seed supplier fails closed even though the registry is expandable', () => {
  const missing = structuredClone(registry);
  missing.entries = missing.entries.filter(entry => entry.id !== 'agent-reach');
  const result = validateExternalCapabilityRegistry(missing);
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('missing-core-capability:agent-reach'));
});

test('task defaults route to the intended supplier including orchestration planning', () => {
  assert.equal(defaultCapabilityForTask('skill-discovery'), 'find-skills');
  assert.equal(defaultCapabilityForTask('automation-audit'), 'claude-code-setup');
  assert.equal(defaultCapabilityForTask('skill-learning'), 'task-observer');
  assert.equal(defaultCapabilityForTask('session-memory'), 'claude-mem');
  assert.equal(defaultCapabilityForTask('context-compression'), 'headroom');
  assert.equal(defaultCapabilityForTask('model-routing'), 'omniroute');
  assert.equal(defaultCapabilityForTask('security-verification'), 'strix');
  assert.equal(defaultCapabilityForTask('world-sensing'), 'agent-reach');
  assert.equal(defaultCapabilityForTask('orchestration-planning'), 'fable-orchestrator');
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

test('Fable provider-neutral protocol is usable without pretending a live Fable runtime exists', () => {
  const result = planExternalCapabilityUse({ registry, taskKind: 'orchestration-planning' });
  assert.equal(result.ok, true);
  assert.equal(result.decision, 'ALLOW');
  assert.equal(result.status, 'ORCHESTRATION_PROTOCOL_READY');
  assert.equal(result.liveRuntimeProven, false);
  assert.equal(result.businessEffectAuthority, 'NONE');
});

test('live Fable runtime requires real runtime, planner identity and a verified callable worker menu', () => {
  const noRuntime = planExternalCapabilityUse({
    registry,
    capabilityId: 'fable-orchestrator',
    liveRuntimeRequested: true
  });
  assert.equal(noRuntime.decision, 'REVIEW');
  assert.equal(noRuntime.status, 'FABLE_RUNTIME_NOT_ACTIVE');

  const hiddenPlanner = planExternalCapabilityUse({
    registry,
    capabilityId: 'fable-orchestrator',
    liveRuntimeRequested: true,
    runtimeAvailable: true
  });
  assert.equal(hiddenPlanner.decision, 'REVIEW');
  assert.equal(hiddenPlanner.status, 'PLANNER_IDENTITY_REQUIRED');

  const unverifiedWorkers = planExternalCapabilityUse({
    registry,
    capabilityId: 'fable-orchestrator',
    liveRuntimeRequested: true,
    runtimeAvailable: true,
    plannerIdentityObservable: true
  });
  assert.equal(unverifiedWorkers.decision, 'REVIEW');
  assert.equal(unverifiedWorkers.status, 'CALLABLE_WORKER_MENU_REQUIRED');

  const allowed = planExternalCapabilityUse({
    registry,
    capabilityId: 'fable-orchestrator',
    liveRuntimeRequested: true,
    runtimeAvailable: true,
    plannerIdentityObservable: true,
    callableWorkerMenuVerified: true
  });
  assert.equal(allowed.decision, 'ALLOW');
  assert.equal(allowed.status, 'BOUNDED_FABLE_RUNTIME_ALLOWED');
  assert.equal(allowed.plannerAuthority, 'PLAN_AND_ADJUDICATE_ONLY');
  assert.equal(allowed.businessEffectAuthority, 'NONE');
});

test('Fable packet still rejects secrets before either protocol or live runtime use', () => {
  const result = planExternalCapabilityUse({
    registry,
    capabilityId: 'fable-orchestrator',
    dataClass: 'CREDENTIAL'
  });
  assert.equal(result.decision, 'DENY');
  assert.equal(result.status, 'SENSITIVE_DATA_NOT_APPROVED');
});

test('Metaswarm and Superpowers are method donors without wholesale-install authority', () => {
  for (const capabilityId of ['metaswarm', 'superpowers']) {
    const result = planExternalCapabilityUse({ registry, capabilityId });
    assert.equal(result.ok, true);
    assert.equal(result.decision, 'ALLOW');
    assert.equal(result.status, 'CANONICAL_METHOD_DONOR_READY');
    assert.equal(result.installationAuthority, 'NONE');
    assert.equal(result.businessEffectAuthority, 'NONE');
  }
});

test('registry corruption still fails closed', () => {
  const corrupted = structuredClone(registry);
  corrupted.entries[0].authority = 'DO_WHATEVER';
  const result = validateExternalCapabilityRegistry(corrupted);
  assert.equal(result.ok, false);
  assert.equal(result.decision, 'DENY');
  assert.ok(result.reasonCodes.includes('invalid-capability-entry'));
});

test('unknown newly registered capability still needs capability-specific policy', () => {
  const expanded = structuredClone(registry);
  expanded.entries.push({
    id: 'future-safe-donor',
    name: 'Future Safe Donor',
    source: 'https://github.com/example/future-safe-donor',
    upstream: 'example/future-safe-donor',
    sourceRef: '0123456789abcdef0123456789abcdef01234567',
    license: 'MIT',
    class: 'REFERENCE_ONLY',
    role: 'Synthetic future registry-extension fixture.',
    uberbondUse: 'Exercises capability-specific fail-closed planning.',
    activation: 'REFERENCE_ONLY',
    authority: 'NONE',
    risk: 'LOW',
    projectIntegration: { status: 'DECLARED_REFERENCE' },
    notes: []
  });
  const result = planExternalCapabilityUse({ registry: expanded, capabilityId: 'future-safe-donor' });
  assert.equal(result.decision, 'DENY');
  assert.equal(result.status, 'NO_CAPABILITY_POLICY');
});
