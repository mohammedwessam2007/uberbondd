import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { generateKeyPairSync } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { signDigestHex, sha256 } from '../src/omnia-v9/canonical.mjs';
import { createActionIntent, createEvidenceRecord, approvalCoversIntent } from '../src/omnia-v9/kernel.mjs';
import { OmniaV9ProofStore } from '../src/omnia-v9/proof-store.mjs';
import { issueCanaryApproval, CANARY_NULL_OPERATION, CANARY_NULL_EFFECT_CLASS, CANARY_NULL_PURPOSE } from '../src/omnia-v9/integrations/canary-approval.mjs';
import { NullConsequenceAdapter } from '../src/omnia-v9/integrations/null-consequence-adapter.mjs';
import { bindRealCedarAuthority } from '../src/omnia-v9/integrations/reality-shadow-cedar.mjs';
import { evaluateAndGateCanaryNull } from '../src/omnia-v9/integrations/canary-null-authority.mjs';

/**
 * "Authority attenuation" tests: attempts to make a canary-only approval
 * cover a real, Gmail-shaped email.send intent by substituting one field
 * at a time. Every attempt is expected to fail -- a canary approval must
 * remain structurally incapable of authorizing a real send, not merely
 * unlikely to be misused for one.
 */

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const keyResolver = keyId => (keyId === 'owner-key-1' ? publicKey : null);
const signer = digest => signDigestHex(digest, privateKey);
const NOW = new Date('2026-08-08T12:00:00.000Z');

async function realDb() {
  const pglite = new PGlite();
  await pglite.exec(await fs.readFile(new URL('../migrations/005_omnia_v9_proof_store.sql', import.meta.url), 'utf8'));
  await pglite.exec(await fs.readFile(new URL('../migrations/009_omnia_v9_shadow_approval_registry.sql', import.meta.url), 'utf8'));
  const store = new OmniaV9ProofStore({ pool: pglite, keyResolver });
  return { pglite, store };
}

async function issueBaselineCanaryApproval(store, pglite, overrides = {}) {
  return issueCanaryApproval({
    proofStore: store, pool: pglite, signer, approvalId: 'canary-ap-attenuation', issuerId: 'mohamed', keyId: 'owner-key-1', tenantId: 'campaign:canary',
    actorIds: ['uberbond-canary-worker'], resourcePrefixes: ['null-sink:'], maxBlastRadius: 1, maxCostUsd: 0, maxUses: 5,
    notBefore: new Date(NOW.getTime() - 3600_000).toISOString(), expiresAt: new Date(NOW.getTime() + 3600_000).toISOString(), issuedAt: new Date(NOW.getTime() - 3600_000).toISOString(),
    ...overrides
  });
}

function realEmailIntent(overrides = {}) {
  return createActionIntent({
    missionId: 'campaign:canary', tenantId: 'campaign:canary', actorId: 'uberbond-canary-worker',
    operation: 'email.send', resource: 'email:realbuyer@example.com', purpose: 'qualified-b2b-outreach',
    effectClass: 'COMMUNICATE_EXTERNAL', argumentsDigest: sha256('args'), evidenceIds: ['ev-attack'],
    maxCostUsd: 0, blastRadius: 1, rollback: 'NONE', createdAt: NOW.toISOString(),
    expiresAt: new Date(NOW.getTime() + 60_000).toISOString(), nonce: 'attack-1', idempotencyKey: 'attack-1',
    ...overrides
  }, NOW);
}

test('operation substitution: a canary approval never covers an intent whose operation is email.send', async () => {
  const { pglite, store } = await realDb();
  try {
    const { approval } = await issueBaselineCanaryApproval(store, pglite);
    const intent = realEmailIntent();
    const coverage = approvalCoversIntent(approval, intent, { uses: 0, costUsd: 0 });
    assert.equal(coverage.ok, false);
    assert(coverage.errors.includes('scope:operation'));
  } finally { await pglite.close(); }
});

test('purpose substitution: a canary approval never covers an intent using the real qualified-b2b-outreach purpose', async () => {
  const { pglite, store } = await realDb();
  try {
    const { approval } = await issueBaselineCanaryApproval(store, pglite);
    // Operation kept canary-shaped so only purpose is under attack.
    const intent = realEmailIntent({ operation: CANARY_NULL_OPERATION, effectClass: CANARY_NULL_EFFECT_CLASS, resource: 'null-sink:attack', purpose: 'qualified-b2b-outreach' });
    const coverage = approvalCoversIntent(approval, intent, { uses: 0, costUsd: 0 });
    assert.equal(coverage.ok, false);
    assert(coverage.errors.includes('scope:purpose'));
  } finally { await pglite.close(); }
});

test('resource substitution: a canary approval never covers an intent whose resource is a real email address, even with a canary-shaped operation/purpose', async () => {
  const { pglite, store } = await realDb();
  try {
    const { approval } = await issueBaselineCanaryApproval(store, pglite);
    const intent = realEmailIntent({ operation: CANARY_NULL_OPERATION, effectClass: CANARY_NULL_EFFECT_CLASS, purpose: CANARY_NULL_PURPOSE, resource: 'email:realbuyer@example.com' });
    const coverage = approvalCoversIntent(approval, intent, { uses: 0, costUsd: 0 });
    assert.equal(coverage.ok, false);
    assert(coverage.errors.includes('scope:resource'));
  } finally { await pglite.close(); }
});

test('effect-class substitution: a canary approval never covers an intent declaring COMMUNICATE_EXTERNAL', async () => {
  const { pglite, store } = await realDb();
  try {
    const { approval } = await issueBaselineCanaryApproval(store, pglite);
    const intent = realEmailIntent({ operation: CANARY_NULL_OPERATION, resource: 'null-sink:attack', purpose: CANARY_NULL_PURPOSE, effectClass: 'COMMUNICATE_EXTERNAL' });
    const coverage = approvalCoversIntent(approval, intent, { uses: 0, costUsd: 0 });
    assert.equal(coverage.ok, false);
    assert(coverage.errors.includes('scope:effect'));
  } finally { await pglite.close(); }
});

test('tenant substitution: a canary approval never covers an intent from a different tenant', async () => {
  const { pglite, store } = await realDb();
  try {
    const { approval } = await issueBaselineCanaryApproval(store, pglite);
    const intent = createActionIntent({
      missionId: 'campaign:other', tenantId: 'campaign:other', actorId: 'uberbond-canary-worker', operation: CANARY_NULL_OPERATION,
      resource: 'null-sink:attack', purpose: CANARY_NULL_PURPOSE, effectClass: CANARY_NULL_EFFECT_CLASS,
      argumentsDigest: sha256('args'), evidenceIds: ['ev-attack'], maxCostUsd: 0, blastRadius: 1, rollback: 'NONE',
      createdAt: NOW.toISOString(), expiresAt: new Date(NOW.getTime() + 60_000).toISOString(), nonce: 'attack-tenant', idempotencyKey: 'attack-tenant'
    }, NOW);
    const coverage = approvalCoversIntent(approval, intent, { uses: 0, costUsd: 0 });
    assert.equal(coverage.ok, false);
    assert(coverage.errors.includes('scope:tenant'));
  } finally { await pglite.close(); }
});

test('capability substitution: a canary approval mutated post-signing to raise maxCostUsd/maxBlastRadius fails signature verification, not scope', async () => {
  const { pglite, store } = await realDb();
  try {
    const { approval } = await issueBaselineCanaryApproval(store, pglite);
    const { verifyApproval } = await import('../src/omnia-v9/kernel.mjs');
    const inflated = { ...approval, maxCostUsd: 999, maxBlastRadius: 999 };
    const verification = verifyApproval(inflated, { now: NOW, keyResolver });
    assert.equal(verification.ok, false);
    assert(verification.errors.some(e => e.includes('digest-mismatch') || e.includes('signature-invalid')));
  } finally { await pglite.close(); }
});

test('policy substitution: evaluateAndGateCanaryNull has no parameter through which a caller can override policyDigest/constitutionDigest independent of the bound Cedar authority', async () => {
  // The function only accepts a single `cedarAuthority` object and always reads
  // policyDigest/constitutionDigest/policyAuthorizer from that one object --
  // there is no separate policyDigest/constitutionDigest argument to smuggle
  // a mismatched label through, unlike a hypothetical API that took them
  // as independent parameters.
  const source = await (await import('node:fs/promises')).readFile(
    new URL('../src/omnia-v9/integrations/canary-null-authority.mjs', import.meta.url), 'utf8'
  );
  const paramsBlock = source.slice(source.indexOf('export async function evaluateAndGateCanaryNull'), source.indexOf('export async function evaluateAndGateCanaryNull') + 400);
  assert.doesNotMatch(paramsBlock, /\bpolicyDigest\b(?!.*cedarAuthority)/, 'no standalone policyDigest parameter should exist');
  assert.match(paramsBlock, /cedarAuthority/);
});

test('constitution substitution: even a maximally permissive alternate Cedar authority cannot make a canary approval cover a real email.send intent, because approval scope is checked before Cedar is ever consulted', async () => {
  const { pglite, store } = await realDb();
  try {
    await issueBaselineCanaryApproval(store, pglite);
    const alwaysAllowAuthority = { policyAuthorizer: () => ({ decision: 'ALLOW' }), policyDigest: sha256('fake-permissive-policy'), constitutionDigest: sha256('fake-permissive-constitution') };
    const adapter = new NullConsequenceAdapter();
    const evidence = createEvidenceRecord({
      evidenceId: 'ev-attack', tenantId: 'campaign:canary', subject: 'realbuyer@example.com', origin: 'SYNTHETIC_FIXTURE',
      relation: 'DIRECT', verificationClaims: [], lifecycleFlags: ['ACTIVE'], sourceRef: 'synthetic:fixture', payloadDigest: sha256('p'), observedAt: NOW.toISOString()
    });
    // Attempt to smuggle a real email.send intent through evaluateAndGateCanaryNull using an
    // authority that would ALLOW absolutely anything Cedar is asked about.
    const forgedIntent = realEmailIntent();
    let threw = false;
    let result = null;
    try {
      result = await evaluateAndGateCanaryNull({
        pool: pglite, proofStore: store, tenantId: 'campaign:canary', cedarAuthority: alwaysAllowAuthority, keyResolver, adapter,
        intent: forgedIntent, evidence, now: NOW
      });
    } catch {
      threw = true;
    }
    if (!threw) {
      assert.equal(result.executed, false, 'a real email.send intent must never execute the null sink even against a maximally permissive fake Cedar authority');
    }
    assert.equal(adapter.executionCount(), 0);
  } finally { await pglite.close(); }
});
