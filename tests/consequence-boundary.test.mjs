import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  evaluateConsequenceBoundary, shouldConsultV9, defaultFailClosedPolicyAuthorizer,
  buildOutboundActionIntent, evaluateV9Admission, CONSEQUENCE_BOUNDARY_POLICY_VERSION
} from '../src/consequence-boundary.mjs';
import { createApproval, verifyIntent } from '../src/omnia-v9/kernel.mjs';
import { signDigestHex } from '../src/omnia-v9/canonical.mjs';

const monday = new Date('2026-07-13T10:00:00.000Z');
const cfg = { sender: { company: 'UberBond' } };
const prospect = { id: 'p1' };
const campaign = { id: 'camp1' };

function realSignedApproval({ keyPair, overrides = {} } = {}) {
  const notBefore = new Date(monday.getTime() - 60_000).toISOString();
  const expiresAt = new Date(monday.getTime() + 3600_000).toISOString();
  return createApproval({
    approvalId: 'appr-1', issuerId: 'owner', keyId: 'owner-key-1', tenantId: 'UberBond',
    actorIds: ['pipeline.maybeSend'], operations: ['outbound.email.send'],
    resourcePrefixes: ['gmail-inbox:'], purposes: ['cold-outreach'], effectClasses: ['COMMUNICATE_EXTERNAL'],
    maxBlastRadius: 5, maxCostUsd: 10, maxUses: 100, notBefore, expiresAt: overrides.expiresAt || expiresAt,
    issuedAt: notBefore, ...overrides
  }, digest => signDigestHex(digest, keyPair.privateKey));
}

test('shouldConsultV9 is true only for an actual Guard ALLOW', () => {
  assert.equal(shouldConsultV9('ALLOW_LOCAL_PREPARATION'), true);
  assert.equal(shouldConsultV9('DENY'), false);
  assert.equal(shouldConsultV9('REVIEW_REQUIRED'), false);
  assert.equal(shouldConsultV9(undefined), false);
});

test('a Guard denial short-circuits: V9 is never consulted (buildIntent is never even called)', () => {
  let buildIntentCalls = 0;
  const result = evaluateConsequenceBoundary({
    guardDecision: 'DENY',
    buildIntent: () => { buildIntentCalls += 1; return {}; },
    date: monday
  });
  assert.equal(result.ok, false);
  assert.equal(result.finalDecision, 'DENY');
  assert.equal(result.v9Consulted, false);
  assert.equal(result.v9Decision, null);
  assert.equal(buildIntentCalls, 0, 'V9 must never be consulted when Guard denies');
  assert.equal(result.policyVersion, CONSEQUENCE_BOUNDARY_POLICY_VERSION);
});

test('a Guard REVIEW_REQUIRED also short-circuits -- only an explicit ALLOW reaches V9', () => {
  let buildIntentCalls = 0;
  const result = evaluateConsequenceBoundary({ guardDecision: 'REVIEW_REQUIRED', buildIntent: () => { buildIntentCalls += 1; return {}; }, date: monday });
  assert.equal(result.v9Consulted, false);
  assert.equal(buildIntentCalls, 0);
});

test('a Guard ALLOW with no v9Context at all fails closed at V9 (missing evidence-requirement policy)', () => {
  const result = evaluateConsequenceBoundary({
    guardDecision: 'ALLOW_LOCAL_PREPARATION',
    buildIntent: () => buildOutboundActionIntent({ prospect, campaign, inbox: 'A', cfg, date: monday, nonce: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() }),
    date: monday
  });
  assert.equal(result.v9Consulted, true);
  assert.equal(result.ok, false);
  assert.equal(result.finalDecision, 'DENY');
  assert.ok(result.v9Decision.reasons.some(r => r.includes('requirement-resolver-missing')));
});

test('a Guard ALLOW that reaches the policy stage (evidence requirements satisfied, no approval supplied) still fails closed -- the default policyAuthorizer never grants', () => {
  const result = evaluateConsequenceBoundary({
    guardDecision: 'ALLOW_LOCAL_PREPARATION',
    buildIntent: () => buildOutboundActionIntent({ prospect, campaign, inbox: 'A', cfg, date: monday, nonce: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() }),
    v9Context: { evidenceRequirementResolver: () => ({ minCount: 0, allowedOrigins: null }) },
    date: monday
  });
  assert.equal(result.v9Consulted, true);
  assert.equal(result.ok, false);
  assert.equal(result.finalDecision, 'REVIEW');
});

test('defaultFailClosedPolicyAuthorizer always denies with an honest reason, never a permissive default', () => {
  const result = defaultFailClosedPolicyAuthorizer();
  assert.equal(result.decision, 'DENY');
  assert.ok(result.reasons.length > 0);
});

test('buildOutboundActionIntent refuses to build without an explicit nonce/idempotencyKey', () => {
  assert.throws(() => buildOutboundActionIntent({ prospect, campaign, inbox: 'A', cfg, date: monday }), TypeError);
});

test('buildOutboundActionIntent produces a real, schema-valid, digest-verifiable intent', () => {
  const intent = buildOutboundActionIntent({ prospect, campaign, inbox: 'A', cfg, date: monday, nonce: 'n1', idempotencyKey: 'idem1' });
  const verified = verifyIntent(intent, { now: monday });
  assert.equal(verified.ok, true, JSON.stringify(verified.errors));
  assert.equal(intent.effectClass, 'COMMUNICATE_EXTERNAL');
  assert.equal(intent.resource, 'gmail-inbox:A');
});

test('an expired intent is rejected by V9 even with a covering approval and permissive authorizer', () => {
  const keyPair = crypto.generateKeyPairSync('ed25519');
  const approval = realSignedApproval({ keyPair });
  const intent = buildOutboundActionIntent({ prospect, campaign, inbox: 'A', cfg, date: monday, nonce: 'n1', idempotencyKey: 'idem1', ttlMs: 1000 });
  const later = new Date(monday.getTime() + 5000); // well past the 1s TTL
  const result = evaluateV9Admission({
    intent, approvals: [approval], date: later,
    keyResolver: () => keyPair.publicKey,
    evidenceRequirementResolver: () => ({ minCount: 0, allowedOrigins: null }),
    policyAuthorizer: () => ({ decision: 'ALLOW', reasons: ['test-permissive'] })
  });
  assert.equal(result.decision, 'DENY');
});

test('a genuine end-to-end ALLOW is possible when real approval + evidence policy + permissive authorizer are all supplied -- the mechanism is real, not a stub', () => {
  const keyPair = crypto.generateKeyPairSync('ed25519');
  const approval = realSignedApproval({ keyPair });
  const result = evaluateConsequenceBoundary({
    guardDecision: 'ALLOW_LOCAL_PREPARATION',
    buildIntent: () => buildOutboundActionIntent({ prospect, campaign, inbox: 'A', cfg, date: monday, nonce: 'n1', idempotencyKey: 'idem1' }),
    v9Context: {
      approvals: [approval],
      keyResolver: () => keyPair.publicKey,
      evidenceRequirementResolver: () => ({ minCount: 0, allowedOrigins: null }),
      policyAuthorizer: () => ({ decision: 'ALLOW', reasons: ['owner-approved-for-test'] }),
      policyVersion: 'test-policy-v1', policyDigest: 'a'.repeat(64), constitutionDigest: 'b'.repeat(64)
    },
    date: monday
  });
  assert.equal(result.ok, true);
  assert.equal(result.finalDecision, 'ALLOW');
  assert.equal(result.v9Decision.decision, 'ALLOW');
});

test('an approval scoped to a different resource prefix does not cover the intent (no accidental over-broad grant)', () => {
  const keyPair = crypto.generateKeyPairSync('ed25519');
  const approval = realSignedApproval({ keyPair, overrides: { resourcePrefixes: ['gmail-inbox:B'] } });
  const result = evaluateV9Admission({
    intent: buildOutboundActionIntent({ prospect, campaign, inbox: 'A', cfg, date: monday, nonce: 'n1', idempotencyKey: 'idem1' }),
    approvals: [approval], date: monday, keyResolver: () => keyPair.publicKey,
    evidenceRequirementResolver: () => ({ minCount: 0, allowedOrigins: null }),
    policyAuthorizer: () => ({ decision: 'ALLOW', reasons: [] })
  });
  assert.notEqual(result.decision, 'ALLOW');
});

test('a tampered approval signature is rejected, never silently accepted', () => {
  const keyPair = crypto.generateKeyPairSync('ed25519');
  const approval = realSignedApproval({ keyPair });
  const tampered = { ...approval, maxCostUsd: 999999 }; // mutate after signing
  const result = evaluateV9Admission({
    intent: buildOutboundActionIntent({ prospect, campaign, inbox: 'A', cfg, date: monday, nonce: 'n1', idempotencyKey: 'idem1' }),
    approvals: [tampered], date: monday, keyResolver: () => keyPair.publicKey,
    evidenceRequirementResolver: () => ({ minCount: 0, allowedOrigins: null }),
    policyAuthorizer: () => ({ decision: 'ALLOW', reasons: [] })
  });
  assert.notEqual(result.decision, 'ALLOW');
});

test('the same reference date and inputs produce a byte-identical composition result', () => {
  const args = () => ({
    guardDecision: 'ALLOW_LOCAL_PREPARATION',
    buildIntent: () => buildOutboundActionIntent({ prospect, campaign, inbox: 'A', cfg, date: monday, nonce: 'n1', idempotencyKey: 'idem1' }),
    date: monday
  });
  const a = evaluateConsequenceBoundary(args());
  const b = evaluateConsequenceBoundary(args());
  assert.deepEqual(a, b);
});

test('this module never performs I/O of its own and reuses the vendored kernel rather than reimplementing admission logic', async () => {
  const fs = await import('node:fs/promises');
  const source = await fs.readFile(new URL('../src/consequence-boundary.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /fetch\(|http\.request|https\.request|readFile\(|writeFile\(/);
  assert.match(source, /from '\.\/omnia-v9\/kernel\.mjs'/);
});
