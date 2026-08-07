import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { canonicalize, signDigestHex, sha256 } from '../src/omnia-v9/canonical.mjs';
import {
  createActionIntent, createApproval, createEvidenceRecord, admitAction, verifyEvidence, verifyApproval,
  createExecutionReceipt, verifyExecutionReceipt
} from '../src/omnia-v9/kernel.mjs';
import { buildOutboundShadowArtifacts, evaluateOutboundShadow } from '../src/omnia-v9/outbound-shadow.mjs';

const now = new Date('2026-08-08T00:00:00Z');
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const keyResolver = keyId => keyId === 'owner-key-1' ? publicKey : null;
const policyAuthorizer = () => ({ decision: 'ALLOW' });
const externalRequirements = () => ({ minCount: 1, allowedOrigins: ['EXTERNAL_SOURCE','PROVIDER_CALLBACK','CUSTOMER_ATTESTATION','PROFESSIONAL_ATTESTATION','PRODUCTION_TELEMETRY'] });

function evidence(overrides = {}) {
  return createEvidenceRecord({ evidenceId: 'ev1', tenantId: 'tenant1', subject: 'example.com', origin: 'EXTERNAL_SOURCE', relation: 'DIRECT',
    verificationClaims: [], lifecycleFlags: ['ACTIVE'], sourceRef: 'https://example.com', payload: { ok: true },
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
  return { now, evidenceResolver: id => id === ev.evidenceId ? ev : null, evidenceRequirementResolver: externalRequirements,
    approvals: [ap], keyResolver, usageResolver: () => ({ uses: 0, costUsd: 0 }), policyAuthorizer,
    policyVersion: 'p1', policyDigest: sha256('policy'), constitutionDigest: sha256('constitution'), killState: { active: false }, ...overrides };
}

test('valid proof-bound consequential action is allowed', () => assert.equal(admitAction(intent(), context()).decision, 'ALLOW'));

test('unknown intent fields fail closed', () => {
  const i = { ...intent(), ownerIsOptional: true };
  assert.equal(admitAction(i, context()).decision, 'DENY');
});

test('unknown effect class fails closed without a caller truth flag', () => {
  const i = { ...intent(), effectClass: 'DO_WHATEVER' };
  i.intentDigest = sha256(Object.fromEntries(Object.entries(i).filter(([key]) => key !== 'intentDigest')));
  assert.equal(admitAction(i, context()).decision, 'DENY');
});

test('mutating intent after hashing is detected', () => {
  const i = intent(); i.resource = 'email:evil@example.com';
  assert.equal(admitAction(i, context()).decision, 'DENY');
});

test('malformed arguments digest fails closed', () => {
  const i = intent(); i.argumentsDigest = 'not-a-digest';
  i.intentDigest = sha256(Object.fromEntries(Object.entries(i).filter(([key]) => key !== 'intentDigest')));
  assert.equal(admitAction(i, context()).decision, 'DENY');
});

test('expired approval cannot authorize', () => {
  const ap = approval({ expiresAt: '2026-08-07T23:59:59Z' });
  const result = admitAction(intent(), context(evidence(), ap));
  assert.equal(result.decision, 'REVIEW');
  assert(result.reasons.some(r => r.includes('expired')));
});

test('revoked approval cannot authorize', () => {
  const result = admitAction(intent(), context(evidence(), approval(), { revokedApprovalIds: new Set(['ap1']) }));
  assert.equal(result.decision, 'REVIEW');
});

test('tampered approval signature is rejected', () => {
  const ap = { ...approval(), maxUses: 999 };
  assert.equal(verifyApproval(ap, { now, keyResolver }).ok, false);
});

test('future approval issuance fails closed', () => {
  const ap = approval({ issuedAt: '2026-08-08T00:10:01Z', notBefore: '2026-08-08T00:10:01Z' });
  assert.equal(admitAction(intent(), context(evidence(), ap)).decision, 'REVIEW');
});

test('approval issued after notBefore is invalid', () => {
  const ap = approval({ issuedAt: '2026-08-07T01:00:00Z', notBefore: '2026-08-07T00:00:00Z' });
  assert.equal(verifyApproval(ap, { now, keyResolver }).ok, false);
});

test('synthetic evidence cannot satisfy external-evidence requirement', () => {
  const ev = evidence({ origin: 'SYNTHETIC_FIXTURE', sourceRef: 'synthetic:test' });
  assert.equal(admitAction(intent(), context(ev)).decision, 'DENY');
});

test('review cannot mutate evidence origin without invalidating digest', () => {
  const ev = evidence(); ev.origin = 'PROVIDER_CALLBACK';
  assert.equal(verifyEvidence(ev, { now }).ok, false);
});

test('external-source evidence requires an http(s) source reference', () => {
  const ev = evidence({ sourceRef: 'missing://evidence' });
  assert.equal(admitAction(intent(), context(ev)).decision, 'DENY');
});

test('unknown verification claims fail closed', () => {
  const ev = evidence({ verificationClaims: ['AI_SAID_TRUE'] });
  assert.equal(admitAction(intent(), context(ev)).decision, 'DENY');
});

test('unknown lifecycle flags fail closed', () => {
  const ev = evidence({ lifecycleFlags: ['IMMORTAL'] });
  assert.equal(admitAction(intent(), context(ev)).decision, 'DENY');
});

test('future-dated evidence fails closed', () => {
  const ev = evidence({ observedAt: '2026-08-08T00:06:00Z' });
  assert.equal(admitAction(intent(), context(ev)).decision, 'DENY');
});

test('cross-tenant evidence is denied', () => {
  const ev = evidence({ tenantId: 'tenant2' });
  assert.equal(admitAction(intent(), context(ev)).decision, 'DENY');
});

test('kill state dominates otherwise valid allow', () => assert.equal(admitAction(intent(), context(evidence(), approval(), { killState: { active: true } })).decision, 'DENY'));

test('missing evidence-requirement resolver fails closed for consequential actions', () => {
  const c = context(); delete c.evidenceRequirementResolver;
  assert.equal(admitAction(intent(), c).decision, 'DENY');
});

test('missing policy authorizer fails closed', () => {
  const c = context(); delete c.policyAuthorizer;
  assert.equal(admitAction(intent(), c).decision, 'DENY');
});

test('policy errors fail closed', () => assert.equal(admitAction(intent(), context(evidence(), approval(), { policyAuthorizer: () => { throw new Error('boom'); } })).decision, 'DENY'));

test('missing policy digest fails closed before consequential allow', () => assert.equal(admitAction(intent(), context(evidence(), approval(), { policyDigest: '' })).decision, 'DENY'));

test('missing constitution digest fails closed before consequential allow', () => assert.equal(admitAction(intent(), context(evidence(), approval(), { constitutionDigest: '' })).decision, 'DENY'));

test('approval cannot expand to wrong purpose', () => assert.equal(admitAction(intent({ purpose: 'mass-marketing' }), context()).decision, 'REVIEW'));

test('approval cannot expand to wrong resource', () => assert.equal(admitAction(intent(), context(evidence(), approval({ resourcePrefixes: ['payment:'] }))).decision, 'REVIEW'));

test('approval use budget is enforced', () => assert.equal(admitAction(intent(), context(evidence(), approval({ maxUses: 1 }), { usageResolver: () => ({ uses: 1, costUsd: 0 }) })).decision, 'REVIEW'));

test('approval cost budget is enforced', () => assert.equal(admitAction(intent({ maxCostUsd: 0.2 }), context(evidence(), approval({ maxCostUsd: 0.3 }), { usageResolver: () => ({ uses: 0, costUsd: 0.2 }) })).decision, 'REVIEW'));

test('malformed usage cannot authorize', () => assert.equal(admitAction(intent(), context(evidence(), approval(), { usageResolver: () => ({ uses: Number.NaN, costUsd: 0 }) })).decision, 'REVIEW'));

test('NaN intent cost is rejected before policy', () => {
  const i = intent(); i.maxCostUsd = Number.NaN; i.intentDigest = sha256({});
  assert.equal(admitAction(i, context()).decision, 'DENY');
});

test('execution receipt is bound to exact intent and authorization digests', () => {
  const i = intent(); const auth = admitAction(i, context());
  const receipt = createExecutionReceipt({ intentDigest: i.intentDigest, authorizationDigest: auth.decisionDigest, executorId: 'gmail', executorVersion: '1',
    startedAt: now.toISOString(), finishedAt: new Date(now.getTime()+1000).toISOString(), outcome: 'SUCCEEDED', providerRefs: ['gmail:123'], evidenceIds: ['ev1'],
    actualCostUsd: 0.01, idempotencyKey: i.idempotencyKey });
  assert.equal(verifyExecutionReceipt(receipt).ok, true);
});

test('tampering with an execution receipt is detected', () => {
  const i = intent(); const auth = admitAction(i, context());
  const receipt = createExecutionReceipt({ intentDigest: i.intentDigest, authorizationDigest: auth.decisionDigest, executorId: 'gmail', executorVersion: '1',
    startedAt: now.toISOString(), finishedAt: new Date(now.getTime()+1000).toISOString(), outcome: 'SUCCEEDED', providerRefs: [], evidenceIds: [], actualCostUsd: 0, idempotencyKey: i.idempotencyKey });
  receipt.outcome = 'FAILED';
  assert.equal(verifyExecutionReceipt(receipt).ok, false);
});

test('invalid execution receipt cost is rejected', () => {
  assert.throws(() => createExecutionReceipt({ intentDigest: sha256('i'), authorizationDigest: sha256('a'), executorId: 'x', executorVersion: '1',
    startedAt: now.toISOString(), finishedAt: now.toISOString(), outcome: 'SUCCEEDED', actualCostUsd: Number.NaN, idempotencyKey: 'k' }));
});

test('outbound shadow refuses legacy campaign boolean as authority', () => {
  const prospect = { id: 'p1', website: 'https://example.com', contact: { email: 'sales@example.com' }, subject: 'Subject', draft: 'Body', issue: { title: 'Issue', evidenceUrl: 'https://example.com', evidenceExcerpt: 'Observed issue' } };
  const result = evaluateOutboundShadow({ prospect, campaign: { id: 'c1', approved: true, autoSend: true }, approvals: [], keyResolver, policyAuthorizer, now });
  assert.equal(result.authorization.decision, 'REVIEW');
});

test('outbound shadow never fabricates external evidence when evidence URL is missing', () => {
  const prospect = { id: 'p1', website: 'https://example.com', contact: { email: 'sales@example.com' }, subject: 'Subject', draft: 'Body', issue: { title: 'Issue', evidenceExcerpt: 'Observed issue' } };
  const { evidence: ev } = buildOutboundShadowArtifacts({ prospect, campaign: { id: 'c1' }, now });
  assert.equal(ev.origin, 'INTERNAL_OBSERVATION');
  const result = evaluateOutboundShadow({ prospect, campaign: { id: 'c1', approved: true }, approvals: [], keyResolver, policyAuthorizer, now });
  assert.equal(result.authorization.decision, 'DENY');
});

test('outbound shadow cannot allow even with a valid approval until canonical constitution exists', () => {
  const prospect = { id: 'p1', website: 'https://example.com', contact: { email: 'sales@example.com' }, subject: 'Subject', draft: 'Body', issue: { title: 'Issue', evidenceUrl: 'https://example.com', evidenceExcerpt: 'Observed issue' } };
  const ap = createApproval({ approvalId: 'out1', issuerId: 'mohamed', keyId: 'owner-key-1', tenantId: 'campaign:c1', actorIds: ['uberbond-worker'], operations: ['email.send'],
    resourcePrefixes: ['email:'], purposes: ['qualified-b2b-outreach'], effectClasses: ['COMMUNICATE_EXTERNAL'], maxBlastRadius: 20, maxCostUsd: 5, maxUses: 20,
    notBefore: '2026-08-07T00:00:00Z', expiresAt: '2026-08-09T00:00:00Z', issuedAt: '2026-08-07T00:00:00Z' }, digest => signDigestHex(digest, privateKey));
  const result = evaluateOutboundShadow({ prospect, campaign: { id: 'c1' }, approvals: [ap], keyResolver, policyAuthorizer, now });
  assert.equal(result.authorization.decision, 'DENY');
  assert(result.authorization.reasons.includes('constitution:digest-missing'));
});

test('malformed intent timestamps fail closed', () => assert.equal(admitAction(intent({ expiresAt: 'not-a-date' }), context()).decision, 'DENY'));

test('unknown approval fields prevent authorization', () => assert.equal(admitAction(intent(), context(evidence(), { ...approval(), surprisePower: 'ALLOW_ALL' })).decision, 'REVIEW'));

test('unknown evidence fields fail closed', () => assert.equal(admitAction(intent(), context({ ...evidence(), magicExternalTruth: true })).decision, 'DENY'));

test('future notBefore approval cannot authorize', () => assert.equal(admitAction(intent(), context(evidence(), approval({ notBefore: '2026-08-09T00:00:00Z' }))).decision, 'REVIEW'));

test('missing evidence object is denied', () => {
  const c = context(); c.evidenceResolver = () => null;
  assert.equal(admitAction(intent(), c).decision, 'DENY');
});

test('malformed approval timestamps cannot authorize', () => assert.equal(admitAction(intent(), context(evidence(), approval({ expiresAt: 'wat' }))).decision, 'REVIEW'));

test('malformed evidence observedAt is denied', () => assert.equal(admitAction(intent(), context(evidence({ observedAt: 'not-time' }))).decision, 'DENY'));

test('canonicalizer rejects cyclic structures', () => {
  const value = {}; value.self = value;
  assert.throws(() => canonicalize(value));
});

test('canonicalizer rejects non-plain objects', () => assert.throws(() => canonicalize(new Date())));
