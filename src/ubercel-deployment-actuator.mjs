import crypto from 'node:crypto';
import { CANONICAL_EFFECT_KEYS, normalizeEffectLedger, unknownEffectLedger } from './effect-ledgers.mjs';

export const UBERCEL_DEPLOYMENT_ACTUATOR_VERSION='uberbond.ubercel-deployment-actuator.v1';
const SHA40=/^[0-9a-f]{40}$/;
const SHA256=/^sha256:[0-9a-f]{64}$/;
const ROLES=new Set(['FOUNDER','AUTHORIZED_PROMOTER']);
const text=(v,m=1000)=>{const s=String(v??'').trim();return s&&s.length<=m?s:null;};
const digest=v=>`sha256:${crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex')}`;
const zero=()=>Object.fromEntries(CANONICAL_EFFECT_KEYS.map(k=>[k,0]));
const addLedgers=(a,b)=>Object.fromEntries(CANONICAL_EFFECT_KEYS.map(k=>[k,(a[k]||0)+(b[k]||0)]));
const fail=(reasonCodes,extra={})=>({ok:false,status:'UBERCEL_DEPLOYMENT_EXECUTION_REFUSED',reasonCodes:[...new Set(reasonCodes.filter(Boolean))],businessEffectAuthority:'NONE',deploymentAuthority:'NONE',externalEffectLedger:zero(),...extra});

function validateAuthorization(raw={},planResult,nowMs){
  const reasons=[];
  const authorizationId=text(raw.authorizationId,240);
  const evidenceRef=text(raw.evidenceRef,1000);
  const approvedByRole=text(raw.approvedByRole,80)?.toUpperCase();
  const sourceCommit=text(raw.sourceCommit,40)?.toLowerCase();
  const planDigest=text(raw.planDigest,80)?.toLowerCase();
  const target=text(raw.target,80)?.toUpperCase();
  const approvedAt=text(raw.approvedAt,100),expiresAt=text(raw.expiresAt,100);
  const adapterIds=[...new Set((Array.isArray(raw.adapterIds)?raw.adapterIds:[]).map(v=>text(v,120)?.toLowerCase()).filter(Boolean))];
  if(!authorizationId||!evidenceRef||!ROLES.has(approvedByRole))reasons.push('explicit-promoter-identity-and-evidence-required');
  if(!SHA40.test(sourceCommit||'')||sourceCommit!==planResult?.plan?.release?.sourceCommit)reasons.push('authorization-source-commit-mismatch');
  if(!SHA256.test(planDigest||'')||planDigest!==planResult?.planDigest)reasons.push('authorization-plan-digest-mismatch');
  if(!target||target!==planResult?.plan?.target)reasons.push('authorization-target-mismatch');
  if(raw.deploymentAuthority!=='EXPLICIT_ONE_SHOT'||raw.oneShot!==true)reasons.push('one-shot-deployment-authority-required');
  const approvedMs=Date.parse(approvedAt||''),expiresMs=Date.parse(expiresAt||'');
  if(!Number.isFinite(approvedMs)||!Number.isFinite(expiresMs)||approvedMs>nowMs||expiresMs<nowMs||expiresMs<=approvedMs)reasons.push('current-bounded-authorization-window-required');
  if(!adapterIds.length)reasons.push('authorized-adapter-set-required');
  return reasons.length?{ok:false,reasonCodes:reasons}:{ok:true,authorization:{authorizationId,evidenceRef,approvedByRole,sourceCommit,planDigest,target,approvedAt:new Date(approvedMs).toISOString(),expiresAt:new Date(expiresMs).toISOString(),adapterIds,deploymentAuthority:'EXPLICIT_ONE_SHOT',oneShot:true}};
}

function validatePlan(planResult){
  if(!planResult?.ok||planResult.status!=='UBERCEL_DEPLOYMENT_PLAN_READY'||!planResult.plan||!SHA256.test(String(planResult.planDigest||'')))return ['valid-ubercel-deployment-plan-required'];
  if(digest(planResult.plan)!==planResult.planDigest)return ['ubercel-plan-digest-mismatch'];
  if(!SHA40.test(String(planResult.plan.release?.sourceCommit||'')))return ['exact-release-source-required'];
  return [];
}

/**
 * Executes an already-compiled Ubercel plan through registered replaceable adapters.
 * Authority is consumed exactly once through the supplied durable claimant. The
 * actuator owns policy; adapters receive only the binding they are allowed to run.
 */
export async function executeUbercelDeployment({deploymentPlan,authorization,claimAuthorization,adapterExecutors={},now=new Date()}={}){
  const planReasons=validatePlan(deploymentPlan);
  if(planReasons.length)return fail(planReasons);
  const nowMs=now instanceof Date?now.getTime():Date.parse(String(now));
  if(!Number.isFinite(nowMs))return fail(['valid-observation-time-required']);
  const auth=validateAuthorization(authorization,deploymentPlan,nowMs);
  if(!auth.ok)return fail(auth.reasonCodes);
  if(typeof claimAuthorization!=='function')return fail(['durable-authorization-claimant-required']);

  const primaryBindings=(deploymentPlan.plan.adapterBindings||[]).filter(binding=>binding.role==='primary');
  if(!primaryBindings.length)return fail(['primary-adapter-binding-required']);
  const authorizedSet=new Set(auth.authorization.adapterIds);
  const missingAuthorization=primaryBindings.filter(b=>!authorizedSet.has(String(b.adapterId||'').toLowerCase()));
  if(missingAuthorization.length)return fail(['primary-adapter-not-authorized'],{missingAuthorization});

  const executors=[];
  for(const binding of primaryBindings){
    const executor=adapterExecutors?.[binding.adapterId];
    if(!executor||typeof executor.executeDeployment!=='function')return fail(['registered-adapter-executor-required'],{adapterId:binding.adapterId});
    if(String(executor.adapterId||'').toLowerCase()!==String(binding.adapterId||'').toLowerCase()||String(executor.provider||'').toLowerCase()!==String(binding.provider||'').toLowerCase())return fail(['adapter-executor-identity-mismatch'],{adapterId:binding.adapterId});
    executors.push({binding,executor});
  }

  const claim=await claimAuthorization({authorizationId:auth.authorization.authorizationId,planDigest:deploymentPlan.planDigest,sourceCommit:deploymentPlan.plan.release.sourceCommit});
  if(!claim?.ok||!text(claim.claimRef,1000))return fail(['deployment-authorization-already-used-or-unclaimable']);

  let aggregate=zero();
  const receipts=[];
  for(const {binding,executor} of executors){
    let observed;
    try{
      observed=await executor.executeDeployment(Object.freeze({serviceId:deploymentPlan.plan.serviceId,target:deploymentPlan.plan.target,release:structuredClone(deploymentPlan.plan.release),binding:structuredClone(binding),healthContract:structuredClone(deploymentPlan.plan.healthContract),rollbackContract:structuredClone(deploymentPlan.plan.rollbackContract),authorizationId:auth.authorization.authorizationId,claimRef:claim.claimRef}));
    }catch(error){
      return {ok:false,status:'UBERCEL_DEPLOYMENT_EXECUTION_UNCERTAIN',reasonCodes:['adapter-execution-threw-after-authorization-claim'],adapterId:binding.adapterId,errorClass:error?.name||'Error',businessEffectAuthority:'NONE',deploymentAuthority:'CONSUMED',externalEffectLedger:unknownEffectLedger(['providerCalls','deployments','productionMutations'])};
    }
    const normalized=normalizeEffectLedger('externalEffectLedger',observed?.externalEffectLedger);
    if(!observed?.ok||observed.status!=='ADAPTER_DEPLOYMENT_OBSERVED'||!normalized.ok)return {ok:false,status:'UBERCEL_DEPLOYMENT_EXECUTION_UNCERTAIN',reasonCodes:['canonical-adapter-deployment-receipt-required'],adapterId:binding.adapterId,businessEffectAuthority:'NONE',deploymentAuthority:'CONSUMED',externalEffectLedger:unknownEffectLedger(['providerCalls','deployments','productionMutations'])};
    if(String(observed.sourceCommit||'').toLowerCase()!==deploymentPlan.plan.release.sourceCommit||!text(observed.deploymentRef,1000)||!text(observed.healthEvidenceRef,1000)||!text(observed.rollbackEvidenceRef,1000))return {ok:false,status:'UBERCEL_DEPLOYMENT_EXECUTION_UNCERTAIN',reasonCodes:['exact-source-health-and-rollback-evidence-required'],adapterId:binding.adapterId,businessEffectAuthority:'NONE',deploymentAuthority:'CONSUMED',externalEffectLedger:unknownEffectLedger(['providerCalls','deployments','productionMutations'])};
    aggregate=addLedgers(aggregate,normalized.ledger);
    receipts.push({adapterId:binding.adapterId,provider:binding.provider,cellId:binding.cellId,deploymentRef:observed.deploymentRef,healthEvidenceRef:observed.healthEvidenceRef,rollbackEvidenceRef:observed.rollbackEvidenceRef,sourceCommit:observed.sourceCommit,effectLedger:normalized.ledger});
  }

  const receipt={schemaVersion:UBERCEL_DEPLOYMENT_ACTUATOR_VERSION,serviceId:deploymentPlan.plan.serviceId,target:deploymentPlan.plan.target,sourceCommit:deploymentPlan.plan.release.sourceCommit,planDigest:deploymentPlan.planDigest,authorizationId:auth.authorization.authorizationId,authorizationEvidenceRef:auth.authorization.evidenceRef,claimRef:claim.claimRef,adapterReceipts:receipts,businessEffectAuthority:'NONE',deploymentAuthority:'CONSUMED',externalEffectLedger:aggregate,truthBoundary:'Observed deployment effects belong to Ubercel-authorized adapter executions only. Providers remain replaceable resource cells and gain no identity, policy, signing, or deployment authority.'};
  return {ok:true,status:'UBERCEL_DEPLOYMENT_EXECUTED',receipt,receiptDigest:digest(receipt),businessEffectAuthority:'NONE',deploymentAuthority:'CONSUMED',externalEffectLedger:aggregate};
}
