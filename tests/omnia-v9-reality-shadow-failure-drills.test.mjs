import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { generateKeyPairSync } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { signDigestHex, sha256 } from '../src/omnia-v9/canonical.mjs';
import { OmniaV9ProofStore } from '../src/omnia-v9/proof-store.mjs';
import { observeOutboundFinalAdmission } from '../src/omnia-v9/final-admission-shadow.mjs';
import { issueShadowApproval } from '../src/omnia-v9/integrations/shadow-approval.mjs';
import { buildRealityShadowHook, classifyRealityShadowFailure } from '../src/omnia-v9/integrations/reality-shadow-evaluator.mjs';
import { bindRealCedarAuthority, RealCedarBindingError } from '../src/omnia-v9/integrations/reality-shadow-cedar.mjs';
import { resolveOutboundFinalAdmissionHook } from '../src/omnia-v9/integrations/outbound-admission.mjs';
import { resolveOmniaV9Mode } from '../src/omnia-v9/integrations/config.mjs';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const keyResolver = keyId => (keyId === 'owner-key-1' ? publicKey : null);
const signer = digest => signDigestHex(digest, privateKey);
const NOW = new Date('2026-08-08T12:00:00.000Z');

function outboundContext(suffix = 'a') {
  return {
    observedAt: NOW.toISOString(),
    boundary: 'AFTER_DURABLE_DISPATCH_RESERVATION_BEFORE_GMAIL',
    reservation: { id: `res_${suffix}`, idempotencyKey: `initial:p_${suffix}`, inbox: 'A', recipientEmail: `buyer_${suffix}@example.com`, kind: 'initial', followup: 0 },
    action: {
      operation: 'OUTBOUND_EMAIL_SEND', prospectId: `p_${suffix}`, campaignId: 'c1',
      senderEmail: 'sender@uberbond.test', recipientEmail: `buyer_${suffix}@example.com`,
      subjectSha256: sha256(`subject-${suffix}`), bodySha256: sha256(`body-${suffix}`),
      evidenceUrl: 'https://example.com/evidence-page', evidenceExcerptSha256: sha256(`excerpt-${suffix}`)
    },
    legacySignals: { legacyEligible: true, legacyReason: '' }
  };
}

async function realDb() {
  const pglite = new PGlite();
  await pglite.exec(await fs.readFile(new URL('../migrations/005_omnia_v9_proof_store.sql', import.meta.url), 'utf8'));
  await pglite.exec(await fs.readFile(new URL('../migrations/009_omnia_v9_shadow_approval_registry.sql', import.meta.url), 'utf8'));
  const store = new OmniaV9ProofStore({ pool: pglite, keyResolver });
  return { pglite, store };
}

// ---------------------------------------------------------------------------
// DB failure drills
// ---------------------------------------------------------------------------

test('DB failure drill: connection loss during authority resolution becomes SHADOW_ERROR/REVIEW, never a crash, never ALLOW', async () => {
  const cedarAuthority = await bindRealCedarAuthority();
  const brokenPool = { query: async () => { throw new Error('ECONNREFUSED: simulated connection loss'); } };
  const proofStore = { getApprovalUsage: async () => ({ uses: 0, costUsd: 0 }), isRevoked: async () => false };
  const hook = buildRealityShadowHook({ pool: brokenPool, proofStore, tenantId: 'campaign:c1', cedarAuthority, keyResolver });
  const observation = await observeOutboundFinalAdmission({ hook, store: null, context: outboundContext('conn-loss') });
  assert.equal(observation.status, 'SHADOW_ERROR');
  assert.equal(observation.decision, 'REVIEW');
});

test('DB failure drill: read timeout resolving approval usage becomes SHADOW_ERROR/REVIEW, never a crash, never ALLOW', async () => {
  const { pglite, store } = await realDb();
  try {
    const cedarAuthority = await bindRealCedarAuthority();
    await issueShadowApproval({
      proofStore: store, pool: pglite, signer, approvalId: 'ap-timeout', issuerId: 'mohamed', keyId: 'owner-key-1', tenantId: 'campaign:c1',
      actorIds: ['uberbond-outbound-worker'], operations: ['email.send'], resourcePrefixes: ['email:'],
      effectClasses: ['COMMUNICATE_EXTERNAL'], maxBlastRadius: 5, maxCostUsd: 1, maxUses: 5,
      notBefore: new Date(NOW.getTime() - 60_000).toISOString(), expiresAt: new Date(NOW.getTime() + 3600_000).toISOString(), issuedAt: new Date(NOW.getTime() - 60_000).toISOString()
    });
    const timeoutProofStore = { getApprovalUsage: async () => { throw new Error('ETIMEDOUT: simulated read timeout'); }, isRevoked: async () => false };
    const hook = buildRealityShadowHook({ pool: pglite, proofStore: timeoutProofStore, tenantId: 'campaign:c1', cedarAuthority, keyResolver });
    const observation = await observeOutboundFinalAdmission({ hook, store: null, context: outboundContext('timeout') });
    assert.equal(observation.status, 'SHADOW_ERROR');
    assert.equal(observation.decision, 'REVIEW');
  } finally { await pglite.close(); }
});

test('DB failure drill: an unresolvable/missing proof object (approval row present in registry but object row deleted) fails closed, never ALLOW', async () => {
  const { pglite, store } = await realDb();
  try {
    const cedarAuthority = await bindRealCedarAuthority();
    await issueShadowApproval({
      proofStore: store, pool: pglite, signer, approvalId: 'ap-missing-object', issuerId: 'mohamed', keyId: 'owner-key-1', tenantId: 'campaign:c1',
      actorIds: ['uberbond-outbound-worker'], operations: ['email.send'], resourcePrefixes: ['email:'],
      effectClasses: ['COMMUNICATE_EXTERNAL'], maxBlastRadius: 5, maxCostUsd: 1, maxUses: 5,
      notBefore: new Date(NOW.getTime() - 60_000).toISOString(), expiresAt: new Date(NOW.getTime() + 3600_000).toISOString(), issuedAt: new Date(NOW.getTime() - 60_000).toISOString()
    });
    // Simulate the underlying proof object becoming unavailable (deleted / corrupted) while the registry row remains.
    await pglite.query(`DELETE FROM omnia_v9_objects WHERE object_type = 'OWNER_APPROVAL' AND object_id = $1`, ['ap-missing-object']);
    const hook = buildRealityShadowHook({ pool: pglite, proofStore: store, tenantId: 'campaign:c1', cedarAuthority, keyResolver });
    const observation = await observeOutboundFinalAdmission({ hook, store: null, context: outboundContext('missing-object') });
    // The JOIN in resolveShadowAuthorityContext simply excludes the orphaned registry row -- zero approvals resolve, so admission falls back to REVIEW (no covering approval), never ALLOW, and never a crash.
    assert.equal(observation.status, 'OBSERVED');
    assert.equal(observation.decision, 'REVIEW');
  } finally { await pglite.close(); }
});

test('DB failure drill: a write failure while issuing a shadow approval never leaves a usable half-registered approval', async () => {
  const { pglite, store } = await realDb();
  try {
    const approval = await store.putObject({ objectType: 'OWNER_APPROVAL', objectId: 'ap-write-fail', tenantId: 'campaign:c1', digest: sha256('placeholder'), data: null }).catch(error => error);
    assert(approval instanceof Error, 'malformed putObject input must reject, not silently succeed');
    const row = await pglite.query('SELECT 1 FROM omnia_v9_objects WHERE object_id = $1', ['ap-write-fail']);
    assert.equal(row.rows.length, 0, 'a failed write must not leave a partial object row behind');
    const registryRow = await pglite.query('SELECT 1 FROM omnia_v9_shadow_approval_registry WHERE approval_id = $1', ['ap-write-fail']);
    assert.equal(registryRow.rows.length, 0, 'a failed write must not leave a partial registry row behind');
  } finally { await pglite.close(); }
});

test('DB failure drill: partial audit logging failure never blocks or changes the returned decision', async () => {
  const { pglite, store } = await realDb();
  try {
    const cedarAuthority = await bindRealCedarAuthority();
    await issueShadowApproval({
      proofStore: store, pool: pglite, signer, approvalId: 'ap-log-fail', issuerId: 'mohamed', keyId: 'owner-key-1', tenantId: 'campaign:c1',
      actorIds: ['uberbond-outbound-worker'], operations: ['email.send'], resourcePrefixes: ['email:'], purposes: ['qualified-b2b-outreach'],
      effectClasses: ['COMMUNICATE_EXTERNAL'], maxBlastRadius: 5, maxCostUsd: 1, maxUses: 5,
      notBefore: new Date(NOW.getTime() - 60_000).toISOString(), expiresAt: new Date(NOW.getTime() + 3600_000).toISOString(), issuedAt: new Date(NOW.getTime() - 60_000).toISOString()
    });
    const hook = buildRealityShadowHook({ pool: pglite, proofStore: store, tenantId: 'campaign:c1', cedarAuthority, keyResolver });
    const throwingStore = { log: async () => { throw new Error('simulated audit log sink failure'); } };
    const observation = await observeOutboundFinalAdmission({ hook, store: throwingStore, context: outboundContext('log-fail') });
    assert.equal(observation.status, 'OBSERVED');
    assert.equal(observation.decision, 'ALLOW');
  } finally { await pglite.close(); }
});

// ---------------------------------------------------------------------------
// Cedar failure drills
// ---------------------------------------------------------------------------

test('Cedar failure drill: classifyRealityShadowFailure maps Cedar binding failures to V9_INCOMPLETE/V9_ERROR, and unrelated errors to V9_ERROR, never ALLOW', () => {
  assert.equal(classifyRealityShadowFailure(new RealCedarBindingError('down', 'CEDAR_UNAVAILABLE', 'cedar-runtime')), 'V9_INCOMPLETE');
  assert.equal(classifyRealityShadowFailure(new RealCedarBindingError('bad policy', 'CEDAR_POLICY_INVALID', 'policy-validation')), 'V9_ERROR');
  assert.equal(classifyRealityShadowFailure(new Error('some other failure')), 'V9_ERROR');
});

test('Cedar failure drill: a policyAuthorizer that throws mid-decision (simulated evaluator exception) is caught by the frozen kernel and fails closed to DENY within a completed OBSERVED decision, never a crash and never ALLOW', async () => {
  const { pglite, store } = await realDb();
  try {
    await issueShadowApproval({
      proofStore: store, pool: pglite, signer, approvalId: 'ap-cedar-throw', issuerId: 'mohamed', keyId: 'owner-key-1', tenantId: 'campaign:c1',
      actorIds: ['uberbond-outbound-worker'], operations: ['email.send'], resourcePrefixes: ['email:'], purposes: ['qualified-b2b-outreach'],
      effectClasses: ['COMMUNICATE_EXTERNAL'], maxBlastRadius: 5, maxCostUsd: 1, maxUses: 5,
      notBefore: new Date(NOW.getTime() - 60_000).toISOString(), expiresAt: new Date(NOW.getTime() + 3600_000).toISOString(), issuedAt: new Date(NOW.getTime() - 60_000).toISOString()
    });
    const throwingCedarAuthority = { policyAuthorizer: () => { throw new Error('simulated Cedar evaluator exception'); }, policyDigest: sha256('p'), constitutionDigest: sha256('c') };
    const hook = buildRealityShadowHook({ pool: pglite, proofStore: store, tenantId: 'campaign:c1', cedarAuthority: throwingCedarAuthority, keyResolver });
    const observation = await observeOutboundFinalAdmission({ hook, store: null, context: outboundContext('cedar-throw') });
    assert.equal(observation.status, 'OBSERVED', 'the hook itself did not throw -- admitAction caught the authorizer exception internally, per frozen kernel.mjs semantics');
    assert.equal(observation.decision, 'DENY');
  } finally { await pglite.close(); }
});

test('Cedar failure drill: an unexpected/garbage Cedar decision value never becomes ALLOW', async () => {
  const { authorizeWithCedar } = await import('../src/omnia-v9/cedar-adapter.mjs');
  const fakeCedar = {
    checkParseSchema: () => ({ type: 'success' }), checkParsePolicySet: () => ({ type: 'success' }),
    validate: () => ({ type: 'success', validationErrors: [], validationWarnings: [] }),
    getCedarVersion: () => 'fake-4.12.0',
    isAuthorized: () => ({ type: 'success', response: { decision: 'garbage-not-a-real-decision', diagnostics: {} } })
  };
  const validatedPolicy = { ok: true, schema: {} };
  const resolverFacts = { authorityResolved: true, identityResolved: true, evidenceResolved: true, policyBound: true, constitutionBound: true, proposalOrigin: 'OPERATOR', sovereigntyChange: false };
  const result = authorizeWithCedar({
    cedar: fakeCedar, validatedPolicy, policyText: 'permit(principal,action,resource);',
    actor: { id: 'a', tenantId: 't' }, resource: { id: 'r', tenantId: 't', operation: 'op', effectClass: 'READ_INTERNAL' },
    resolverFacts
  });
  assert.equal(result.decision, 'DENY', 'any Cedar decision value other than the literal string "allow" must fail closed to DENY');
});

// ---------------------------------------------------------------------------
// Kill-switch drill
// ---------------------------------------------------------------------------

test('kill-switch drill: OMNIA_V9_MODE=off resolves to no hook regardless of real, usable shadow approvals existing in the database', async () => {
  const { pglite, store } = await realDb();
  try {
    await issueShadowApproval({
      proofStore: store, pool: pglite, signer, approvalId: 'ap-kill-switch', issuerId: 'mohamed', keyId: 'owner-key-1', tenantId: 'campaign:c1',
      actorIds: ['uberbond-outbound-worker'], operations: ['email.send'], resourcePrefixes: ['email:'],
      effectClasses: ['COMMUNICATE_EXTERNAL'], maxBlastRadius: 5, maxCostUsd: 1, maxUses: 5,
      notBefore: new Date(NOW.getTime() - 60_000).toISOString(), expiresAt: new Date(NOW.getTime() + 3600_000).toISOString(), issuedAt: new Date(NOW.getTime() - 60_000).toISOString()
    });
    const mode = resolveOmniaV9Mode({ OMNIA_V9_MODE: 'off' });
    assert.equal(mode, 'off');
    assert.equal(resolveOutboundFinalAdmissionHook({ mode, store: pglite }), null, 'a usable, unexpired, unrevoked shadow approval existing in the real database must not make off mode active');
  } finally { await pglite.close(); }
});

test('kill-switch drill: mode resolution is a pure function of the environment only -- no approval, DB row, or Cedar state can influence it', () => {
  const before = resolveOmniaV9Mode({ OMNIA_V9_MODE: 'off' });
  // resolveOmniaV9Mode takes a plain env object and nothing else -- there is
  // no pool/proofStore/store parameter through which database or approval
  // state could reach it, so passing extraneous DB-shaped fields alongside
  // OMNIA_V9_MODE must have zero effect on the resolved mode.
  const withExtraneousDbFields = resolveOmniaV9Mode({ OMNIA_V9_MODE: 'off', pool: { query: () => { throw new Error('must never be called'); } }, approvalCount: 999 });
  assert.equal(withExtraneousDbFields, 'off');
  const after = resolveOmniaV9Mode({ OMNIA_V9_MODE: 'off' });
  assert.equal(before, after);
  assert.equal(resolveOmniaV9Mode({ OMNIA_V9_MODE: 'enforce' }), 'off');
  assert.equal(resolveOmniaV9Mode({ OMNIA_V9_MODE: 'canary' }), 'off');
});
