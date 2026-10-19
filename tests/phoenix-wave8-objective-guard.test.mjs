import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {objectiveEscrowPublicKeyFingerprint,objectiveEscrowSignaturePayload,PHOENIX_OBJECTIVE_SIGNATURE_VERSION} from '../src/phoenix-objective-escrow.mjs';
import {gateWave8CandidatePromotion} from '../src/phoenix-wave8-objective-guard.mjs';
import {runPhoenixCosCommand} from '../scripts/phoenix-cos-operator.mjs';
const commit='a'.repeat(40), original='eval target alpha', changed='eval target beta';
const keys=generateKeyPairSync('ed25519');
const publicKeyPem=keys.publicKey.export({format:'pem',type:'spki'}).toString();
const fingerprint=objectiveEscrowPublicKeyFingerprint(publicKeyPem);
const d='sha256:'+createHash('sha256').update(original).digest('hex');
const signed={version:PHOENIX_OBJECTIVE_SIGNATURE_VERSION,objectiveDigest:d,
  publicKeyFingerprint:fingerprint,signatureBase64:sign(null,
    Buffer.from(JSON.stringify(objectiveEscrowSignaturePayload(d))),keys.privateKey).toString('base64')};
const base={candidateCommitSha:commit,objectiveEscrow:{originalObjectiveText:original,
  currentObjectiveText:original,verifierPublicKeyPem:publicKeyPem,
  trustedVerifierFingerprint:fingerprint,attestation:signed}};
test('Wave 8 tampering evaluator after candidate commit holds promotion',()=>{
  const out=gateWave8CandidatePromotion({...base,objectiveEscrow:{...base.objectiveEscrow,currentObjectiveText:changed}});
  assert.equal(out.ok,false);assert.equal(out.status,'WAVE8_PROMOTION_HELD');
  assert.equal(out.sourceReason,'EVALUATION_OBJECTIVE_MUTATED');
  assert.equal(out.promotionAuthority,'NONE');
});
test('passing objective integrity is only a precondition, never automatic promotion',()=>{
  const out=gateWave8CandidatePromotion(base);
  assert.equal(out.ok,true);
  assert.equal(out.status,'WAVE8_OBJECTIVE_INTEGRITY_PRECONDITION_PASSED');
  assert.equal(out.canPromote,false);
  assert.equal(out.promotionAuthority,'NONE');
  assert.equal(out.externalEffectLedger.providerCalls,0);
});
test('unknown candidate commit and missing signature are denied',()=>{
  assert.equal(gateWave8CandidatePromotion({...base,candidateCommitSha:'bad'}).ok,false);
  assert.equal(gateWave8CandidatePromotion({...base,objectiveEscrow:{}}).ok,false);
});
test('CoS executes same local Wave 8 guard with no external effects',()=>{
  const r=runPhoenixCosCommand(['wave8-objective-guard',JSON.stringify(base)]);
  assert.equal(r.ok,true);assert.equal(r.canPromote,false);
  assert.equal(r.externalEffectAuthority,'NONE');
});
