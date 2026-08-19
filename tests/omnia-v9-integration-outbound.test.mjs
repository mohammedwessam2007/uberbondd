import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { evaluateOutboundAdmission, deriveOutboundActionIntent, createOutboundAdmissionHook, resolveOutboundFinalAdmissionHook } from '../src/omnia-v9/integrations/outbound-admission.mjs';
import { createApproval } from '../src/omnia-v9/kernel.mjs';
import { signDigestHex, sha256 } from '../src/omnia-v9/canonical.mjs';
import { observeOutboundFinalAdmission } from '../src/omnia-v9/final-admission-shadow.mjs';

const NOW = new Date('2026-08-08T12:00:00.000Z');
const { publicKey, privateKey } = generateKeyPairSync('ed25519');

function baseContext(overrides = {}) {
  return {
    observedAt: NOW.toISOString(),
    reservation: { id: 'res_1', idempotencyKey: 'initial:p1', inbox: 'A', recipientEmail: 'buyer@example.com', kind: 'initial', followup: 0 },
    action: {
      operation: 'OUTBOUND_EMAIL_SEND', prospectId: 'p1', campaignId: 'c1',
      senderEmail: 'sender@uberbond.test', recipientEmail: 'buyer@example.com',
      subjectSha256: sha256('subject'), bodySha256: sha256('body'),
      evidenceUrl: 'https://example.com/page', evidenceExcerptSha256: sha256('excerpt')
    },
    legacySignals: { legacyEligible: true, legacyReason: '' },
    ...overrides
  };
}

function validApproval(overrides = {}) {
  return createApproval({
    approvalId: 'ap1', issuerId: 'mohamed', keyId: 'owner-key-1', tenantId: 'campaign:c1',
    actorIds: ['uberbond-outbound-worker'], operations: ['email.send'], resourcePrefixes: ['email:'],
    purposes: ['qualified-b2b-outreach'], effectClasses: ['COMMUNICATE_EXTERNAL'],
    maxBlastRadius: 5, maxCostUsd: 1, maxUses: 10,
    notBefore: new Date(NOW.getTime() - 3600_000).toISOString(), expiresAt: new Date(NOW.getTime() + 3600_000).toISOString(),
    issuedAt: new Date(NOW.getTime() - 3600_000).toISOString(), ...overrides
  }, digest => signDigestHex(digest, privateKey));
}

test('deriveOutboundActionIntent never touches Gmail-related fields', () => {
  const { intent, evidence } = deriveOutboundActionIntent(baseContext());
  assert.equal(typeof intent.intentDigest, 'string');
  assert.equal(typeof evidence.evidenceId, 'string');
  assert(!('gmailId' in intent));
  assert(!('threadId' in intent));
});

test('unresolved authority (no approvals) resolves to REVIEW, never a fabricated ALLOW', () => {
  const result = evaluateOutboundAdmission({ context: baseContext(), now: NOW, approvals: [] });
  assert.equal(result.decision, 'REVIEW');
  assert(result.reasons.includes('approval:no-covering-resolvable-approval'));
});

test('missing external evidence fails closed to DENY', () => {
  const context = baseContext();
  context.action.evidenceUrl = '';
  const result = evaluateOutboundAdmission({ context, now: NOW, approvals: [validApproval()], keyResolver: () => publicKey, policyAuthorizer: () => ({ decision: 'ALLOW' }) });
  assert.equal(result.decision, 'DENY');
  assert(result.reasons.some(reason => reason.includes('evidence')));
});

test('missing policy digest fails closed before consequential allow', () => {
  const result = evaluateOutboundAdmission({
    context: baseContext(), now: NOW, approvals: [validApproval()], keyResolver: () => publicKey,
    policyAuthorizer: () => ({ decision: 'ALLOW' }), policyDigest: '', constitutionDigest: sha256('constitution')
  });
  assert.equal(result.decision, 'DENY');
  assert(result.reasons.includes('policy:digest-missing'));
});

test('missing constitution digest fails closed before consequential allow', () => {
  const result = evaluateOutboundAdmission({
    context: baseContext(), now: NOW, approvals: [validApproval()], keyResolver: () => publicKey,
    policyAuthorizer: () => ({ decision: 'ALLOW' }), policyDigest: sha256('policy'), constitutionDigest: ''
  });
  assert.equal(result.decision, 'DENY');
  assert(result.reasons.includes('constitution:digest-missing'));
});

test('a valid covering approval with a live ALLOW policy authorizer produces ALLOW', () => {
  const result = evaluateOutboundAdmission({
    context: baseContext(), now: NOW, approvals: [validApproval()], keyResolver: () => publicKey,
    policyAuthorizer: () => ({ decision: 'ALLOW' }), policyDigest: sha256('policy'), constitutionDigest: sha256('constitution')
  });
  assert.equal(result.decision, 'ALLOW');
});

test('simulated Cedar unavailability (policyAuthorizer throws) fails closed to DENY, never crashes', () => {
  const result = evaluateOutboundAdmission({
    context: baseContext(), now: NOW, approvals: [validApproval()], keyResolver: () => publicKey,
    policyAuthorizer: () => { throw new Error('cedar down'); }, policyDigest: sha256('policy'), constitutionDigest: sha256('constitution')
  });
  assert.equal(result.decision, 'DENY');
  assert(result.reasons.some(reason => reason.startsWith('policy:error:')));
});

test('simulated database unavailability (usageResolver throws) propagates as an exception, which final-admission-shadow.mjs catches as SHADOW_ERROR, never crashing the send path', async () => {
  const hook = createOutboundAdmissionHook({
    mode: 'shadow', now: NOW, approvals: [validApproval()], keyResolver: () => publicKey,
    policyAuthorizer: () => ({ decision: 'ALLOW' }), policyDigest: sha256('policy'), constitutionDigest: sha256('constitution'),
    usageResolver: () => { throw new Error('database unreachable'); }
  });
  const observation = await observeOutboundFinalAdmission({ hook, store: null, context: baseContext() });
  assert.equal(observation.status, 'SHADOW_ERROR');
  assert.equal(observation.decision, 'REVIEW');
});

test('resolveOutboundFinalAdmissionHook returns null for off mode (and any unrecognized mode)', () => {
  assert.equal(resolveOutboundFinalAdmissionHook({ mode: 'off', store: null }), null);
  assert.equal(resolveOutboundFinalAdmissionHook({ mode: 'enforce', store: null }), null);
  assert.equal(resolveOutboundFinalAdmissionHook({ mode: undefined, store: null }), null);
});

test('resolveOutboundFinalAdmissionHook returns a real function for shadow and compare', () => {
  assert.equal(typeof resolveOutboundFinalAdmissionHook({ mode: 'shadow', store: null }), 'function');
  assert.equal(typeof resolveOutboundFinalAdmissionHook({ mode: 'compare', store: null }), 'function');
});

test('compare mode logs a comparison record without changing the returned decision', async () => {
  const logged = [];
  const fakeStore = { log: async (type, detail) => { logged.push({ type, detail }); } };
  const hook = createOutboundAdmissionHook({
    mode: 'compare', store: fakeStore, now: NOW, approvals: [], policyAuthorizer: () => ({ decision: 'REVIEW' })
  });
  const result = await hook(baseContext({ legacySignals: { legacyEligible: false, legacyReason: 'outbound-disabled' } }));
  assert.equal(result.decision, 'REVIEW');
  const compareLog = logged.find(entry => entry.type === 'omnia_v9_outbound_compare');
  assert(compareLog, 'expected a compare-mode audit log entry');
  assert.equal(compareLog.detail.category, 'V9_INCOMPLETE');
  assert.equal(compareLog.detail.legacyEligible, false);
});

test('compare-mode logging failure never changes or blocks the returned decision', async () => {
  const throwingStore = { log: async () => { throw new Error('log sink down'); } };
  const hook = createOutboundAdmissionHook({
    mode: 'compare', store: throwingStore, now: NOW, approvals: [validApproval()], keyResolver: () => publicKey,
    policyAuthorizer: () => ({ decision: 'ALLOW' }), policyDigest: sha256('policy'), constitutionDigest: sha256('constitution')
  });
  const result = await hook(baseContext());
  assert.equal(result.decision, 'ALLOW');
});
