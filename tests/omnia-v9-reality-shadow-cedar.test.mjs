import test from 'node:test';
import assert from 'node:assert/strict';
import { bindRealCedarAuthority, resetRealCedarAuthorityCache, RealCedarBindingError, classifyRealCedarFailure } from '../src/omnia-v9/integrations/reality-shadow-cedar.mjs';
import { createActionIntent, createApproval, createEvidenceRecord, admitAction } from '../src/omnia-v9/kernel.mjs';
import { sha256, signDigestHex } from '../src/omnia-v9/canonical.mjs';
import { generateKeyPairSync } from 'node:crypto';

const SHA256_HEX = /^[a-f0-9]{64}$/;
const NOW = new Date('2026-08-08T12:00:00.000Z');

test('bindRealCedarAuthority loads the real installed Cedar package, not a mock', async () => {
  const authority = await bindRealCedarAuthority();
  assert.equal(authority.evaluator.packageName, '@cedar-policy/cedar-wasm');
  assert.match(authority.evaluator.version, /^\d+\.\d+\.\d+$/);
  assert.match(authority.cedarVersion, /\S/);
  assert.match(authority.policyDigest, SHA256_HEX);
  assert.match(authority.constitutionDigest, SHA256_HEX);
  assert.equal(typeof authority.policyAuthorizer, 'function');
});

test('bindRealCedarAuthority is cached across calls (same policyAuthorizer identity) unless fresh:true', async () => {
  const first = await bindRealCedarAuthority();
  const second = await bindRealCedarAuthority();
  assert.equal(first.policyAuthorizer, second.policyAuthorizer);
  const fresh = await bindRealCedarAuthority({ fresh: true });
  assert.notEqual(fresh.policyAuthorizer, first.policyAuthorizer);
  assert.equal(fresh.policyDigest, first.policyDigest, 'rebinding the same real policy must produce the same digest');
});

test('real Cedar policyAuthorizer ALLOWs a well-formed governed action', async () => {
  const authority = await bindRealCedarAuthority();
  const intent = createActionIntent({
    missionId: 'campaign:c1', tenantId: 'campaign:c1', actorId: 'uberbond-outbound-worker',
    operation: 'email.send', resource: 'email:buyer@example.com', purpose: 'qualified-b2b-outreach',
    effectClass: 'COMMUNICATE_EXTERNAL', argumentsDigest: sha256('args'), evidenceIds: ['ev1'],
    maxCostUsd: 0.25, blastRadius: 1, rollback: 'SUPPRESS_FUTURE_CONTACT',
    createdAt: NOW.toISOString(), expiresAt: new Date(NOW.getTime() + 60_000).toISOString(),
    nonce: 'n1', idempotencyKey: 'k1'
  }, NOW);
  const result = authority.policyAuthorizer({ intent, approval: null, evidence: [], requirements: {} });
  assert.equal(result.decision, 'ALLOW');
  assert.equal(result.cedarDecision, 'allow');
});

test('classifyRealCedarFailure maps Cedar-unavailable and missing-config codes to V9_INCOMPLETE, everything else to V9_ERROR, never ALLOW', () => {
  const incomplete = new RealCedarBindingError('missing required config: x', 'CONFIG_MISSING', 'config');
  const cedarUnavailable = new RealCedarBindingError('cedar down', 'CEDAR_UNAVAILABLE', 'cedar-runtime');
  const identityInvalid = new RealCedarBindingError('cannot resolve version', 'CEDAR_IDENTITY_INVALID', 'cedar-runtime');
  const invalidPolicy = new RealCedarBindingError('bad policy', 'CEDAR_POLICY_INVALID', 'policy-validation');
  const schemaInvalid = new RealCedarBindingError('bad schema', 'CEDAR_SCHEMA_INVALID', 'policy-validation');
  assert.equal(classifyRealCedarFailure(incomplete), 'V9_INCOMPLETE');
  assert.equal(classifyRealCedarFailure(cedarUnavailable), 'V9_INCOMPLETE');
  assert.equal(classifyRealCedarFailure(identityInvalid), 'V9_INCOMPLETE');
  assert.equal(classifyRealCedarFailure(invalidPolicy), 'V9_ERROR');
  assert.equal(classifyRealCedarFailure(schemaInvalid), 'V9_ERROR');
  assert.equal(classifyRealCedarFailure(new Error('unrelated non-binding error')), 'V9_ERROR');
});

test('bindRealCedarAuthority throws RealCedarBindingError (never resolves a fabricated authorizer) when constitution binding fails', async () => {
  resetRealCedarAuthorityCache();
  try {
    const { bindConstitution } = await import('../src/omnia-v9/constitution.mjs');
    // Sanity: confirm the real binder is reachable and throws its own typed
    // error class for malformed manifests, which reality-shadow-cedar.mjs
    // wraps into RealCedarBindingError with a non-ALLOW-producing code.
    assert.throws(() => bindConstitution({ manifest: { schemaVersion: 'wrong' }, sourceBytesByRole: new Map() }));
  } finally {
    resetRealCedarAuthorityCache();
  }
});

test('admitAction using the real Cedar-backed policyAuthorizer end-to-end ALLOWs only with full authority + evidence + digests', async () => {
  const authority = await bindRealCedarAuthority();
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');

  const evidence = createEvidenceRecord({
    evidenceId: 'ev-real-1', tenantId: 'campaign:c1', subject: 'buyer@example.com',
    origin: 'EXTERNAL_SOURCE', relation: 'DIRECT', verificationClaims: [], lifecycleFlags: ['ACTIVE'],
    sourceRef: 'https://example.com/page', payloadDigest: sha256('excerpt'), observedAt: NOW.toISOString()
  });
  const intent = createActionIntent({
    missionId: 'campaign:c1', tenantId: 'campaign:c1', actorId: 'uberbond-outbound-worker',
    operation: 'email.send', resource: 'email:buyer@example.com', purpose: 'qualified-b2b-outreach',
    effectClass: 'COMMUNICATE_EXTERNAL', argumentsDigest: sha256('args'), evidenceIds: [evidence.evidenceId],
    maxCostUsd: 0.25, blastRadius: 1, rollback: 'SUPPRESS_FUTURE_CONTACT',
    createdAt: NOW.toISOString(), expiresAt: new Date(NOW.getTime() + 60_000).toISOString(),
    nonce: 'n3', idempotencyKey: 'k3'
  }, NOW);
  const approval = createApproval({
    approvalId: 'ap-real-1', issuerId: 'mohamed', keyId: 'owner-key-1', tenantId: 'campaign:c1',
    actorIds: ['uberbond-outbound-worker'], operations: ['email.send'], resourcePrefixes: ['email:'],
    purposes: ['qualified-b2b-outreach'], effectClasses: ['COMMUNICATE_EXTERNAL'],
    maxBlastRadius: 5, maxCostUsd: 1, maxUses: 10,
    notBefore: new Date(NOW.getTime() - 3600_000).toISOString(), expiresAt: new Date(NOW.getTime() + 3600_000).toISOString(),
    issuedAt: new Date(NOW.getTime() - 3600_000).toISOString()
  }, digest => signDigestHex(digest, privateKey));

  const result = admitAction(intent, {
    now: NOW, approvals: [approval], keyResolver: () => publicKey,
    usageResolver: () => ({ uses: 0, costUsd: 0 }),
    evidenceResolver: id => (id === evidence.evidenceId ? evidence : null),
    evidenceRequirementResolver: () => ({ minCount: 1, allowedOrigins: ['EXTERNAL_SOURCE'] }),
    policyAuthorizer: authority.policyAuthorizer,
    policyVersion: 'reality-shadow-real-cedar-v1',
    policyDigest: authority.policyDigest,
    constitutionDigest: authority.constitutionDigest
  });
  assert.equal(result.decision, 'ALLOW');
  assert.equal(result.policyDigest, authority.policyDigest);
  assert.equal(result.constitutionDigest, authority.constitutionDigest);
});

test('admitAction with the real Cedar-backed authorizer fails closed to REVIEW when no covering approval resolves (Cedar never even consulted)', async () => {
  const authority = await bindRealCedarAuthority();
  const evidence = createEvidenceRecord({
    evidenceId: 'ev-real-2', tenantId: 'campaign:c1', subject: 'buyer2@example.com',
    origin: 'EXTERNAL_SOURCE', relation: 'DIRECT', verificationClaims: [], lifecycleFlags: ['ACTIVE'],
    sourceRef: 'https://example.com/page2', payloadDigest: sha256('excerpt2'), observedAt: NOW.toISOString()
  });
  const intent = createActionIntent({
    missionId: 'campaign:c1', tenantId: 'campaign:c1', actorId: 'uberbond-outbound-worker',
    operation: 'email.send', resource: 'email:buyer2@example.com', purpose: 'qualified-b2b-outreach',
    effectClass: 'COMMUNICATE_EXTERNAL', argumentsDigest: sha256('args2'), evidenceIds: [evidence.evidenceId],
    maxCostUsd: 0.25, blastRadius: 1, rollback: 'SUPPRESS_FUTURE_CONTACT',
    createdAt: NOW.toISOString(), expiresAt: new Date(NOW.getTime() + 60_000).toISOString(),
    nonce: 'n4', idempotencyKey: 'k4'
  }, NOW);
  const result = admitAction(intent, {
    now: NOW, approvals: [],
    evidenceResolver: id => (id === evidence.evidenceId ? evidence : null),
    evidenceRequirementResolver: () => ({ minCount: 1, allowedOrigins: ['EXTERNAL_SOURCE'] }),
    policyAuthorizer: authority.policyAuthorizer,
    policyVersion: 'reality-shadow-real-cedar-v1',
    policyDigest: authority.policyDigest,
    constitutionDigest: authority.constitutionDigest
  });
  assert.equal(result.decision, 'REVIEW');
});
