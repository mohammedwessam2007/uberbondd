import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { generateKeyPairSync } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { signDigestHex, sha256 } from '../src/omnia-v9/canonical.mjs';
import { createActionIntent, createEvidenceRecord, admitAction } from '../src/omnia-v9/kernel.mjs';
import { OmniaV9ProofStore } from '../src/omnia-v9/proof-store.mjs';
import { issueShadowApproval, revokeShadowApproval, resolveShadowAuthorityContext, SHADOW_APPROVAL_PURPOSE, ShadowApprovalError } from '../src/omnia-v9/integrations/shadow-approval.mjs';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const keyResolver = keyId => (keyId === 'owner-key-1' ? publicKey : null);
const signer = digest => signDigestHex(digest, privateKey);

async function db() {
  const pglite = new PGlite();
  await pglite.exec(await fs.readFile(new URL('../migrations/005_omnia_v9_proof_store.sql', import.meta.url), 'utf8'));
  await pglite.exec(await fs.readFile(new URL('../migrations/009_omnia_v9_shadow_approval_registry.sql', import.meta.url), 'utf8'));
  const store = new OmniaV9ProofStore({ pool: pglite, keyResolver });
  return { pglite, store };
}

function makeIntent({ now, expiresAt, idempotencyKey, evidenceId, tenantId = 'campaign:c1', resource = 'email:buyer@example.com' }) {
  return createActionIntent({
    missionId: tenantId, tenantId, actorId: 'uberbond-outbound-worker', operation: 'email.send',
    resource, purpose: SHADOW_APPROVAL_PURPOSE, effectClass: 'COMMUNICATE_EXTERNAL',
    argumentsDigest: sha256('args'), evidenceIds: [evidenceId], maxCostUsd: 0.1, blastRadius: 1,
    rollback: 'SUPPRESS_FUTURE_CONTACT', createdAt: now.toISOString(), expiresAt,
    nonce: `nonce:${idempotencyKey}`, idempotencyKey
  }, now);
}

function makeEvidence(id, now) {
  return createEvidenceRecord({
    evidenceId: id, tenantId: 'campaign:c1', subject: 'buyer@example.com', origin: 'EXTERNAL_SOURCE',
    relation: 'DIRECT', verificationClaims: [], lifecycleFlags: ['ACTIVE'],
    sourceRef: 'https://example.com/page', payloadDigest: sha256('excerpt'), observedAt: now.toISOString()
  });
}

test('issueShadowApproval forces the shadow purpose regardless of caller input, and registers it', async () => {
  const { pglite, store } = await db();
  try {
    const now = new Date('2026-08-08T12:00:00Z');
    const { approval, registered } = await issueShadowApproval({
      proofStore: store, pool: pglite, signer,
      approvalId: 'shadow-ap-1', issuerId: 'mohamed', keyId: 'owner-key-1', tenantId: 'campaign:c1',
      actorIds: ['uberbond-outbound-worker'], operations: ['email.send'], resourcePrefixes: ['email:'],
      effectClasses: ['COMMUNICATE_EXTERNAL'], maxBlastRadius: 5, maxCostUsd: 1, maxUses: 3,
      notBefore: new Date(now.getTime() - 60_000).toISOString(), expiresAt: new Date(now.getTime() + 3600_000).toISOString(),
      issuedAt: new Date(now.getTime() - 60_000).toISOString()
    });
    assert.equal(registered, true);
    assert.deepEqual(approval.purposes, [SHADOW_APPROVAL_PURPOSE]);
    const row = await pglite.query('SELECT * FROM omnia_v9_shadow_approval_registry WHERE approval_id = $1', ['shadow-ap-1']);
    assert.equal(row.rows[0].shadow_only, true);
  } finally { await pglite.close(); }
});

test('reusable shadow approval: multiple candidates within scope all reuse it, usage accounting stays atomic and correct', async () => {
  const { pglite, store } = await db();
  try {
    const now = new Date('2026-08-08T12:00:00Z');
    await issueShadowApproval({
      proofStore: store, pool: pglite, signer,
      approvalId: 'shadow-ap-reuse', issuerId: 'mohamed', keyId: 'owner-key-1', tenantId: 'campaign:c1',
      actorIds: ['uberbond-outbound-worker'], operations: ['email.send'], resourcePrefixes: ['email:'],
      effectClasses: ['COMMUNICATE_EXTERNAL'], maxBlastRadius: 5, maxCostUsd: 1, maxUses: 3,
      notBefore: new Date(now.getTime() - 60_000).toISOString(), expiresAt: new Date(now.getTime() + 3600_000).toISOString(),
      issuedAt: new Date(now.getTime() - 60_000).toISOString()
    });

    const decisions = [];
    for (let i = 0; i < 4; i += 1) {
      const authority = await resolveShadowAuthorityContext({ pool: pglite, proofStore: store, tenantId: 'campaign:c1', now });
      const evidenceId = `ev-${i}`;
      const evidence = makeEvidence(evidenceId, now);
      const intent = makeIntent({ now, expiresAt: new Date(now.getTime() + 60_000).toISOString(), idempotencyKey: `k${i}`, evidenceId, resource: `email:buyer${i}@example.com` });
      const result = admitAction(intent, {
        now, approvals: authority.approvals, keyResolver, usageResolver: authority.usageResolver,
        revokedApprovalIds: authority.revokedApprovalIds,
        evidenceResolver: id => (id === evidenceId ? evidence : null),
        evidenceRequirementResolver: () => ({ minCount: 1, allowedOrigins: ['EXTERNAL_SOURCE'] }),
        policyAuthorizer: () => ({ decision: 'ALLOW' }), policyVersion: 'shadow-test-v1',
        policyDigest: sha256('policy'), constitutionDigest: sha256('constitution')
      });
      // Reserve usage for ALLOW decisions the same way a real caller would (proof-store reserveAuthority),
      // so the next resolveShadowAuthorityContext() call sees updated usage.
      if (result.decision === 'ALLOW') {
        const evidenceObj = evidence;
        await store.putObject({ objectType: 'ACTION_INTENT', objectId: intent.intentDigest, tenantId: intent.tenantId, digest: intent.intentDigest, data: intent });
        await store.reserveAuthority({ approvalId: 'shadow-ap-reuse', tenantId: 'campaign:c1', intentDigest: intent.intentDigest, idempotencyKey: intent.idempotencyKey, costDeltaUsd: intent.maxCostUsd, blastRadius: intent.blastRadius, now });
      }
      decisions.push(result.decision);
    }
    assert.deepEqual(decisions, ['ALLOW', 'ALLOW', 'ALLOW', 'REVIEW'], 'the 4th candidate must exceed maxUses=3 and fall back to REVIEW, never a fabricated ALLOW');
    const usage = await store.getApprovalUsage('shadow-ap-reuse');
    assert.equal(usage.uses, 3);
  } finally { await pglite.close(); }
});

test('revocation drill: before revocation a candidate can ALLOW, after revocation the same approval immediately stops covering, no cached authorization survives', async () => {
  const { pglite, store } = await db();
  try {
    const now = new Date('2026-08-08T12:00:00Z');
    await issueShadowApproval({
      proofStore: store, pool: pglite, signer,
      approvalId: 'shadow-ap-revoke', issuerId: 'mohamed', keyId: 'owner-key-1', tenantId: 'campaign:c1',
      actorIds: ['uberbond-outbound-worker'], operations: ['email.send'], resourcePrefixes: ['email:'],
      effectClasses: ['COMMUNICATE_EXTERNAL'], maxBlastRadius: 5, maxCostUsd: 1, maxUses: 5,
      notBefore: new Date(now.getTime() - 60_000).toISOString(), expiresAt: new Date(now.getTime() + 3600_000).toISOString(),
      issuedAt: new Date(now.getTime() - 60_000).toISOString()
    });

    function evaluateOnce(idx, authority) {
      const evidenceId = `ev-rev-${idx}`;
      const evidence = makeEvidence(evidenceId, now);
      const intent = makeIntent({ now, expiresAt: new Date(now.getTime() + 60_000).toISOString(), idempotencyKey: `krev${idx}`, evidenceId, resource: `email:rev${idx}@example.com` });
      return admitAction(intent, {
        now, approvals: authority.approvals, keyResolver, usageResolver: authority.usageResolver,
        revokedApprovalIds: authority.revokedApprovalIds,
        evidenceResolver: id => (id === evidenceId ? evidence : null),
        evidenceRequirementResolver: () => ({ minCount: 1, allowedOrigins: ['EXTERNAL_SOURCE'] }),
        policyAuthorizer: () => ({ decision: 'ALLOW' }), policyVersion: 'shadow-test-v1',
        policyDigest: sha256('policy'), constitutionDigest: sha256('constitution')
      });
    }

    const before = evaluateOnce(0, await resolveShadowAuthorityContext({ pool: pglite, proofStore: store, tenantId: 'campaign:c1', now }));
    assert.equal(before.decision, 'ALLOW');

    await revokeShadowApproval({ proofStore: store, pool: pglite, approvalId: 'shadow-ap-revoke', tenantId: 'campaign:c1', revocationId: 'rev-1', reason: 'reality-shadow-revocation-drill', now });

    const afterAuthority = await resolveShadowAuthorityContext({ pool: pglite, proofStore: store, tenantId: 'campaign:c1', now });
    assert.equal(afterAuthority.revokedApprovalIds.has('shadow-ap-revoke'), true);
    const after = evaluateOnce(1, afterAuthority);
    assert.equal(after.decision, 'REVIEW', 'a revoked approval must never continue to cover an intent, even with the exact same policy authorizer and evidence');

    // Concurrent evaluation started before revocation observed but evaluated after: no cache of the
    // pre-revocation authority context may be reused across evaluations -- each evaluation call must
    // re-resolve authority freshly, which the reality-shadow evaluator does per-candidate.
    await assert.rejects(
      revokeShadowApproval({ proofStore: store, pool: pglite, approvalId: 'shadow-ap-revoke', tenantId: 'wrong-tenant', revocationId: 'rev-2', reason: 'tenant-mismatch-attempt', now }),
      ShadowApprovalError
    );
  } finally { await pglite.close(); }
});

test('expiry drill: a short-lived shadow approval covers before expiry and stops covering after expiry using real timestamp semantics', async () => {
  const { pglite, store } = await db();
  try {
    const issuedAt = new Date('2026-08-08T12:00:00Z');
    const expiresAt = new Date(issuedAt.getTime() + 2000);
    await issueShadowApproval({
      proofStore: store, pool: pglite, signer,
      approvalId: 'shadow-ap-expiry', issuerId: 'mohamed', keyId: 'owner-key-1', tenantId: 'campaign:c1',
      actorIds: ['uberbond-outbound-worker'], operations: ['email.send'], resourcePrefixes: ['email:'],
      effectClasses: ['COMMUNICATE_EXTERNAL'], maxBlastRadius: 5, maxCostUsd: 1, maxUses: 5,
      notBefore: issuedAt.toISOString(), expiresAt: expiresAt.toISOString(), issuedAt: issuedAt.toISOString()
    });

    function evaluateAt(now, idx) {
      const evidenceId = `ev-exp-${idx}`;
      const evidence = makeEvidence(evidenceId, now);
      const intent = makeIntent({ now, expiresAt: new Date(now.getTime() + 60_000).toISOString(), idempotencyKey: `kexp${idx}`, evidenceId, resource: `email:exp${idx}@example.com` });
      return resolveShadowAuthorityContext({ pool: pglite, proofStore: store, tenantId: 'campaign:c1', now }).then(authority =>
        admitAction(intent, {
          now, approvals: authority.approvals, keyResolver, usageResolver: authority.usageResolver,
          revokedApprovalIds: authority.revokedApprovalIds,
          evidenceResolver: id => (id === evidenceId ? evidence : null),
          evidenceRequirementResolver: () => ({ minCount: 1, allowedOrigins: ['EXTERNAL_SOURCE'] }),
          policyAuthorizer: () => ({ decision: 'ALLOW' }), policyVersion: 'shadow-test-v1',
          policyDigest: sha256('policy'), constitutionDigest: sha256('constitution')
        })
      );
    }

    const withinWindow = await evaluateAt(new Date(issuedAt.getTime() + 500), 0);
    assert.equal(withinWindow.decision, 'ALLOW');
    const afterExpiry = await evaluateAt(new Date(expiresAt.getTime() + 500), 1);
    assert.equal(afterExpiry.decision, 'REVIEW', 'an expired shadow approval must stop covering immediately, no clock/string precision regression');
  } finally { await pglite.close(); }
});

test('resolveShadowAuthorityContext never returns approvals belonging to a different tenant', async () => {
  const { pglite, store } = await db();
  try {
    const now = new Date('2026-08-08T12:00:00Z');
    await issueShadowApproval({
      proofStore: store, pool: pglite, signer,
      approvalId: 'shadow-ap-tenant-a', issuerId: 'mohamed', keyId: 'owner-key-1', tenantId: 'campaign:c1',
      actorIds: ['uberbond-outbound-worker'], operations: ['email.send'], resourcePrefixes: ['email:'],
      effectClasses: ['COMMUNICATE_EXTERNAL'], maxBlastRadius: 5, maxCostUsd: 1, maxUses: 5,
      notBefore: new Date(now.getTime() - 60_000).toISOString(), expiresAt: new Date(now.getTime() + 3600_000).toISOString(),
      issuedAt: new Date(now.getTime() - 60_000).toISOString()
    });
    const otherTenant = await resolveShadowAuthorityContext({ pool: pglite, proofStore: store, tenantId: 'campaign:c2', now });
    assert.equal(otherTenant.approvals.length, 0);
  } finally { await pglite.close(); }
});
