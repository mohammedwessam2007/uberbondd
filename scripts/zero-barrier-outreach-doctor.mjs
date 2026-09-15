#!/usr/bin/env node
import { compileZeroBarrierOutreachReadiness } from '../src/outreach-zero-barrier-fabric.mjs';
import { admitPermissionedGateway } from '../src/uberdepin-permissioned-gateway.mjs';
import { compileReputationCredential } from '../src/uberreputation-credentials.mjs';
import { compileJitProvisioningPlan } from '../src/ubermail-jit-provisioning.mjs';
import { compileAttentionStake } from '../src/uberattention-stake-ledger.mjs';
import { rankSubstitutionMechanisms } from '../src/uberzero-substitution-engine.mjs';

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
  const substitutions = rankSubstitutionMechanisms(fixture.substitutionMechanisms || []);

  return {
    schemaVersion: 'uberbond.zero-barrier-outreach-doctor.v1',
    observedAt: new Date(now).toISOString(),
    readiness,
    depin,
    reputation,
    jit,
    stakes,
    substitutions,
    externalEffectAuthority: 'NONE',
    automaticSendAuthority: false,
    automaticSpendAuthority: false,
    verdict: readiness.pressable === true ? 'SMTP_100K_CERTIFIED' : 'NOT_YET_SMTP_100K_CERTIFIED',
    truthBoundary: 'This operator doctor compiles source-side evidence only. It does not contact recipients, provision accounts, mutate DNS, deploy devices, move money, or create external capacity.'
  };
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  process.stdout.write(`${JSON.stringify(runZeroBarrierOutreachDoctor(), null, 2)}\n`);
}
