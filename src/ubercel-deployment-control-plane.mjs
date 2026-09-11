import crypto from 'node:crypto';
import { compileUberCloudPlan, compileUberCloudEvacuation } from './ubercloud-sovereign-fabric.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const UBERCEL_CONTROL_PLANE_VERSION='uberbond.ubercel-deployment-control-plane.v1.1';
const SHA40=/^[0-9a-f]{40}$/;
const SHA256=/^sha256:[0-9a-f]{64}$/;
const TARGETS=new Set(['PREVIEW','STAGING','PRODUCTION','SOVEREIGN']);
const ADAPTERS=new Set(['OWNED_LINUX','GENERIC_DOCKER','VERCEL','ORACLE_CLOUD','OTHER_REPLACEABLE']);
const zero=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
const text=(v,m=1000)=>{const s=String(v??'').trim();return s&&s.length<=m?s:null;};
const integer=(v,a=0,b=1e12)=>{const n=Number(v);return Number.isSafeInteger(n)&&n>=a&&n<=b?n:null;};
const digest=v=>`sha256:${crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex')}`;
const fail=(reasonCodes,extra={})=>({ok:false,status:'UBERCEL_CONTROL_PLANE_BLOCKED',reasonCodes:[...new Set(reasonCodes.filter(Boolean))],businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',deploymentAuthority:'NONE',externalEffectLedger:zero(),...extra});

function normalizeRelease(raw={}){
  const sourceCommit=text(raw.sourceCommit,40)?.toLowerCase();
  const imageDigest=text(raw.imageDigest,80)?.toLowerCase();
  const configDigest=text(raw.configDigest,80)?.toLowerCase();
  const artifactDigest=text(raw.artifactDigest,80)?.toLowerCase();
  const signatureRef=text(raw.signatureRef,1000);
  const signerIdentity=text(raw.signerIdentity,240);
  const signedAt=text(raw.signedAt,100);
  const reasons=[];
  if(!sourceCommit||!SHA40.test(sourceCommit))reasons.push('exact-source-commit-required');
  for(const [name,value] of [['image',imageDigest],['config',configDigest],['artifact',artifactDigest]])if(!value||!SHA256.test(value))reasons.push(`${name}-sha256-required`);
  if(!signatureRef||!signerIdentity||!signedAt||!Number.isFinite(Date.parse(signedAt)))reasons.push('signed-release-provenance-required');
  if(raw.signatureVerified!==true)reasons.push('offline-signature-verification-required');
  if(reasons.length)return {ok:false,reasonCodes:reasons};
  return {ok:true,release:{sourceCommit,imageDigest,configDigest,artifactDigest,signatureRef,signerIdentity,signedAt:new Date(signedAt).toISOString()}};
}

function normalizeAdapter(raw={}){
  const adapterId=text(raw.adapterId,120)?.toLowerCase();
  const adapterType=text(raw.adapterType,80)?.toUpperCase();
  const provider=text(raw.provider,120)?.toLowerCase();
  const sourceRef=text(raw.sourceRef,1000);
  const verifiedAt=text(raw.verifiedAt,100);
  const capabilityTags=[...new Set((Array.isArray(raw.capabilityTags)?raw.capabilityTags:[]).map(v=>text(v,120)?.toLowerCase()).filter(Boolean))];
  const reasons=[];
  if(!adapterId||!ADAPTERS.has(adapterType)||!provider)reasons.push('adapter-identity-required');
  if(!sourceRef||!verifiedAt||!Number.isFinite(Date.parse(verifiedAt)))reasons.push('adapter-provenance-required');
  if(!capabilityTags.length)reasons.push('adapter-capabilities-required');
  if(raw.deploymentAuthority===true)reasons.push('adapter-must-not-own-deployment-authority');
  if(raw.policyAuthority===true)reasons.push('adapter-must-not-own-policy-authority');
  if(reasons.length)return {ok:false,reasonCodes:reasons};
  return {ok:true,adapter:{adapterId,adapterType,provider,sourceRef,verifiedAt:new Date(verifiedAt).toISOString(),capabilityTags}};
}

/** Ubercel compiles a provider-neutral deployment plan. It does not deploy. */
export function compileUbercelDeployment({
  serviceId,target='PREVIEW',release={},adapters=[],cloudRequirements=[],resourceCells=[],meshReceipt={},maxTotalCostCents=0,healthContract={},rollbackContract={}
}={}){
  const id=text(serviceId,160);
  const normalizedTarget=text(target,80)?.toUpperCase();
  if(!id||!TARGETS.has(normalizedTarget))return fail(['valid-service-and-target-required']);
  const rel=normalizeRelease(release);
  if(!rel.ok)return fail(rel.reasonCodes);
  const normalizedAdapters=adapters.map(normalizeAdapter);
  const badAdapters=normalizedAdapters.filter(item=>!item.ok);
  if(badAdapters.length)return fail(['invalid-provider-adapter'],{adapterErrors:badAdapters.map(item=>item.reasonCodes)});
  const admittedAdapters=normalizedAdapters.map(item=>item.adapter);
  if(!admittedAdapters.length)return fail(['at-least-one-provider-adapter-required']);

  const cloud=compileUberCloudPlan({serviceId:id,requirements:cloudRequirements,cells:resourceCells,meshReceipt,maxTotalCostCents,requireIndependentFallback:true});
  if(!cloud.ok)return fail(['ubercloud-placement-required'],{uberCloud:cloud});

  const adapterByProvider=new Map(admittedAdapters.map(adapter=>[adapter.provider,adapter]));
  const adapterBindings=[];const bindingFailures=[];
  for(const placement of cloud.plan.placements){
    for(const role of ['primary','fallback']){
      const cell=placement[role];
      if(!cell)continue;
      const adapter=adapterByProvider.get(cell.provider);
      if(!adapter){bindingFailures.push({requirementId:placement.requirementId,role,provider:cell.provider,reasonCodes:['provider-adapter-required']});continue;}
      adapterBindings.push({requirementId:placement.requirementId,role,cellId:cell.cellId,provider:cell.provider,adapterId:adapter.adapterId,adapterType:adapter.adapterType});
    }
  }
  if(bindingFailures.length)return fail(['unbound-provider-cell'],{bindingFailures,uberCloud:cloud});

  const authenticatedHealthRef=text(healthContract.authenticatedHealthRef,1000);
  const expectedStatus=integer(healthContract.expectedStatus??200,100,599);
  const rollbackProcedureRef=text(rollbackContract.rollbackProcedureRef,1000);
  const rollbackEvidenceRequired=rollbackContract.independentRollbackEvidenceRequired===true;
  if(!authenticatedHealthRef||expectedStatus==null)return fail(['authenticated-health-contract-required']);
  if(!rollbackProcedureRef||!rollbackEvidenceRequired)return fail(['independent-rollback-contract-required']);

  const plan={
    schemaVersion:'uberbond.ubercel-deployment-plan.v1',
    serviceId:id,target:normalizedTarget,release:rel.release,
    uberCloudPlan:cloud.plan,uberCloudPlanDigest:cloud.planDigest,
    placements:cloud.plan.placements,adapterBindings,
    healthContract:{authenticatedHealthRef,expectedStatus},
    rollbackContract:{rollbackProcedureRef,independentRollbackEvidenceRequired:true},
    authority:{signing:'OFFLINE_SIGNER_ONLY',deployment:'EXPLICIT_PROMOTER_OR_FOUNDER_ONLY',policy:'UBERBOND_ONLY',providerAdapters:'NONE'},
    laws:['EXACT_SIGNED_RELEASE_ONLY','NO_PROVIDER_IS_THE_CONTROL_PLANE','PRODUCTION_PROMOTION_REQUIRES_INDEPENDENT_HEALTH_AND_ROLLBACK_EVIDENCE','PRIVATE_NETWORK_TRUST_ROOT_IS_UBERMESH_OR_LOCAL_ONLY','PROVIDER_LOSS_MUST_HAVE_A_DECLARED_DISTINCT_PROVIDER_EVACUATION_PATH'],
    businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',deploymentAuthority:'NONE'
  };
  return {ok:true,status:'UBERCEL_DEPLOYMENT_PLAN_READY',plan,planDigest:digest(plan),businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',deploymentAuthority:'NONE',externalEffectLedger:zero()};
}

/** Compiles outage response only. An authorized promoter/runtime executes it. */
export function compileUbercelFailover({deploymentPlan,failedProviders=[]}={}){
  if(!deploymentPlan?.ok||!deploymentPlan.plan||!deploymentPlan.planDigest)return fail(['valid-ubercel-deployment-plan-required']);
  if(digest(deploymentPlan.plan)!==deploymentPlan.planDigest)return fail(['ubercel-plan-digest-mismatch']);
  const embedded=deploymentPlan.plan.uberCloudPlan;
  if(!embedded)return fail(['embedded-ubercloud-plan-required-for-failover']);
  const evacuation=compileUberCloudEvacuation({planResult:{ok:true,plan:embedded,planDigest:deploymentPlan.plan.uberCloudPlanDigest},failedProviders});
  if(!evacuation.ok)return fail(['ubercloud-evacuation-refused'],{evacuation});
  return {ok:true,status:'UBERCEL_FAILOVER_PLAN_READY',moves:evacuation.moves,failedProviders:evacuation.failedProviders,release:deploymentPlan.plan.release,authority:'PROPOSAL_ONLY',businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',deploymentAuthority:'NONE',externalEffectLedger:zero()};
}

export const UBERCEL_ADAPTER_TYPES=Object.freeze([...ADAPTERS]);
