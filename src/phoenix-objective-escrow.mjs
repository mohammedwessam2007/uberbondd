import { createHash, createPublicKey, verify } from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const PHOENIX_OBJECTIVE_ESCROW_VERSION='phoenix.objective-escrow.v1';
export const PHOENIX_OBJECTIVE_SIGNATURE_VERSION='phoenix.objective-escrow.signature.v1';
const SHA=/^sha256:[a-f0-9]{64}$/;
const MAX_BYTES=1024*1024;
const digest=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
const envelope=extra=>({
  externalEffectAuthority:'NONE',businessEffectAuthority:'NONE',
  externalEffectLedger:structuredClone(ZERO_EXTERNAL_EFFECTS),...extra
});
const reject=(reason,meta={})=>envelope({
  ok:false,status:'OBJECTIVE_ESCROW_REFUSED',decision:'DENY',reason,...meta
});

// Signing is deliberately OUTSIDE this verifier. A caller cannot mint a trusted
// signature by providing the signing private key in a ChatGPT message.
// The verifier consumes a public key from a separately trusted runtime.
export function objectiveEscrowSignaturePayload(objectiveDigest){
  if(typeof objectiveDigest!=='string'||!SHA.test(objectiveDigest))return null;
  return {
    version:PHOENIX_OBJECTIVE_SIGNATURE_VERSION,
    objectiveDigest,
    scope:'IMMUTABLE_EVALUATOR_DEFINITION'
  };
}

export function objectiveEscrowPublicKeyFingerprint(publicKeyPem){
  try{
    const key=createPublicKey(publicKeyPem);
    if(key.asymmetricKeyType!=='ed25519')return null;
    const der=key.export({format:'der',type:'spki'});
    return digest(der);
  }catch{return null;}
}

// A successful check proves only:
// 1) objective text is byte-identical to independently signed baseline;
// 2) the signature matches an independently expected trusted key fingerprint.
// It DOES NOT prove that the supplied fingerprint was independently trusted.
export function verifyObjectiveEscrow({
  originalObjectiveText,currentObjectiveText,
  attestation,verifierPublicKeyPem,trustedVerifierFingerprint
}={}){
  if(typeof originalObjectiveText!=='string'||typeof currentObjectiveText!=='string'
    ||Buffer.byteLength(originalObjectiveText,'utf8')>MAX_BYTES
    ||Buffer.byteLength(currentObjectiveText,'utf8')>MAX_BYTES)
    return reject('BOUNDED_ORIGINAL_AND_CURRENT_OBJECTIVE_TEXT_REQUIRED');
  if(!SHA.test(String(trustedVerifierFingerprint||'')))
    return reject('INDEPENDENT_TRUST_ANCHOR_FINGERPRINT_REQUIRED');
  const fingerprint=objectiveEscrowPublicKeyFingerprint(verifierPublicKeyPem);
  if(!fingerprint||fingerprint!==trustedVerifierFingerprint)
    return reject('VERIFIER_KEY_NOT_PINNED_TO_TRUST_ANCHOR');
  const observedOriginalDigest=digest(Buffer.from(originalObjectiveText,'utf8'));
  const observedCurrentDigest=digest(Buffer.from(currentObjectiveText,'utf8'));
  if(!attestation||attestation.version!==PHOENIX_OBJECTIVE_SIGNATURE_VERSION
    ||attestation.objectiveDigest!==observedOriginalDigest
    ||attestation.publicKeyFingerprint!==fingerprint
    ||typeof attestation.signatureBase64!=='string'
    ||!/^[-a-zA-Z0-9+/=]{20,512}$/.test(attestation.signatureBase64))
    return reject('SIGNED_OBJECTIVE_BASELINE_MISSING_OR_MISMATCHED');
  const payload=objectiveEscrowSignaturePayload(observedOriginalDigest);
  let signatureValid=false;
  try {
    signatureValid=verify(null,Buffer.from(JSON.stringify(payload)),createPublicKey(verifierPublicKeyPem),
      Buffer.from(attestation.signatureBase64,'base64'));
  } catch {signatureValid=false;}
  if(!signatureValid)return reject('OBJECTIVE_SIGNATURE_INVALID');
  if(observedCurrentDigest!==observedOriginalDigest)
    return reject('EVALUATION_OBJECTIVE_MUTATED',{
      signedOriginalDigest:observedOriginalDigest,
      observedCurrentDigest,
      signerFingerprint:fingerprint
    });
  return envelope({ok:true,status:'OBJECTIVE_ESCROW_INTACT',decision:'LOCAL_OBJECTIVE_CHECK_PASSED',
    originalObjectiveDigest:observedOriginalDigest,
    currentObjectiveDigest:observedCurrentDigest,
    verifierFingerprint:fingerprint,signatureVerified:true,byteIdentityVerified:true,
    acceptanceLink:{proposalId:'phoenix-wave6-0001',wave:6,
      truthClass:'SOFTWARE_VERIFIED_LOCAL_CRYPTOGRAPHIC_GUARD_NOT_REMOTE_OR_DEPLOYMENT_PROOF'},
    truthBoundary:'PINNED_SIGNER_AND_BYTE_IDENTICAL_OBJECTIVE_ONLY__TRUST_ANCHOR_MUST_BE_INDEPENDENTLY_CONTROLLED'});
}
