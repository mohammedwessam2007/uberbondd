import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { signDigestHex, sha256 } from '../src/omnia-v9/canonical.mjs';
import { createActionIntent, createApproval, createEvidenceRecord, admitAction, verifyEvidence, verifyApproval, createExecutionReceipt } from '../src/omnia-v9/kernel.mjs';
import { evaluateOutboundShadow } from '../src/omnia-v9/outbound-shadow.mjs';

const now = new Date('2026-08-08T00:00:00Z');
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const keyResolver = keyId => keyId === 'owner-key-1' ? publicKey : null;
const policyAuthorizer = () => ({ decision: 'ALLOW' });

function evidence(overrides = {}) {
  return createEvidenceRecord({ evidenceId: 'ev1', tenantId: 'tenant1', subject: 'example.com', origin: 'EXTERNAL_SOURCE', relation: 'DIRECT',
    verificationClaims: ['DIGEST_VERIFIED'], lifecycleFlags: ['ACTIVE'], sourceRef: 'https://example.com', payload: { ok: true },
    observedAt: now.toISOString(), ...overrides });
}
function intent(overrides = {}) {
  return createActionIntent({ missionId: 'm1', tenantId: 'tenant1', actorId: 'worker1', operation: 'email.send', resource: 'email:a@example.com',
    purpose: 'qualified-b2b-outreach', effectClass: 'COMMUNICATE_EXTERNAL', arguments: { to: 'a@example.com' }, evidenceIds: ['ev1'], maxCostUsd: 0.2,
    blastRadius: 1, rollback: 'SUPPRESS_FUTURE_CONTACT', expiresAt: '2026-08-08T00:10:00Z', nonce: 'n1', idempotencyKey: 'k1', ...overrides }, now);
}
function approval(overrides = {}) {
  return createApproval({ approvalId: 'ap1', issuerId: 'mohamed', keyId: 'owner-key-1', tenantId: 'tenant1', actorIds: ['worker1'], operations: ['email.send'],
    resourcePrefixes: ['email:'], purposes: ['qualified-b2b-outreach'], effectClasses: ['COMMUNICATE_EXTERNAL'], maxBlastRadius: 20, maxCostUsd: 5,
    maxUses: 20, notBefore: '2026-08-07T00:00:00Z', expiresAt: '2026-08-09T00:00:00Z', issuedAt: '2026-08-07T00:00:00Z', ...overrides },
    digest => signDigestHex(digest, privateKey));
}
function context(ev = evidence(), ap = approval(), overrides = {}) {
  return { now, effectKnown: true, requireExternalEvidence: true, evidenceResolver: id => id === ev.evidenceId ? ev : null,
    approvals: [ap], keyResolver, usageResolver: () => ({ uses: 0, costUsd: 0 }), policyAuthorizer, policyVersion: 'p1', constitutionDigest: sha256('constitution'),
    killState: { active: false }, ...overrides };
}

test('valid proof-bound consequential action is allowed', () => {
  const result = admitAction(intent(), context());
  assert.equal(result.decision, 'ALLOW');
});

test('unknown intent fields fail closed', () => {
  const i = { ...intent(), ownerIsOptional: true };
  assert.equal(admitAction(i, context()).decision, 'DENY');
});

test('mutating intent after hashing is detected', () => {
  const i = intent(); i.resource = 'email:evil@example.com';
  assert.equal(admitAction(i, context()).decision, 'DENY');
});

test('expired approval cannot authorize', () => {
  const ap = approval({ expiresAt: '2026-08-07T23:59:59Z' });
  const result = admitAction(intent(), context(evidence(), ap));
  assert.equal(result.decision, 'REVIEW');
  assert(result.reasons.some(r => r.includes('expired')));
});

test('revoked approval cannot authorize', () => {
  const ap = approval();
  const result = admitAction(intent(), context(evidence(), ap, { revokedApprovalIds: new Set(['ap1']) }));
  assert.equal(result.decision, 'REVIEW');
});

test('tampered approval signature is rejected', () => {
  const ap = { ...approval(), maxUses: 999 };
  assert.equal(verifyApproval(ap, { now, keyResolver }).ok, false);
});

test('synthetic evidence cannot satisfy external-evidence requirement', () => {
  const ev = evidence({ origin: 'SYNTHETIC_FIXTURE' });
  assert.equal(verifyEvidence(ev, { now, requireExternal: true }).ok, false);
  assert.equal(admitAction(intent(), context(ev)).decision, 'DENY');
});

test('review cannot mutate evidence origin without invalidating digest', () => {
  const ev = evidence(); ev.origin = 'PROVIDER_CALLBACK';
  assert.equal(verifyEvidence(ev, { now }).ok, false);
});

test('cross-tenant evidence is denied', () => {
  const ev = evidence({ tenantId: 'tenant2' });
  assert.equal(admitAction(intent(), context(ev)).decision, 'DENY');
});

test('kill state dominates otherwise valid allow', () => {
  const result = admitAction(intent(), context(evidence(), approval(), { killState: { active: true } }));
  assert.equal(result.decision, 'DENY');
});

test('missing policy authorizer fails closed', () => {
  const c = context(); delete c.policyAuthorizer;
  assert.equal(admitAction(intent(), c).decision, 'DENY');
});

test('policy errors fail closed', () => {
  const result = admitAction(intent(), context(evidence(), approval(), { policyAuthorizer: () => { throw new Error('boom'); } }));
  assert.equal(result.decision, 'DENY');
});

test('approval cannot expand to wrong purpose', () => {
  assert.equal(admitAction(intent({ purpose: 'mass-marketing' }), context()).decision, 'REVIEW');
});

test('approval cannot expand to wrong resource', () => {
  const ap = approval({ resourcePrefixes: ['payment:'] });
  assert.equal(admitAction(intent(), context(evidence(), ap)).decision, 'REVIEW');
});

test('approval use budget is enforced', () => {
  const result = admitAction(intent(), context(evidence(), approval({ maxUses: 1 }), { usageResolver: () => ({ uses: 1, costUsd: 0 }) }));
  assert.equal(result.decision, 'REVIEW');
});

test('approval cost budget is enforced', () => {
  const ap = approval({ maxCostUsd: 0.3 });
  const result = admitAction(intent({ maxCostUsd: 0.2 }), context(evidence(), ap, { usageResolver: () => ({ uses: 0, costUsd: 0.2 }) }));
  assert.equal(result.decision, 'REVIEW');
});

test('NaN cost is rejected before policy', () => {
  const i = intent(); i.maxCostUsd = Number.NaN; i.intentDigest = sha256({});
  assert.equal(admitAction(i, context()).decision, 'DENY');
});

test('unknown consequential effect cannot be allowed', () => {
  assert.equal(admitAction(intent(), context(evidence(), approval(), { effectKnown: false })).decision, 'DENY');
});

test('execution receipt is bound to exact intent and authorization digests', () => {
  const i = intent(); const auth = admitAction(i, context());
  const receipt = createExecutionReceipt({ intentDigest: i.intentDigest, authorizationDigest: auth.decisionDigest, executorId: 'gmail', executorVersion: '1',
    startedAt: now.toISOString(), finishedAt: new Date(now.getTime()+1000).toISOString(), outcome: 'SUCCEEDED', providerRefs: ['gmail:123'], evidenceIds: ['ev1'],
    actualCostUsd: 0.01, idempotencyKey: i.idempotencyKey });
  assert.equal(receipt.intentDigest, i.intentDigest); assert.equal(receipt.authorizationDigest, auth.decisionDigest); assert.match(receipt.receiptDigest, /^[a-f0-9]{64}$/);
});

test('outbound shadow refuses legacy campaign boolean as authority', () => {
  const prospect = { id: 'p1', website: 'https://example.com', contact: { email: 'sales@example.com' }, subject: 'Subject', draft: 'Body', issue: { title: 'Issue', evidenceUrl: 'https://example.com', evidenceExcerpt: 'Observed issue' } };
  const campaign = { id: 'c1', approved: true, autoSend: true };
  const result = evaluateOutboundShadow({ prospect, campaign, approvals: [], keyResolver, policyAuthorizer, now });
  assert.equal(result.authorization.decision, 'REVIEW');
  assert(result.authorization.reasons.includes('approval:no-covering-resolvable-approval'));
});

test('malformed intent timestamps fail closed', () => {
  const i = intent({ expiresAt: 'not-a-date' });
  const result = admitAction(i, context());
  assert.equal(result.decision, 'DENY');
});

test('unknown approval fields prevent authorization', () => {
  const ap = { ...approval(), surprisePower: 'ALLOW_ALL' };
  assert.equal(admitAction(intent(), context(evidence(), ap)).decision, 'REVIEW');
});

test('unknown evidence fields fail closed', () => {
  const ev = { ...evidence(), magicExternalTruth: true };
  assert.equal(admitAction(intent(), context(ev)).decision, 'DENY');
});

test('future notBefore approval cannot authorize', () => {
  const ap = approval({ notBefore: '2026-08-09T00:00:00Z' });
  assert.equal(admitAction(intent(), context(evidence(), ap)).decision, 'REVIEW');
});

test('missing external evidence object is denied', () => {
  const c = context(); c.evidenceResolver = () => null;
  assert.equal(admitAction(intent(), c).decision, 'DENY');
});

test('malformed approval timestamps cannot authorize', () => {
  const ap = approval({ expiresAt: 'wat' });
  assert.equal(admitAction(intent(), context(evidence(), ap)).decision, 'REVIEW');
});

test('malformed evidence observedAt is denied', () => {
  const ev = evidence({ observedAt: 'not-time' });
  assert.equal(admitAction(intent(), context(ev)).decision, 'DENY');
});
