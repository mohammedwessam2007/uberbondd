import crypto from 'node:crypto';

export const RUNTIME_EVIDENCE_ATTESTATION_VERSION='uberbond.runtime-evidence-attestation.v1';
const SHA40=/^[0-9a-f]{40}$/;
const SHA256=/^sha256:[0-9a-f]{64}$/;
const text=(v,max=1000)=>{const s=String(v??'').trim();return s&&s.length<=max?s:null;};

export function runtimeEvidenceAttestationPayload({sourceCommit,host,durableWorkloadReceipt,cutoverRollbackReceipt,providerLossReceipt}={}){
  return {
    version:RUNTIME_EVIDENCE_ATTESTATION_VERSION,
    sourceCommit:String(sourceCommit||'').toLowerCase(),
    runtimeIdentity:text(host?.runtimeIdentity),
    provider:text(host?.provider,160),
    transitionReceiptDigests:{
      durableWorkload:String(durableWorkloadReceipt?.receiptDigest||'').toLowerCase(),
      cutoverRollback:String(cutoverRollbackReceipt?.receiptDigest||'').toLowerCase(),
      providerLoss:String(providerLossReceipt?.receiptDigest||'').toLowerCase()
    }
  };
}

export function runtimeEvidencePublicKeyFingerprint(publicKeyPem){
  try{
    const key=crypto.createPublicKey(publicKeyPem);
    const der=key.export({type:'spki',format:'der'});
    return `sha256:${crypto.createHash('sha256').update(der).digest('hex')}`;
  }catch{return null;}
}

export function verifyRuntimeEvidenceAttestation({attestation,input,publicKeyPem}={}){
  if(!attestation||attestation.version!==RUNTIME_EVIDENCE_ATTESTATION_VERSION) return false;
  const payload=runtimeEvidenceAttestationPayload(input);
  if(!SHA40.test(payload.sourceCommit)) return false;
  if(!payload.runtimeIdentity||!payload.provider) return false;
  if(Object.values(payload.transitionReceiptDigests).some(value=>!SHA256.test(value))) return false;
  const fingerprint=runtimeEvidencePublicKeyFingerprint(publicKeyPem);
  if(!fingerprint||attestation.publicKeyFingerprint!==fingerprint) return false;
  const signature=text(attestation.signatureBase64,4096);
  if(!signature) return false;
  try{
    return crypto.verify(null,Buffer.from(JSON.stringify(payload)),crypto.createPublicKey(publicKeyPem),Buffer.from(signature,'base64'));
  }catch{return false;}
}
