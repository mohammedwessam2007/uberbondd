import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { generateKeyPairSync } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { signDigestHex, sha256 } from '../src/omnia-v9/canonical.mjs';
import { OmniaV9ProofStore } from '../src/omnia-v9/proof-store.mjs';
import { observeOutboundFinalAdmission } from '../src/omnia-v9/final-admission-shadow.mjs';
import { issueShadowApproval, revokeShadowApproval } from '../src/omnia-v9/integrations/shadow-approval.mjs';
import { buildRealityShadowHook } from '../src/omnia-v9/integrations/reality-shadow-evaluator.mjs';
import { bindRealCedarAuthority } from '../src/omnia-v9/integrations/reality-shadow-cedar.mjs';
import { classifyComparison } from '../src/omnia-v9/integrations/compare.mjs';
import { buildOwnerExceptionPacketFromCandidate, applyOwnerResponse, expireIfPastDeadline } from '../src/omnia-v9/integrations/owner-review.mjs';

/**
 * End-to-end reality-shadow integration: real Cedar + real Postgres-backed
 * shadow approval + the crash-safety observation wrapper + comparison
 * classification + owner exception packet generation, chained exactly as a
 * real deployment would chain them (minus any production consequence --
 * nothing here ever calls Gmail or a real send path).
 */

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const keyResolver = keyId => (keyId === 'owner-key-1' ? publicKey : null);
const signer = digest => signDigestHex(digest, privateKey);
const NOW = new Date('2026-08-08T12:00:00.000Z');

function outboundContext(suffix, overrides = {}) {
  return {
    observedAt: NOW.toISOString(),
    boundary: 'AFTER_DURABLE_DISPATCH_RESERVATION_BEFORE_GMAIL',
    reservation: { id: `res_${suffix}`, idempotencyKey: `initial:p_${suffix}`, inbox: 'A', recipientEmail: `buyer_${suffix}@example.com`, kind: 'initial', followup: 0 },
    action: {
      operation: 'OUTBOUND_EMAIL_SEND', prospectId: `p_${suffix}`, campaignId: 'e2e',
      senderEmail: 'sender@uberbond.test', recipientEmail: `buyer_${suffix}@example.com`,
      subjectSha256: sha256(`subject-${suffix}`), bodySha256: sha256(`body-${suffix}`),
      evidenceUrl: 'https://example.com/evidence-page', evidenceExcerptSha256: sha256(`excerpt-${suffix}`)
    },
    legacySignals: { legacyEligible: true, legacyReason: '' },
    ...overrides
  };
}

async function realDb() {
  const pglite = new PGlite();
  await pglite.exec(await fs.readFile(new URL('../migrations/005_omnia_v9_proof_store.sql', import.meta.url), 'utf8'));
  await pglite.exec(await fs.readFile(new URL('../migrations/009_omnia_v9_shadow_approval_registry.sql', import.meta.url), 'utf8'));
  const store = new OmniaV9ProofStore({ pool: pglite, keyResolver });
  return { pglite, store };
}

test('end-to-end: real Cedar + real Postgres shadow approval covers a candidate and observeOutboundFinalAdmission reports OBSERVED/ALLOW with real digests', async () => {
  const { pglite, store } = await realDb();
  try {
    const cedarAuthority = await bindRealCedarAuthority();
    await issueShadowApproval({
      proofStore: store, pool: pglite, signer, approvalId: 'e2e-ap-1', issuerId: 'mohamed', keyId: 'owner-key-1', tenantId: 'campaign:e2e',
      actorIds: ['uberbond-outbound-worker'], operations: ['email.send'], resourcePrefixes: ['email:'], purposes: ['qualified-b2b-outreach'],
      effectClasses: ['COMMUNICATE_EXTERNAL'], maxBlastRadius: 5, maxCostUsd: 1, maxUses: 5,
      notBefore: new Date(NOW.getTime() - 3600_000).toISOString(), expiresAt: new Date(NOW.getTime() + 3600_000).toISOString(), issuedAt: new Date(NOW.getTime() - 3600_000).toISOString()
    });
    const hook = buildRealityShadowHook({ pool: pglite, proofStore: store, tenantId: 'campaign:e2e', cedarAuthority, keyResolver });
    const context = outboundContext('e2e-1');
    const observation = await observeOutboundFinalAdmission({ hook, store: null, context });

    assert.equal(observation.status, 'OBSERVED');
    assert.equal(observation.decision, 'ALLOW');
    assert.equal(observation.policyDigest, cedarAuthority.policyDigest);
    assert.equal(observation.constitutionDigest, cedarAuthority.constitutionDigest);

    const category = classifyComparison({ legacyEligible: context.legacySignals.legacyEligible, v9Status: observation.status, v9Decision: observation.decision });
    assert.equal(category, 'BOTH_ALLOW');
    assert.equal(buildOwnerExceptionPacketFromCandidate({ context, evaluation: observation, category }), null, 'agreement categories never generate an owner exception packet');
  } finally { await pglite.close(); }
});

test('end-to-end: no covering approval produces an OBSERVED/REVIEW decision that generates a compact, non-leaky owner exception packet, and a synthetic APPROVE resolves it deterministically', async () => {
  const { pglite, store } = await realDb();
  try {
    const cedarAuthority = await bindRealCedarAuthority();
    // No approval issued for this tenant at all.
    const hook = buildRealityShadowHook({ pool: pglite, proofStore: store, tenantId: 'campaign:e2e-no-approval', cedarAuthority, keyResolver });
    const context = outboundContext('e2e-2', { action: { ...outboundContext('e2e-2').action, campaignId: 'e2e-no-approval' } });
    const observation = await observeOutboundFinalAdmission({ hook, store: null, context });

    assert.equal(observation.status, 'OBSERVED');
    assert.equal(observation.decision, 'REVIEW');

    const category = classifyComparison({ legacyEligible: context.legacySignals.legacyEligible, v9Status: observation.status, v9Decision: observation.decision });
    assert.equal(category, 'V9_INCOMPLETE');

    const packet = buildOwnerExceptionPacketFromCandidate({ context, evaluation: observation, category, now: NOW });
    assert(packet, 'an exception category must produce a packet');
    assert.equal(packet.recommendedDefault, 'DENY');
    assert(!('policyDigest' in packet), 'owner exception packet must not leak internal architecture noise');

    const approved = applyOwnerResponse({ packet, response: 'APPROVE', respondedAt: new Date(NOW.getTime() + 60_000).toISOString() });
    assert.equal(approved.status, 'APPROVED');
    assert.equal(approved.effectiveDecision, 'ALLOW');
  } finally { await pglite.close(); }
});

test('end-to-end: an unresolved exception packet that nobody responds to expires to the safe default, independent of the underlying V9 evaluation', async () => {
  const { pglite, store } = await realDb();
  try {
    const cedarAuthority = await bindRealCedarAuthority();
    const hook = buildRealityShadowHook({ pool: pglite, proofStore: store, tenantId: 'campaign:e2e-expiry', cedarAuthority, keyResolver });
    const context = outboundContext('e2e-3', { action: { ...outboundContext('e2e-3').action, campaignId: 'e2e-expiry' } });
    const observation = await observeOutboundFinalAdmission({ hook, store: null, context });
    const category = classifyComparison({ legacyEligible: true, v9Status: observation.status, v9Decision: observation.decision });
    const packet = buildOwnerExceptionPacketFromCandidate({ context, evaluation: observation, category, now: NOW, reviewWindowMs: 3600_000 });

    const stillPending = expireIfPastDeadline({ packet, now: new Date(NOW.getTime() + 1800_000).toISOString() });
    assert.equal(stillPending.status, 'PENDING');

    const expired = expireIfPastDeadline({ packet, now: new Date(NOW.getTime() + 7200_000).toISOString() });
    assert.equal(expired.status, 'EXPIRED');
    assert.equal(expired.effectiveDecision, 'DENY');
  } finally { await pglite.close(); }
});

test('end-to-end: revoking the covering approval mid-flight flips the next real evaluation from ALLOW to REVIEW, and the packet workflow reflects the new gap', async () => {
  const { pglite, store } = await realDb();
  try {
    const cedarAuthority = await bindRealCedarAuthority();
    await issueShadowApproval({
      proofStore: store, pool: pglite, signer, approvalId: 'e2e-ap-revoke', issuerId: 'mohamed', keyId: 'owner-key-1', tenantId: 'campaign:e2e-revoke',
      actorIds: ['uberbond-outbound-worker'], operations: ['email.send'], resourcePrefixes: ['email:'], purposes: ['qualified-b2b-outreach'],
      effectClasses: ['COMMUNICATE_EXTERNAL'], maxBlastRadius: 5, maxCostUsd: 1, maxUses: 5,
      notBefore: new Date(NOW.getTime() - 3600_000).toISOString(), expiresAt: new Date(NOW.getTime() + 3600_000).toISOString(), issuedAt: new Date(NOW.getTime() - 3600_000).toISOString()
    });
    const hook = buildRealityShadowHook({ pool: pglite, proofStore: store, tenantId: 'campaign:e2e-revoke', cedarAuthority, keyResolver });

    const before = await observeOutboundFinalAdmission({ hook, store: null, context: outboundContext('e2e-4a', { action: { ...outboundContext('e2e-4a').action, campaignId: 'e2e-revoke' } }) });
    assert.equal(before.decision, 'ALLOW');

    await revokeShadowApproval({ proofStore: store, pool: pglite, approvalId: 'e2e-ap-revoke', tenantId: 'campaign:e2e-revoke', revocationId: 'e2e-revocation', reason: 'integration-test-revocation', now: NOW });

    const after = await observeOutboundFinalAdmission({ hook, store: null, context: outboundContext('e2e-4b', { action: { ...outboundContext('e2e-4b').action, campaignId: 'e2e-revoke' } }) });
    assert.equal(after.decision, 'REVIEW');
    const category = classifyComparison({ legacyEligible: true, v9Status: after.status, v9Decision: after.decision });
    assert.equal(category, 'V9_INCOMPLETE');
    const packet = buildOwnerExceptionPacketFromCandidate({ context: outboundContext('e2e-4b', { action: { ...outboundContext('e2e-4b').action, campaignId: 'e2e-revoke' } }), evaluation: after, category, now: NOW });
    assert.match(packet.authorityGap, /no resolvable owner approval/);
  } finally { await pglite.close(); }
});
