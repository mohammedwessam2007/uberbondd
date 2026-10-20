import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {
  objectiveEscrowPublicKeyFingerprint,objectiveEscrowSignaturePayload,
  verifyObjectiveEscrow,PHOENIX_OBJECTIVE_SIGNATURE_VERSION
} from '../src/phoenix-objective-escrow.mjs';
import {runPhoenixCosCommand} from '../scripts/phoenix-cos-operator.mjs';

const objective='PROMOTION TEST: never change the evaluation target after the run starts.\n';
const pair=generateKeyPairSync('ed25519');
const publicKeyPem=pair.publicKey.export({format:'pem',type:'spki'}).toString();
const fp=objectiveEscrowPublicKeyFingerprint(publicKeyPem);
const baselineDigest='sha256:'+createHash('sha256').update(objective).digest('hex');
function signed({body=objective,key=pair.privateKey,pub=publicKeyPem,fingerprint=fp}={}){
  const payload=objectiveEscrowSignaturePayload('sha256:'+createHash('sha256').update(body).digest('hex'));
  return {version:PHOENIX_OBJECTIVE_SIGNATURE_VERSION,
    objectiveDigest:payload.objectiveDigest,
    publicKeyFingerprint:fingerprint,
    signatureBase64:sign(null,Buffer.from(JSON.stringify(payload)),key).toString('base64')};
}
const args=(override={})=>({
  originalObjectiveText:objective,currentObjectiveText:objective,
  attestation:signed(),verifierPublicKeyPem:publicKeyPem,
  trustedVerifierFingerprint:fp,...override
});
test('real Ed25519 signed escrow accepts unchanged objective with separately pinned fingerprint',()=>{
  const r=verifyObjectiveEscrow(args());
  assert.equal(r.ok,true);
  assert.equal(r.status,'OBJECTIVE_ESCROW_INTACT');
  assert.equal(r.decision,'LOCAL_OBJECTIVE_CHECK_PASSED');
  assert.equal(r.originalObjectiveDigest,baselineDigest);
  assert.equal(r.signatureVerified,true);
  assert.equal(r.byteIdentityVerified,true);
  assert.equal(r.acceptanceLink.proposalId,'phoenix-wave6-0001');
  assert.equal(r.externalEffectLedger.providerCalls,0);
  assert.equal(r.externalEffectAuthority,'NONE');
});
test('agent-mutated objective fails even if original signature is still valid',()=>{
  const r=verifyObjectiveEscrow(args({currentObjectiveText:objective+'metric changed\n'}));
  assert.equal(r.ok,false);
  assert.equal(r.decision,'DENY');
  assert.equal(r.reason,'EVALUATION_OBJECTIVE_MUTATED');
  assert.equal(r.signedOriginalDigest,baselineDigest);
});
test('fake signer or substitute trust fingerprint cannot bypass the pinned public key',()=>{
  const attacker=generateKeyPairSync('ed25519');
  const attackerPublic=attacker.publicKey.export({type:'spki',format:'pem'}).toString();
  assert.equal(verifyObjectiveEscrow(args({verifierPublicKeyPem:attackerPublic})).reason,'VERIFIER_KEY_NOT_PINNED_TO_TRUST_ANCHOR');
  assert.equal(verifyObjectiveEscrow(args({trustedVerifierFingerprint:'sha256:'+'0'.repeat(64)})).reason,'VERIFIER_KEY_NOT_PINNED_TO_TRUST_ANCHOR');
  assert.equal(verifyObjectiveEscrow(args({trustedVerifierFingerprint:undefined})).reason,'INDEPENDENT_TRUST_ANCHOR_FINGERPRINT_REQUIRED');
  const forged=signed({key:attacker.privateKey});
  assert.equal(verifyObjectiveEscrow(args({attestation:forged})).reason,'OBJECTIVE_SIGNATURE_INVALID');
});
test('replay with altered original digest or objective content fails before launch',()=>{
  const altered=signed({body:objective+'extra'});
  assert.equal(verifyObjectiveEscrow(args({attestation:altered})).reason,'SIGNED_OBJECTIVE_BASELINE_MISSING_OR_MISMATCHED');
  const corrupt={...signed(),signatureBase64:'a'.repeat(88)};
  assert.equal(verifyObjectiveEscrow(args({attestation:corrupt})).reason,'OBJECTIVE_SIGNATURE_INVALID');
  assert.equal(verifyObjectiveEscrow(args({originalObjectiveText:objective+'tampered'})).reason,'SIGNED_OBJECTIVE_BASELINE_MISSING_OR_MISMATCHED');
  assert.equal(verifyObjectiveEscrow(args({currentObjectiveText:'a'.repeat(1024*1024+1)})).reason,'BOUNDED_ORIGINAL_AND_CURRENT_OBJECTIVE_TEXT_REQUIRED');
});
test('CoS entry returns only expected zero-effect proof; no signer or private key required in chat',()=>{
  const input=JSON.stringify(args());
  const r=runPhoenixCosCommand(['objective-escrow-verify',input]);
  assert.equal(r.ok,true);
  assert.equal(r.verifierFingerprint,fp);
  assert.equal(JSON.stringify(r).includes('BEGIN PUBLIC KEY'),false);
  assert.equal(JSON.stringify(r).includes('PRIVATE KEY'),false);
  const b=runPhoenixCosCommand(['objective-escrow-verify','{"invalid":true}']);
  assert.equal(b.ok,false);
  assert.equal(b.externalEffectAuthority,'NONE');
});
