export const SOVEREIGN_RUNTIME_GRADUATION_VERSION='uberbond.sovereign-runtime-graduation.v1';
export const SOVEREIGN_RUNTIME_REHEARSAL_STATUS='SOVEREIGN_OWNED_RUNTIME_REHEARSAL_OBSERVED';
const SHA40=/^[a-f0-9]{40}$/i;
const SHA64=/^[a-f0-9]{64}$/i;
const SAFE_RELEASE=/^release-([a-f0-9]{12})-([a-f0-9]{16})$/;
const APPLIED=/^APPLIED-(release-[a-f0-9]{12}-[a-f0-9]{16})-(\d{8}T\d{6}Z)$/;
const COURIER_STATUSES=new Set([
  'SIGNED_RELEASE_COURIERED_TO_RUNTIME_INBOX',
  'SOVEREIGN_RELEASE_ALREADY_PUBLISHED_TO_RUNTIME',
  'SOVEREIGN_RELEASE_ALREADY_APPLIED_BY_RUNTIME',
  'SOVEREIGN_RELEASE_PUBLICATION_RECOVERED_AFTER_COPY'
]);
const uniq=values=>[...new Set(values.filter(Boolean))];
const text=value=>String(value??'').trim();
const noneAuthority=(receipt,key)=>receipt?.[key]==='NONE';

export function exactOfflineSignerReceipt(receipt){
  if(!receipt||typeof receipt!=='object'||Array.isArray(receipt))return false;
  const releaseName=text(receipt.releaseName);const match=SAFE_RELEASE.exec(releaseName);
  const sourceCommit=text(receipt.sourceCommit).toLowerCase();const requestDigest=text(receipt.requestDigest).toLowerCase();
  return Boolean(receipt.ok===true
    && receipt.status==='SIGNED_RELEASE_READY_IN_OFFLINE_OUTBOX'
    && SHA40.test(sourceCommit)&&SHA64.test(requestDigest)&&match
    && match[1]===sourceCommit.slice(0,12)&&match[2]===requestDigest.slice(0,16)
    && receipt.signingAuthority==='SEPARATE_OFFLINE_SIGNER_ONLY'
    && noneAuthority(receipt,'deploymentAuthority')
    && noneAuthority(receipt,'businessEffectAuthority')
    && noneAuthority(receipt,'externalEffectAuthority'));
}

export function exactReleaseCourierReceipt(receipt,releaseName){
  if(!receipt||typeof receipt!=='object'||Array.isArray(receipt))return false;
  return Boolean(receipt.ok===true&&COURIER_STATUSES.has(text(receipt.status))
    && text(receipt.releaseName)===releaseName
    && noneAuthority(receipt,'signingAuthority')
    && noneAuthority(receipt,'deploymentAuthority')
    && noneAuthority(receipt,'businessEffectAuthority')
    && noneAuthority(receipt,'externalEffectAuthority'));
}

export function compileSovereignRuntimeGraduation(input={}){
  const reasons=[];
  const signer=input.signerReceipt;const signerValid=exactOfflineSignerReceipt(signer);
  if(!signerValid)reasons.push('exact-offline-signer-receipt-required');
  const releaseName=signerValid?text(signer.releaseName):'';
  const sourceCommit=signerValid?text(signer.sourceCommit).toLowerCase():'';
  const courierValid=signerValid&&exactReleaseCourierReceipt(input.courierReceipt,releaseName);
  if(!courierValid)reasons.push('correlated-release-courier-receipt-required');

  const markerName=text(input.appliedMarkerName);const markerContent=text(input.appliedMarkerContent);const marker=APPLIED.exec(markerName);
  if(!marker||marker[1]!==releaseName||markerContent!==releaseName)reasons.push('correlated-runtime-applied-marker-required');

  const releaseEnv=input.releaseEnv&&typeof input.releaseEnv==='object'?input.releaseEnv:{};
  const state=input.runtimeState&&typeof input.runtimeState==='object'?input.runtimeState:{};
  const releaseSource=text(releaseEnv.SOURCE_COMMIT).toLowerCase();
  const stateSource=text(state.CURRENT_SOURCE_COMMIT).toLowerCase();
  const releaseSequence=text(releaseEnv.RELEASE_SEQUENCE);const stateSequence=text(state.CURRENT_RELEASE_SEQUENCE);
  if(!SHA40.test(releaseSource)||releaseSource!==sourceCommit)reasons.push('signed-release-source-must-equal-signer-source');
  if(!SHA40.test(stateSource)||stateSource!==sourceCommit)reasons.push('runtime-state-source-must-equal-signer-source');
  if(!/^\d{14}$/.test(releaseSequence)||stateSequence!==releaseSequence)reasons.push('runtime-state-sequence-must-equal-signed-release-sequence');

  if(input.runtimeObserved!==true)reasons.push('owned-runtime-observation-required');
  if(input.reconciliationObserved!==true)reasons.push('independent-runtime-reconciliation-required');
  const containers=input.containers&&typeof input.containers==='object'?input.containers:{};
  if(containers.postgres?.running!==true||containers.postgres?.healthy!==true)reasons.push('healthy-postgres-runtime-required');
  if(containers.web?.running!==true||containers.web?.healthy!==true)reasons.push('healthy-web-runtime-required');
  if(containers.worker?.running!==true)reasons.push('running-worker-runtime-required');

  const ok=reasons.length===0;
  return{
    ok,
    schemaVersion:SOVEREIGN_RUNTIME_GRADUATION_VERSION,
    status:ok?SOVEREIGN_RUNTIME_REHEARSAL_STATUS:'SOVEREIGN_RUNTIME_GRADUATION_REFUSED',
    sourceCommit:SHA40.test(sourceCommit)?sourceCommit:null,
    releaseName:releaseName||null,
    releaseSequence:/^\d{14}$/.test(releaseSequence)?releaseSequence:null,
    rehearsalObserved:ok,
    separateSignerObserved:ok,
    releaseCourierObserved:ok,
    runtimeAppliedObserved:ok,
    reconciliationObserved:ok,
    reasonCodes:uniq(reasons),
    authority:{signingAuthority:'NONE',courierAuthority:'NONE',deploymentAuthority:'OBSERVATION_ONLY',businessEffectAuthority:'NONE',externalEffectAuthority:'NONE'},
    truthBoundary:'This receipt proves only a correlated owner-runtime observation of an already-signed, couriered and applied exact-source release plus independent reconciliation and healthy runtime processes. It does not create signing or deployment authority and does not prove customers, payment, retention, life outcomes, unrestricted autonomy, or ASI.'
  };
}

export function exactSovereignRuntimeGraduationReceipt(receipt,sourceCommit){
  const source=text(sourceCommit).toLowerCase();
  return Boolean(receipt&&typeof receipt==='object'&&!Array.isArray(receipt)
    && receipt.ok===true
    && receipt.schemaVersion===SOVEREIGN_RUNTIME_GRADUATION_VERSION
    && receipt.status===SOVEREIGN_RUNTIME_REHEARSAL_STATUS
    && receipt.rehearsalObserved===true
    && receipt.separateSignerObserved===true
    && receipt.releaseCourierObserved===true
    && receipt.runtimeAppliedObserved===true
    && receipt.reconciliationObserved===true
    && SHA40.test(source)&&text(receipt.sourceCommit).toLowerCase()===source
    && SAFE_RELEASE.test(text(receipt.releaseName))
    && /^\d{14}$/.test(text(receipt.releaseSequence)));
}
