import crypto from 'node:crypto';

export const RUNTIME_EVIDENCE_ATTESTATION_VERSION='uberbond.runtime-evidence-attestation.v1.1';
const SHA40=/^[0-9a-f]{40}$/;
const SHA256=/^sha256:[0-9a-f]{64}$/;
const text=(v,max=1000)=>{const s=String(v??'').trim();return s&&s.length<=max?s:null;};
function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));return value;}
function objectDigest(value){return `sha256:${crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex')}`;}
function receiptDigestOrObject(receipt={}){const declared=String(receipt?.receiptDigest||'').toLowerCase();return SHA256.test(declared)?declared:objectDigest(receipt);}

export function runtimeEvidenceAttestationPayload({sourceCommit,host={},postgresRestoreReceipt={},restartRecoveryReceipt={},durableWorkloadReceipt={},cutoverRollbackReceipt={},continuityRehearsal={},providerLossReceipt={},controlPlaneReceipt={}}={}){
  return {
    version:RUNTIME_EVIDENCE_ATTESTATION_VERSION,
    sourceCommit:String(sourceCommit||'').toLowerCase(),
    host:{
      runtimeIdentity:text(host.runtimeIdentity),
      provider:text(host.provider,160),
      region:text(host.region,160),
      imageDigest:String(host.imageDigest||'').toLowerCase(),
      configDigest:String(host.configDigest||'').toLowerCase(),
      dataSchemaDigest:String(host.dataSchemaDigest||'').toLowerCase(),
      sourceCommit:String(host.sourceCommit||sourceCommit||'').toLowerCase(),
      authenticatedHealthObserved:host.authenticatedHealthObserved===true
    },
    acceptanceEvidenceDigests:{
      postgresRestore:receiptDigestOrObject(postgresRestoreReceipt),
      restartRecovery:objectDigest(restartRecoveryReceipt),
      durableWorkload:receiptDigestOrObject(durableWorkloadReceipt),
      cutoverRollback:receiptDigestOrObject(cutoverRollbackReceipt),
      continuityRehearsal:objectDigest(continuityRehearsal),
      providerLoss:receiptDigestOrObject(providerLossReceipt),
      controlPlane:receiptDigestOrObject(controlPlaneReceipt)
    }
  };
}

function configuredEd25519PublicKey(publicKeyPem){
  try{
    const key=crypto.createPublicKey(publicKeyPem);
    return key.asymmetricKeyType==='ed25519'?key:null;
  }catch{return null;}
}

export function runtimeEvidencePublicKeyFingerprint(publicKeyPem){
  const key=configuredEd25519PublicKey(publicKeyPem);
  if(!key)return null;
  try{
    const der=key.export({type:'spki',format:'der'});
    return `sha256:${crypto.createHash('sha256').update(der).digest('hex')}`;
  }catch{return null;}
}

export function verifyRuntimeEvidenceAttestation({attestation,input,publicKeyPem}={}){
  if(!attestation||attestation.version!==RUNTIME_EVIDENCE_ATTESTATION_VERSION) return false;
  const payload=runtimeEvidenceAttestationPayload(input);
  if(!SHA40.test(payload.sourceCommit)||payload.host.sourceCommit!==payload.sourceCommit) return false;
  if(!payload.host.runtimeIdentity||!payload.host.provider||!payload.host.region||payload.host.authenticatedHealthObserved!==true) return false;
  if(!SHA256.test(payload.host.imageDigest)||!SHA256.test(payload.host.configDigest)||!SHA256.test(payload.host.dataSchemaDigest)) return false;
  if(Object.values(payload.acceptanceEvidenceDigests).some(value=>!SHA256.test(value))) return false;
  const key=configuredEd25519PublicKey(publicKeyPem);
  const fingerprint=runtimeEvidencePublicKeyFingerprint(publicKeyPem);
  if(!key||!fingerprint||attestation.publicKeyFingerprint!==fingerprint) return false;
  const signature=text(attestation.signatureBase64,4096);
  if(!signature) return false;
  try{
    return crypto.verify(null,Buffer.from(JSON.stringify(payload)),key,Buffer.from(signature,'base64'));
  }catch{return false;}
}
