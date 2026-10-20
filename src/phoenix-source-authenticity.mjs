import {createHash} from 'node:crypto';
import {ZERO_EXTERNAL_EFFECTS} from './effect-ledgers.mjs';

export const PHOENIX_SOURCE_AUTHENTICITY_VERSION='phoenix.source-authenticity.v1';
const digest=v=>'sha256:'+createHash('sha256').update(Buffer.from(v,'utf8')).digest('hex');
const envelope=extra=>({
  externalEffectAuthority:'NONE',businessEffectAuthority:'NONE',
  externalEffectLedger:structuredClone(ZERO_EXTERNAL_EFFECTS),...extra
});
const refuse=(reason,meta={})=>envelope({ok:false,status:'SOURCE_AUTHENTICITY_REFUSED',reason,...meta});

export function verifyPinnedSourceText({sourceText,expectedSha256,sourceRef}={}){
  if(typeof sourceText!=='string'||Buffer.byteLength(sourceText,'utf8')>1024*1024
    ||typeof expectedSha256!=='string'||!/^sha256:[a-f0-9]{64}$/.test(expectedSha256)
    ||typeof sourceRef!=='string'||sourceRef.length<3||sourceRef.length>500)
    return refuse('BOUNDED_TEXT_EXPECTED_DIGEST_AND_SOURCE_POINTER_REQUIRED');
  const observedDigest=digest(sourceText);
  if(observedDigest!==expectedSha256)
    return refuse('SOURCE_CONTENT_DIGEST_CHANGED',{
      expectedSha256,observedSha256:observedDigest,sourceRef
    });
  return envelope({ok:true,status:'PINNED_SOURCE_DIGEST_MATCHED',sourceRef,
    observedSha256:observedDigest,sourceProposalId:'phoenix-wave10-0001',
    sourceClass:'LOCAL_BYTE_IDENTITY_ONLY',
    truthBoundary:'PINNED_DIGEST_MUST_ORIGINATE_FROM_INDEPENDENT_PROVENANCE__HASH_MATCH_IS_NOT_EXTERNAL_AUTHENTICITY_OR_DEPLOYMENT_PROOF'});
}
