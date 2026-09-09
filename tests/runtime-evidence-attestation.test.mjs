import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  RUNTIME_EVIDENCE_ATTESTATION_VERSION,
  runtimeEvidenceAttestationPayload,
  runtimeEvidencePublicKeyFingerprint,
  verifyRuntimeEvidenceAttestation
} from '../src/runtime-evidence-attestation.mjs';

const sha='a'.repeat(40), d='sha256:'+'b'.repeat(64);
const keys=crypto.generateKeyPairSync('ed25519');
const publicPem=keys.publicKey.export({type:'spki',format:'pem'}).toString();
function input(){return{
  sourceCommit:sha,
  host:{runtimeIdentity:'runtime:host-alt',provider:'provider:alt',region:'r1',imageDigest:d,configDigest:d,dataSchemaDigest:d,sourceCommit:sha,authenticatedHealthObserved:true},
  postgresRestoreReceipt:{ok:true,status:'POSTGRES_BACKUP_RESTORE_REHEARSAL_INDEPENDENTLY_VERIFIED',sourceCommit:sha,evidenceRef:'pg:evidence',runtimeIdentity:'runtime:host-alt/db'},
  restartRecoveryReceipt:{ok:true,status:'RESTART_RECOVERY_REHEARSAL_PASSED',sourceCommit:sha,commands:['node drill'],observed:{replaySafeRecovered:1}},
  durableWorkloadReceipt:{ok:true,receiptDigest:d,workloadId:'job:1',runtimeIdentity:'runtime:host-alt'},
  cutoverRollbackReceipt:{ok:true,receiptDigest:d,fromRuntimeIdentity:'runtime:primary',toRuntimeIdentity:'runtime:host-alt'},
  continuityRehearsal:{ok:true,status:'CONTINUITY_REHEARSAL_VERIFIED_WITHIN_DECLARED_SCOPE',manifestDigest:d,evidenceRefs:['continuity:evidence']},
  providerLossReceipt:{ok:true,receiptDigest:d,failedProvider:'provider:primary',alternateProvider:'provider:alt'},
  controlPlaneReceipt:{evidenceClass:'OBSERVED_RUNTIME',sourceCommit:sha,runtimeIdentity:'runtime:host-alt',receiptDigest:d,evidenceRef:'control:evidence'}
};}
function attest(value,key=keys.privateKey,pem=publicPem){const payload=runtimeEvidenceAttestationPayload(value);return{version:RUNTIME_EVIDENCE_ATTESTATION_VERSION,publicKeyFingerprint:runtimeEvidencePublicKeyFingerprint(pem),signatureBase64:crypto.sign(null,Buffer.from(JSON.stringify(payload)),key).toString('base64')};}

test('valid Ed25519 signature covers the complete acceptance evidence set',()=>{const x=input();assert.equal(verifyRuntimeEvidenceAttestation({attestation:attest(x),input:x,publicKeyPem:publicPem}),true);});
test('host image config schema and health state are signature-bound',()=>{for(const mutate of [x=>x.host.imageDigest='sha256:'+'c'.repeat(64),x=>x.host.configDigest='sha256:'+'c'.repeat(64),x=>x.host.dataSchemaDigest='sha256:'+'c'.repeat(64),x=>x.host.authenticatedHealthObserved=false]){const x=input(),a=attest(x);mutate(x);assert.equal(verifyRuntimeEvidenceAttestation({attestation:a,input:x,publicKeyPem:publicPem}),false);}});
test('postgres restore mutation behind unchanged child receipt shape breaks attestation',()=>{const x=input(),a=attest(x);x.postgresRestoreReceipt.evidenceRef='pg:forged';assert.equal(verifyRuntimeEvidenceAttestation({attestation:a,input:x,publicKeyPem:publicPem}),false);});
test('restart recovery mutation breaks attestation',()=>{const x=input(),a=attest(x);x.restartRecoveryReceipt.observed.replaySafeRecovered=99;assert.equal(verifyRuntimeEvidenceAttestation({attestation:a,input:x,publicKeyPem:publicPem}),false);});
test('transition object mutation breaks attestation even when self-declared receiptDigest is left unchanged',()=>{for(const key of ['durableWorkloadReceipt','cutoverRollbackReceipt','providerLossReceipt']){const x=input(),a=attest(x);x[key].forged='changed-after-signing';assert.equal(verifyRuntimeEvidenceAttestation({attestation:a,input:x,publicKeyPem:publicPem}),false);}});
test('continuity rehearsal mutation breaks attestation',()=>{const x=input(),a=attest(x);x.continuityRehearsal.evidenceRefs.push('forged');assert.equal(verifyRuntimeEvidenceAttestation({attestation:a,input:x,publicKeyPem:publicPem}),false);});
test('control-plane mutation breaks attestation',()=>{const x=input(),a=attest(x);x.controlPlaneReceipt.evidenceRef='control:forged';assert.equal(verifyRuntimeEvidenceAttestation({attestation:a,input:x,publicKeyPem:publicPem}),false);});
test('attacker Ed25519 key cannot replace configured trust anchor',()=>{const x=input(),attacker=crypto.generateKeyPairSync('ed25519'),attackerPem=attacker.publicKey.export({type:'spki',format:'pem'}).toString(),a=attest(x,attacker.privateKey,attackerPem);assert.equal(verifyRuntimeEvidenceAttestation({attestation:a,input:x,publicKeyPem:publicPem}),false);});
test('non-Ed25519 protected key is refused as a runtime-evidence trust root',()=>{const rsa=crypto.generateKeyPairSync('rsa',{modulusLength:2048}),rsaPem=rsa.publicKey.export({type:'spki',format:'pem'}).toString();assert.equal(runtimeEvidencePublicKeyFingerprint(rsaPem),null);const x=input();assert.equal(verifyRuntimeEvidenceAttestation({attestation:attest(x),input:x,publicKeyPem:rsaPem}),false);});
