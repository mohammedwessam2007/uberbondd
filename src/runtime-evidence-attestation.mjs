import crypto from 'node:crypto';

export const RUNTIME_EVIDENCE_ATTESTATION_VERSION='uberbond.runtime-evidence-attestation.v1.1';
const SHA40=/^[0-9a-f]{40}$/;
const SHA256=/^sha256:[0-9a-f]{64}$/;
const MAX_DEPTH=64;
const MAX_NODES=10000;
const MAX_CANONICAL_BYTES=1024*1024;
const text=(v,max=1000)=>{const s=String(v??'').trim();return s&&s.length<=max?s:null;};
function stable(value,state={seen:new WeakSet(),nodes:0},depth=0){
  if(depth>MAX_DEPTH)throw new Error('runtime-evidence-canonical-depth-exceeded');
  if(value&&typeof value==='object'){
    if(state.seen.has(value))throw new Error('runtime-evidence-canonical-cycle');
    if(++state.nodes>MAX_NODES)throw new Error('runtime-evidence-canonical-node-limit-exceeded');
    state.seen.add(value);
    const out=Array.isArray(value)
      ? value.map(item=>stable(item,state,depth+1))
      : Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key],state,depth+1)]));
    state.seen.delete(value);
    return out;
  }
  return value;
}
function objectDigest(value){
  try{
    const serialized=JSON.stringify(stable(value));
    if(Buffer.byteLength(serialized,'utf8')>MAX_CANONICAL_BYTES)return null;
    return `sha256:${crypto.createHash('sha256').update(serialized).digest('hex')}`;
  }catch{return null;}
}

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
      postgresRestore:objectDigest(postgresRestoreReceipt),
      restartRecovery:objectDigest(restartRecoveryReceipt),
      durableWorkload:objectDigest(durableWorkloadReceipt),
      cutoverRollback:objectDigest(cutoverRollbackReceipt),
      continuityRehearsal:objectDigest(continuityRehearsal),
      providerLoss:objectDigest(providerLossReceipt),
      controlPlane:objectDigest(controlPlaneReceipt)
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
  if(Object.values(payload.acceptanceEvidenceDigests).some(value=>!value||!SHA256.test(value))) return false;
  const key=configuredEd25519PublicKey(publicKeyPem);
  const fingerprint=runtimeEvidencePublicKeyFingerprint(publicKeyPem);
  if(!key||!fingerprint||attestation.publicKeyFingerprint!==fingerprint) return false;
  const signature=text(attestation.signatureBase64,4096);
  if(!signature) return false;
  try{
    return crypto.verify(null,Buffer.from(JSON.stringify(payload)),key,Buffer.from(signature,'base64'));
  }catch{return false;}
}
