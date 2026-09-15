import test from 'node:test';
import assert from 'node:assert/strict';
import { admitPermissionedGateway } from '../src/uberdepin-permissioned-gateway.mjs';
import { compileReputationCredential } from '../src/uberreputation-credentials.mjs';
import { compileJitProvisioningPlan } from '../src/ubermail-jit-provisioning.mjs';
import { compileAttentionStake, settleAttentionStakeProposal } from '../src/uberattention-stake-ledger.mjs';
import { rankSubstitutionMechanisms } from '../src/uberzero-substitution-engine.mjs';

const NOW = new Date('2026-09-16T00:00:00Z');

test('permissioned DePIN gateway rejects residential IP evasion', () => {
  const row = admitPermissionedGateway({ nodeId:'n1', operatorAuthorized:true, operatorAuthorityRef:'auth:n1', networkUsePermitted:true, providerTermsCompatible:true, cleanIpEvidenceVerified:true, residentialIpEvasion:true, allowedWorkloads:['COMPUTE'], observedAt:'2026-09-15T23:00:00Z' }, { now: NOW });
  assert.equal(row.ready, false);
  assert.ok(row.reasonCodes.includes('ip-evasion-forbidden'));
});

test('portable reputation credential does not assume receiver adoption', () => {
  const credential = compileReputationCredential({ subjectId:'sender-1', issuerId:'issuer-1', issuerAuthorized:true, issuerEvidenceRef:'issuer:evidence', expiresAt:'2026-09-20T00:00:00Z', claims:[{ metric:'COMPLAINT_RATE_MAX', comparator:'<=', threshold:0.001, evidenceRef:'metric:evidence' }] }, { now: NOW });
  assert.equal(credential.valid, true);
  assert.equal(credential.receiverAdoptionAssumed, false);
  assert.equal(credential.externalEffectAuthority, 'NONE');
});

test('JIT provisioning preserves persistent sender identity and rejects disposable rotation', () => {
  const plan = compileJitProvisioningPlan({ planId:'jit-1', rootDomain:'example.com', domainOwnerAuthorized:true, domainAuthorityRef:'owner:example', providerTermsCompatible:true, persistentSenderIdentity:true, disposableIdentityRotation:true, spfConfigured:true, dkimConfigured:true, dmarcConfigured:true, requestedMailboxes:10 }, { now: NOW });
  assert.equal(plan.readyForAuthorizedExecution, false);
  assert.ok(plan.reasonCodes.includes('disposable-identity-rotation-forbidden'));
});

test('attention stake remains proposal-only and cannot move money', () => {
  const stake = compileAttentionStake({ stakeId:'s1', requestId:'q1', senderId:'a', recipientId:'b', amount:0.001, currency:'USD', senderAuthorized:true, recipientTermsAccepted:true, termsRef:'terms:1', expiresAt:'2026-09-17T00:00:00Z' }, { now: NOW });
  assert.equal(stake.valid, true);
  const proposal = settleAttentionStakeProposal({ stake, outcome:'ENGAGED' });
  assert.equal(proposal.state, 'SETTLEMENT_PROPOSED');
  assert.equal(proposal.automaticMoneyMovementAuthority, false);
});

test('UberZero refuses mechanisms that depend on policy evasion or false evidence', () => {
  const ranked = rankSubstitutionMechanisms([
    { mechanismId:'good', scarceResource:'COMPUTE', maturity:'TODAY', remainingExternalDependencies:[], hardPhysicalBounds:['electricity'], falsifier:'no authorized worker', recurringCostReduction:0.8, sovereigntyGain:0.9 },
    { mechanismId:'bad', scarceResource:'SMTP', maturity:'TODAY', remainingExternalDependencies:[], hardPhysicalBounds:['recipient acceptance'], falsifier:'blocked', requiresPolicyEvasion:true, recurringCostReduction:1, sovereigntyGain:1 }
  ]);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].mechanismId, 'good');
});
