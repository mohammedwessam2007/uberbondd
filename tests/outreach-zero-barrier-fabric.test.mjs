import test from 'node:test';
import assert from 'node:assert/strict';
import { compileUberSwarmPlan, admitUberSwarmWorker } from '../src/uberswarm-edge-fabric.mjs';
import { compileUberMailExchange } from '../src/ubermail-capacity-exchange.mjs';
import { issueRecipientAttentionPermit, evaluateAttentionRequest } from '../src/uberattention-protocol.mjs';
import { compileZeroCostPortfolio } from '../src/ubergrant-zero-cost-registry.mjs';
import { compileUniversalReachPlan } from '../src/uberreach-universal-transport.mjs';
import { hardenCertificateInput } from '../src/outreach-zero-barrier-fabric.mjs';

const NOW = new Date('2026-09-16T00:00:00Z');

test('UberSwarm rejects deceptive enrollment and accepts owner-authorized compute', () => {
  const bad = admitUberSwarmWorker({ workerId:'x', platform:'ANDROID', ownerAuthorized:true, ownerAuthorityRef:'owner:1', consentOrOwnershipVerified:true, stealthInstall:true, observedAt:'2026-09-15T23:00:00Z', memoryMb:4096, logicalCpus:8, thermalHeadroom:1 }, { now: NOW });
  assert.equal(bad.ready, false);
  assert.ok(bad.reasonCodes.includes('deceptive-enrollment-forbidden'));

  const plan = compileUberSwarmPlan({ now: NOW, workers:[{ workerId:'owned-1', platform:'ANDROID', ownerAuthorized:true, ownerAuthorityRef:'owner:1', consentOrOwnershipVerified:true, observedAt:'2026-09-15T23:00:00Z', memoryMb:4096, logicalCpus:8, thermalHeadroom:1, capabilities:['ENRICH','CLASSIFY'] }], tasks:[{ taskId:'t1', requiredCapabilities:['ENRICH'] }] });
  assert.equal(plan.state, 'READY');
  assert.equal(plan.externalEffectAuthority, 'NONE');
});

test('UberMail Exchange rejects open-relay/evasion offers and deduplicates route capacity', () => {
  const common = { provider:'provider-a', ownerAuthorized:true, authorityReceiptRef:'auth:1', providerTermsCompatible:true, senderIdentityAuthenticated:true, reputationHealthy:true, observedDailyCap:60000, usedToday:0, observedAt:'2026-09-15T23:00:00Z' };
  const out = compileUberMailExchange({ now: NOW, required:100000, offers:[
    { ...common, offerId:'a', routeId:'r1' },
    { ...common, offerId:'b', routeId:'r1' },
    { ...common, offerId:'c', routeId:'r3', residentialIpEvasion:true }
  ] });
  assert.equal(out.totalAvailable, 60000);
  assert.equal(out.state, 'CAPACITY_SHORTFALL');
  assert.ok(out.rejected.some(row => row.reasonCodes.includes('duplicate-route-id')));
  assert.ok(out.rejected.some(row => row.reasonCodes.includes('residential-ip-evasion-forbidden')));
});

test('recipient attention permit requires real recipient authorization and never grants delivery authority', () => {
  const permit = { permitId:'p1', recipientId:'r1', recipientAuthorized:true, authorizationEvidenceRef:'recipient:sig', acceptedPurposes:['revenue-audit'], maxMessages:1, expiresAt:'2026-09-17T00:00:00Z' };
  assert.equal(issueRecipientAttentionPermit(permit, { now: NOW }).valid, true);
  const decision = evaluateAttentionRequest({ permit, now:NOW, request:{ requestId:'q1', purpose:'revenue-audit', senderIdentityVerified:true, evidenceRefs:['e:1'], relevanceScore:0.9 } });
  assert.equal(decision.state, 'RECIPIENT_PERMIT_MATCHED');
  assert.equal(decision.externalEffectAuthority, 'NONE');
});

test('zero-cost registry rejects false eligibility factories', () => {
  const portfolio = compileZeroCostPortfolio({ now:NOW, resources:[{ resourceId:'grant-1', provider:'x', kind:'COMPUTE', eligibilityVerified:true, eligibilityEvidenceRef:'e', allowedUseVerified:true, fakeProjectRequired:true, availableUnits:100 }] });
  assert.equal(portfolio.state, 'NO_VERIFIED_RESOURCE');
  assert.ok(portfolio.rejected[0].reasonCodes.includes('false-eligibility-forbidden'));
});

test('UberReach routes only public or authorized, terms-compatible endpoints', () => {
  const plan = compileUniversalReachPlan({ now:NOW, opportunities:[{ opportunityId:'o1', recipientId:'r1', preferredChannels:['ATTENTION_API','EMAIL'] }], endpoints:[{ endpointId:'e1', recipientId:'r1', channel:'ATTENTION_API', publicOrAuthorized:true, platformTermsCompatible:true, evidenceRef:'public:endpoint', observedAt:'2026-09-15T23:00:00Z' }] });
  assert.equal(plan.state, 'READY');
  assert.equal(plan.routes[0].channel, 'ATTENTION_API');
  assert.equal(plan.externalEffectAuthority, 'NONE');
});

test('certificate hardening catches duplicate evidence and unknown usage before canonical certification', () => {
  const h = hardenCertificateInput({
    domains:[{ domainId:'d1' }],
    mailboxes:[{ mailboxId:'m1', usedToday:0 }],
    egressRoutes:[{ routeId:'r1', usedToday:0 },{ routeId:'r1', usedToday:0 }],
    recipientProviders:[{ providerId:'gmail' },{ providerId:'gmail' }]
  });
  assert.ok(h.reasonCodes.includes('duplicate-egress-route-evidence'));
  assert.ok(h.reasonCodes.includes('duplicate-recipient-provider-evidence'));
  assert.ok(h.reasonCodes.includes('observed-usage-required'));
  assert.equal(h.duplicateCounts.egressRoutes, 1);
  assert.equal(h.duplicateCounts.recipientProviders, 1);
});
