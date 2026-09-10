export const SOVEREIGN_BOOTSTRAP_READINESS_VERSION='uberbond.sovereign-bootstrap-readiness.v1.2';
export const OFFLINE_MODEL_STATUS='OFFLINE_LOCAL_MODEL_RUNTIME_INSTALLED_AND_LOOPBACK_ATTESTED';
const SHA40=/^[a-f0-9]{40}$/i;
const SHA64=/^[a-f0-9]{64}$/i;
const SAFE_RELEASE=/^release-[a-f0-9]{12}-[a-f0-9]{16}$/;

export const REQUIRED_SOURCE_CONTRACTS=Object.freeze([
  'authorctl','autonomyPulse','founderConsole','founderConsoleServer','authoringTimer',
  'workerPath','workerService','verifierPath','verifierService','promoterPath',
  'postPromotionPath','offlineModelInstaller','offlineSignerInstaller','releaseCourierInstaller'
]);
export const REQUIRED_AUTHORING_UNITS=Object.freeze([
  'authoringTimer','workerPath','verifierPath','promoterPath','postPromotionPath','founderConsole'
]);

const truth=value=>value===true;
const uniq=values=>[...new Set(values.filter(Boolean))];
function exactModelReceipt(receipt){
  return Boolean(receipt&&typeof receipt==='object'&&!Array.isArray(receipt)
    && receipt.status===OFFLINE_MODEL_STATUS
    && typeof receipt.modelId==='string'&&receipt.modelId.length>0
    && receipt.observedModelId===receipt.modelId
    && SHA64.test(String(receipt.binarySha256||''))
    && SHA64.test(String(receipt.modelSha256||''))
    && String(receipt.endpoint||'').startsWith('http://127.0.0.1:'));
}
function exactSignerReceipt(receipt,sourceCommit){
  if(!receipt||typeof receipt!=='object'||Array.isArray(receipt)||receipt.ok!==true)return false;
  const digest=String(receipt.requestDigest||'').toLowerCase();
  const source=String(receipt.sourceCommit||'').toLowerCase();
  const releaseName=String(receipt.releaseName||'');
  return receipt.status==='SIGNED_RELEASE_READY_IN_OFFLINE_OUTBOX'
    && SHA64.test(digest)
    && source===sourceCommit
    && SAFE_RELEASE.test(releaseName)
    && releaseName===`release-${sourceCommit.slice(0,12)}-${digest.slice(0,16)}`
    && receipt.signingAuthority==='SEPARATE_OFFLINE_SIGNER_ONLY'
    && receipt.deploymentAuthority==='NONE'
    && receipt.businessEffectAuthority==='NONE'
    && receipt.externalEffectAuthority==='NONE';
}
function exactCourierReceipt(receipt,releaseName){
  if(!receipt||typeof receipt!=='object'||Array.isArray(receipt)||receipt.ok!==true)return false;
  return ['SIGNED_RELEASE_COURIERED_TO_RUNTIME_INBOX','SOVEREIGN_RELEASE_PUBLICATION_RECOVERED_AFTER_COPY'].includes(receipt.status)
    && String(receipt.releaseName||'')===releaseName
    && receipt.signingAuthority==='NONE'
    && receipt.deploymentAuthority==='NONE'
    && receipt.businessEffectAuthority==='NONE'
    && receipt.externalEffectAuthority==='NONE';
}

export function compileSovereignBootstrapReadiness(input={}){
  const sourceCommit=String(input.sourceCommit||'').toLowerCase();
  const sourceContracts=input.sourceContracts&&typeof input.sourceContracts==='object'?input.sourceContracts:{};
  const services=input.services&&typeof input.services==='object'?input.services:{};
  const modelReceipt=input.modelReceipt&&typeof input.modelReceipt==='object'?input.modelReceipt:null;
  const signerReceipt=input.signerReceipt&&typeof input.signerReceipt==='object'?input.signerReceipt:null;
  const courierReceipt=input.courierReceipt&&typeof input.courierReceipt==='object'?input.courierReceipt:null;
  const runtimeReceipt=input.runtimeReceipt&&typeof input.runtimeReceipt==='object'?input.runtimeReceipt:null;
  const missingSourceContracts=REQUIRED_SOURCE_CONTRACTS.filter(id=>!truth(sourceContracts[id]));
  const inactiveAuthoringUnits=REQUIRED_AUTHORING_UNITS.filter(id=>!truth(services[id]));
  const sourceReady=SHA40.test(sourceCommit)&&input.cleanSource===true&&missingSourceContracts.length===0;
  const hostInstalled=sourceReady&&input.authoringConfigPresent===true&&input.configuredSourceRootMatches===true&&String(input.installedSourceCommit||'').toLowerCase()===sourceCommit;
  const hostControlReady=hostInstalled&&inactiveAuthoringUnits.length===0;
  const directFounderControlReady=hostControlReady&&input.founderConsoleReachable===true;
  const localModelAttested=exactModelReceipt(modelReceipt)&&truth(services.localModelRuntime)&&truth(services.localModelProxy);
  const localWorkerReady=hostControlReady&&localModelAttested&&input.isolatedWorkerEnabled===true;
  const dialogueReady=directFounderControlReady&&localModelAttested&&input.founderDialogueEnabled===true;
  const selfCompletionReady=localWorkerReady&&dialogueReady;
  const separateSignerObserved=sourceReady&&exactSignerReceipt(signerReceipt,sourceCommit);
  const signedReleaseCourierObserved=separateSignerObserved&&exactCourierReceipt(courierReceipt,signerReceipt.releaseName);
  const releasePathObserved=separateSignerObserved&&signedReleaseCourierObserved;
  const runtimeRehearsalObserved=Boolean(runtimeReceipt&&runtimeReceipt.ok===true&&runtimeReceipt.rehearsalObserved===true&&String(runtimeReceipt.sourceCommit||runtimeReceipt.commit||'').toLowerCase()===sourceCommit);

  const reasons=[];
  if(!SHA40.test(sourceCommit))reasons.push('exact-source-commit-required');
  if(input.cleanSource!==true)reasons.push('clean-source-checkout-required');
  if(missingSourceContracts.length)reasons.push('required-source-contracts-missing');
  if(sourceReady&&input.authoringConfigPresent===true&&input.configuredSourceRootMatches!==true)reasons.push('configured-authoring-source-root-mismatch');
  if(sourceReady&&!hostInstalled)reasons.push('sovereign-authoring-host-install-not-observed');
  if(hostInstalled&&inactiveAuthoringUnits.length)reasons.push('authoring-automation-units-not-active');
  if(hostControlReady&&!directFounderControlReady)reasons.push('founder-console-not-reachable');
  if(hostControlReady&&!localModelAttested)reasons.push('owner-controlled-local-model-not-attested');
  if(hostControlReady&&input.isolatedWorkerEnabled!==true)reasons.push('isolated-worker-not-enabled');
  if(directFounderControlReady&&input.founderDialogueEnabled!==true)reasons.push('founder-dialogue-not-enabled');
  if(selfCompletionReady&&!separateSignerObserved)reasons.push('separate-release-signer-not-observed');
  if(selfCompletionReady&&separateSignerObserved&&!signedReleaseCourierObserved)reasons.push('signed-release-courier-not-observed');
  if(selfCompletionReady&&!runtimeRehearsalObserved)reasons.push('owned-runtime-rehearsal-not-observed');

  let status='SOVEREIGN_BOOTSTRAP_SOURCE_INCOMPLETE';
  if(sourceReady)status='SOVEREIGN_SOURCE_STACK_COMPLETE__HOST_ACTIVATION_REQUIRED';
  if(hostControlReady)status='SOVEREIGN_HOST_CONTROL_READY__LOCAL_MODEL_OR_DIALOGUE_REQUIRED';
  if(selfCompletionReady)status='READY_TO_SELF_COMPLETE_LOCALLY__RELEASE_RUNTIME_PROOF_REMAINS';
  if(selfCompletionReady&&releasePathObserved)status='SELF_COMPLETION_AND_SIGNED_RELEASE_PATH_READY__RUNTIME_REHEARSAL_REQUIRED';
  if(selfCompletionReady&&releasePathObserved&&runtimeRehearsalObserved)status='SOVEREIGN_ENGINEERING_BOOTSTRAP_OBSERVED__EXTERNAL_REALITY_REMAINS';

  return{
    ok:sourceReady,
    schemaVersion:SOVEREIGN_BOOTSTRAP_READINESS_VERSION,
    status,
    sourceCommit:SHA40.test(sourceCommit)?sourceCommit:null,
    stages:{
      sourceStackComplete:sourceReady,
      authoringHostInstalled:hostInstalled,
      authoringAutomationActive:hostControlReady,
      directFounderControlReady,
      localModelAttested,
      isolatedWorkerReady:localWorkerReady,
      directFounderDialogueReady:dialogueReady,
      selfCompletionLoopReady:selfCompletionReady,
      separateReleaseSignerObserved:separateSignerObserved,
      signedReleaseCourierObserved,
      separateSignedReleasePathObserved:releasePathObserved,
      ownedRuntimeRehearsalObserved:runtimeRehearsalObserved
    },
    missing:{sourceContracts:missingSourceContracts,authoringUnits:inactiveAuthoringUnits},
    reasonCodes:uniq(reasons),
    dependencyBoundary:{
      requiresPhysicalCompute:true,
      requiresOperatingSystem:true,
      requiresPreparedDependencies:true,
      requiresOwnerSuppliedLocalModelArtifacts:!localModelAttested,
      githubRequiredForSelfCompletion:false,
      vercelRequiredForSelfCompletion:false,
      publicCloudModelRequiredForSelfCompletion:false
    },
    authority:{businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',releaseSigningAuthority:'SEPARATE',runtimeDeploymentAuthority:'SEPARATE'},
    truthBoundary:'READY_TO_SELF_COMPLETE_LOCALLY means the bounded local engineering loop is observed configured on this exact source root and commit. Signed-release readiness additionally requires source-bound signer and matching courier receipts. It does not prove runtime rehearsal, customer/payment outcomes, Personal Civilization outcomes, or ASI.'
  };
}
