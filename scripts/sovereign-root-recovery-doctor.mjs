#!/usr/bin/env node
import { compileSovereignRecoveryCharter, admitSovereignRecovery } from '../src/sovereign-root-recovery.mjs';

const now='2026-09-09T00:30:00.000Z';
const charter=compileSovereignRecoveryCharter({
  sovereignId:'synthetic-founder',
  authorityEpoch:'synthetic-epoch-1',
  charterRef:'synthetic://sovereign-recovery-charter',
  minFactors:2,
  factors:[
    {factorId:'hardware',factorType:'HARDWARE_KEY',custodyDomain:'offline-safe',providerDomain:'OFFLINE-A',evidenceRef:'synthetic://factor/hardware',ownerControlled:true},
    {factorId:'liveness',factorType:'OWNER_LIVENESS_ATTESTATION',custodyDomain:'identity-verifier',providerDomain:'IDENTITY-PROVIDER',evidenceRef:'synthetic://factor/liveness',ownerControlled:false}
  ]
});
const observations=charter.ok?[
  {factorId:'hardware',evidenceRef:'synthetic://obs/hardware',factorStateRef:'synthetic://state/hardware-active',verifierId:'synthetic-verifier-a',observedAt:now,charterDigest:charter.charterDigest,passed:true,factorStillActive:true,identityMatch:false,secretMaterialPersisted:false},
  {factorId:'liveness',evidenceRef:'synthetic://obs/liveness',factorStateRef:'synthetic://state/liveness-active',verifierId:'synthetic-verifier-b',observedAt:now,charterDigest:charter.charterDigest,passed:true,factorStillActive:true,identityMatch:true,secretMaterialPersisted:false}
]:[];
const admission=admitSovereignRecovery({charterResult:charter,recoveringSovereignId:'synthetic-founder',authorityEpoch:'synthetic-epoch-1',observations,now});
const report={
  version:'uberbond.sovereign-root-recovery-doctor.v1',
  charterStatus:charter.status,
  admissionStatus:admission.status,
  charterDigest:charter.charterDigest||null,
  receiptDigest:admission.receiptDigest||null,
  businessEffectAuthority:'NONE',
  runtimeProof:'NONE__SYNTHETIC_ZERO_EFFECT_DOCTOR',
  realIdentityRecoveryPerformed:false,
  credentialsRotated:false,
  privateStateRead:false,
  providerCalls:0,
  spendCents:0
};
process.stdout.write(`${JSON.stringify(report,null,2)}\n`);
if(!charter.ok||!admission.ok) process.exitCode=1;
