#!/usr/bin/env node
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compileZeroBarrierOutreachReadiness } from '../src/outreach-zero-barrier-fabric.mjs';
import { admitPermissionedGateway } from '../src/uberdepin-permissioned-gateway.mjs';
import { compileReputationCredential } from '../src/uberreputation-credentials.mjs';
import { compileJitProvisioningPlan } from '../src/ubermail-jit-provisioning.mjs';
import { compileAttentionStake } from '../src/uberattention-stake-ledger.mjs';
import { issueRecipientAttentionPermit, evaluateAttentionRequest } from '../src/uberattention-protocol.mjs';
import { rankSubstitutionMechanisms } from '../src/uberzero-substitution-engine.mjs';
import { compileObjectiveSubstitution } from '../src/uberreach-objective-substitution.mjs';

export function runZeroBarrierOutreachDoctor({ now = new Date(), fixture = {} } = {}) {
  const readiness = compileZeroBarrierOutreachReadiness({
    launchInput: fixture.launchInput || {},
    mailExchange: fixture.mailExchange || {},
    swarm: fixture.swarm || {},
    reach: fixture.reach || {},
    zeroCostResources: fixture.zeroCostResources || {},
    now
  });

  const depin = (fixture.depinGateways || []).map(row => admitPermissionedGateway(row, { now }));
  const reputation = (fixture.reputationCredentials || []).map(row => compileReputationCredential(row, { now }));
  const jit = (fixture.jitProvisioningPlans || []).map(row => compileJitProvisioningPlan(row, { now }));
  const stakes = (fixture.attentionStakes || []).map(row => compileAttentionStake(row, { now }));
  const attentionPermits = (fixture.attentionPermits || []).map(row => issueRecipientAttentionPermit(row, { now }));
  const attentionRequests = (fixture.attentionRequests || []).map(row => evaluateAttentionRequest({ permit: row.permit, request: row.request, now }));
  const substitutions = rankSubstitutionMechanisms(fixture.substitutionMechanisms || []);
  const objectiveSubstitution = compileObjectiveSubstitution({
    opportunities: fixture.reach?.opportunities || fixture.opportunities || [],
    endpoints: fixture.reach?.endpoints || fixture.endpoints || [],
    smtpCertificate: readiness.smtpLaunchCertificate || null,
    target: fixture.economicReachTarget || 100000,
    now
  });

  return {
    schemaVersion: 'uberbond.zero-barrier-outreach-doctor.v1',
    observedAt: new Date(now).toISOString(),
    readiness,
    depin,
    reputation,
    jit,
    stakes,
    attentionPermits,
    attentionRequests,
    substitutions,
    objectiveSubstitution,
    externalEffectAuthority: 'NONE',
    automaticSendAuthority: false,
    automaticSpendAuthority: false,
    verdict: readiness.pressable === true ? 'SMTP_100K_CERTIFIED' : 'NOT_YET_SMTP_100K_CERTIFIED',
    truthBoundary: 'This operator doctor compiles source-side evidence and lawful objective substitution only. It does not bypass provider limits, suppression, authorization or platform rules; it does not contact recipients, provision accounts, mutate DNS, deploy devices, move money, or create external capacity.'
  };
}

const invokedDirectly = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href === import.meta.url
  : false;

if (invokedDirectly) {
  process.stdout.write(`${JSON.stringify(runZeroBarrierOutreachDoctor(), null, 2)}\n`);
}
