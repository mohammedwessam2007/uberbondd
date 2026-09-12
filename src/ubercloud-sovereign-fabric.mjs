import crypto from 'node:crypto';
import { allocateSovereignCells, normalizeResourceCell } from './sovereign-compute-cell-fabric.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const UBERCLOUD_SOVEREIGN_FABRIC_VERSION='uberbond.ubercloud-sovereign-fabric.v1.1';
const STATEFUL=new Set(['STORAGE','DATABASE','QUEUE']);
const PRIVATE_NETWORKS=new Set(['UBERMESH','LOCAL_ONLY']);
const zero=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
const text=(v,m=1000)=>{const s=String(v??'').trim();return s&&s.length<=m?s:null;};
const integer=(v,a=0,b=1e12)=>{const n=Number(v);return Number.isSafeInteger(n)&&n>=a&&n<=b?n:null;};
const finite=(v,a=0,b=1)=>{const n=Number(v);return Number.isFinite(n)&&n>=a&&n<=b?n:null;};
const digest=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const fail=(reasonCodes,extra={})=>({ok:false,status:'UBERCLOUD_SOVEREIGNTY_BLOCKED',reasonCodes:[...new Set(reasonCodes.filter(Boolean))],businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero(),...extra});

function meshEvidence(meshReceipt={}){
  const transport=text(meshReceipt.transport,80)?.toUpperCase();
  const evidenceRef=text(meshReceipt.evidenceRef,1000);
  return {
    ok:meshReceipt.providerIndependent===true&&transport==='WIREGUARD'&&Boolean(evidenceRef),
    transport,
    evidenceRef,
    providerIndependent:meshReceipt.providerIndependent===true
  };
}

function failureDomainEvidence(raw={}){
  const failureDomain=text(raw.failureDomain,160)?.toLowerCase();
  const evidenceRef=text(raw.failureDomainEvidenceRef,1000);
  return {ok:Boolean(failureDomain&&evidenceRef),failureDomain,evidenceRef};
}

function normalizeRequirement(raw={},index=0){
  const resourceType=text(raw.resourceType,80)?.toUpperCase();
  const dataClass=text(raw.dataClass,80)?.toUpperCase();
  const requiredTags=[...new Set((Array.isArray(raw.requiredTags)?raw.requiredTags:[]).map(v=>text(v,120)?.toLowerCase()).filter(Boolean))];
  const units=integer(raw.units??1,1,1e12);
  const minimumReliability=finite(raw.minimumReliability??0);
  const minimumPrivacy=finite(raw.minimumPrivacy??0);
  const minimumTrust=finite(raw.minimumTrust??0);
  const minimumReversibility=finite(raw.minimumReversibility??0);
  const stateful=STATEFUL.has(resourceType);
  const requirementId=text(raw.requirementId,160)||`requirement-${index}`;
  return {requirementId,resourceType,dataClass,requiredTags,units,minimumReliability,minimumPrivacy,minimumTrust,minimumReversibility,stateful};
}

function eligibleFor(req,cell){
  if(!cell||cell.resourceType!==req.resourceType||!cell.allowedDataClasses.includes(req.dataClass))return false;
  if(!req.requiredTags.every(tag=>cell.capabilityTags.includes(tag)))return false;
  if(cell.availableUnits<req.units||cell.reliability<req.minimumReliability||cell.privacyScore<req.minimumPrivacy||cell.trustScore<req.minimumTrust||cell.reversibilityScore<req.minimumReversibility)return false;
  if(req.stateful&&!cell.sovereignty?.statePortable)return false;
  if(req.dataClass==='FOUNDER_PRIVATE'){
    if(!PRIVATE_NETWORKS.has(cell.sovereignty?.networkMode))return false;
    if(cell.sovereignty?.credentialCustody==='PROVIDER_MANAGED')return false;
  }
  return true;
}

/**
 * UberCloud is a sovereign placement and evacuation control plane, not a new
 * hyperscaler. It treats physical/cloud suppliers as replaceable resource cells
 * while keeping policy, identity, authority and portability above them.
 */
export function compileUberCloudPlan({
  serviceId,
  requirements=[],
  cells=[],
  meshReceipt={},
  maxTotalCostCents=0,
  requireIndependentFallback=true
}={}){
  const id=text(serviceId,160);
  if(!id)return fail(['service-id-required']);
  if(!Array.isArray(requirements)||!requirements.length||requirements.length>64)return fail(['bounded-requirements-required']);
  if(!Array.isArray(cells)||!cells.length||cells.length>512)return fail(['bounded-resource-cells-required']);
  const mesh=meshEvidence(meshReceipt);
  if(!mesh.ok)return fail(['provider-independent-ubermesh-evidence-required'],{mesh});

  const normalizedCells=cells.map(normalizeResourceCell);
  const rejectedCells=normalizedCells.filter(result=>!result.ok).map(result=>result.reasonCodes||[]);
  const admitted=normalizedCells.filter(result=>result.ok).map(result=>result.cell);
  if(!admitted.length)return fail(['no-admissible-resource-cells'],{rejectedCells});
  const rawById=new Map(cells.map(raw=>[text(raw?.cellId,160),raw]).filter(([id])=>Boolean(id)));
  const failureById=new Map(admitted.map(cell=>[cell.cellId,failureDomainEvidence(rawById.get(cell.cellId)||{})]));

  const normalizedRequirements=requirements.map(normalizeRequirement);
  if(normalizedRequirements.some(req=>!req.resourceType||!req.dataClass||!req.requiredTags.length||[req.units,req.minimumReliability,req.minimumPrivacy,req.minimumTrust,req.minimumReversibility].some(v=>v==null))){
    return fail(['valid-resource-requirements-required']);
  }

  const primary=allocateSovereignCells({requirements,maxTotalCostCents,cells});
  if(!primary.ok)return fail(['primary-placement-unavailable'],{primary});

  const byId=new Map(admitted.map(cell=>[cell.cellId,cell]));
  const placements=[];
  const blocked=[];
  for(const allocation of primary.allocations){
    const req=normalizedRequirements[allocation.index];
    const primaryCell=byId.get(allocation.cellId);
    if(!primaryCell){blocked.push({requirementId:req.requirementId,reasonCodes:['primary-cell-missing-after-normalization']});continue;}
    if(req.stateful&&!primaryCell.sovereignty.statePortable){blocked.push({requirementId:req.requirementId,reasonCodes:['primary-state-not-portable']});continue;}
    const primaryFailure=failureById.get(primaryCell.cellId)||{ok:false};
    if(requireIndependentFallback&&!primaryFailure.ok){blocked.push({requirementId:req.requirementId,primaryProvider:primaryCell.provider,reasonCodes:['primary-failure-domain-evidence-required']});continue;}

    const fallbacks=admitted
      .filter(cell=>{
        if(cell.cellId===primaryCell.cellId||cell.provider===primaryCell.provider||!eligibleFor(req,cell))return false;
        const failure=failureById.get(cell.cellId);
        return Boolean(failure?.ok&&failure.failureDomain!==primaryFailure.failureDomain);
      })
      .sort((a,b)=>b.reliability-a.reliability||b.reversibilityScore-a.reversibilityScore||a.costCents-b.costCents||a.cellId.localeCompare(b.cellId));
    const fallback=fallbacks[0]||null;
    if(requireIndependentFallback&&!fallback){blocked.push({requirementId:req.requirementId,primaryProvider:primaryCell.provider,primaryFailureDomain:primaryFailure.failureDomain||null,reasonCodes:['distinct-provider-and-failure-domain-fallback-required']});continue;}
    const fallbackFailure=fallback?failureById.get(fallback.cellId):null;

    placements.push({
      requirementId:req.requirementId,
      resourceType:req.resourceType,
      dataClass:req.dataClass,
      units:req.units,
      primary:{cellId:primaryCell.cellId,provider:primaryCell.provider,failureDomain:primaryFailure.failureDomain,failureDomainEvidenceRef:primaryFailure.evidenceRef,sourceRef:primaryCell.sourceRef,sovereignty:primaryCell.sovereignty},
      fallback:fallback?{cellId:fallback.cellId,provider:fallback.provider,failureDomain:fallbackFailure.failureDomain,failureDomainEvidenceRef:fallbackFailure.evidenceRef,sourceRef:fallback.sourceRef,sovereignty:fallback.sovereignty}:null
    });
  }
  if(blocked.length)return fail(['independence-constraints-unmet'],{placements,blocked,rejectedCells,mesh});

  const providers=[...new Set(placements.flatMap(p=>[p.primary.provider,p.fallback?.provider]).filter(Boolean))];
  const failureDomains=[...new Set(placements.flatMap(p=>[p.primary.failureDomain,p.fallback?.failureDomain]).filter(Boolean))];
  const plan={
    schemaVersion:'uberbond.ubercloud-plan.v1.1',
    serviceId:id,
    mesh,
    placements,
    providers,
    providerDiversity:providers.length,
    failureDomains,
    failureDomainDiversity:failureDomains.length,
    controlPlaneAuthority:'OWNER_ONLY',
    identityRoot:'UBERBOND_SOVEREIGN_CORE',
    policyRoot:'UBERBOND_SOVEREIGN_CORE',
    stateLaw:'STATEFUL_CELLS_REQUIRE_OPEN_EXPORT_AND_RESTORE_EVIDENCE_BEFORE_SOVEREIGN_PLACEMENT',
    networkLaw:'PRIVATE_OR_SOVEREIGN_TRAFFIC_USES_UBERMESH_OR_LOCAL_ONLY_TRANSPORT; PROVIDER_NETWORKING_IS_NOT_THE_ROOT_OF_TRUST',
    supplierLaw:'A SOVEREIGN FALLBACK REQUIRES BOTH A DISTINCT PROVIDER AND A DISTINCT EVIDENCED FAILURE DOMAIN; PROVIDER LABELS ALONE NEVER PROVE INDEPENDENCE',
    businessEffectAuthority:'NONE',
    externalEffectAuthority:'NONE'
  };
  return {ok:true,status:'SOVEREIGN_UBERCLOUD_PLAN_READY',plan,planDigest:digest(plan),businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero()};
}

/** Produces a bounded failover plan only. It never calls a provider or spends. */
export function compileUberCloudEvacuation({planResult,failedProviders=[],failedFailureDomains=[]}={}){
  if(!planResult?.ok||!planResult.plan||!planResult.planDigest)return fail(['valid-ubercloud-plan-required']);
  if(digest(planResult.plan)!==planResult.planDigest)return fail(['ubercloud-plan-digest-mismatch']);
  const failed=new Set((Array.isArray(failedProviders)?failedProviders:[]).map(v=>text(v,120)?.toLowerCase()).filter(Boolean));
  const failedDomains=new Set((Array.isArray(failedFailureDomains)?failedFailureDomains:[]).map(v=>text(v,160)?.toLowerCase()).filter(Boolean));
  if(!failed.size&&!failedDomains.size)return fail(['failed-provider-or-failure-domain-set-required']);
  const moves=[];const blocked=[];
  for(const placement of planResult.plan.placements||[]){
    const primaryFailed=failed.has(String(placement.primary?.provider||'').toLowerCase())||failedDomains.has(String(placement.primary?.failureDomain||'').toLowerCase());
    if(!primaryFailed)continue;
    const fallback=placement.fallback;
    const fallbackFailed=!fallback||failed.has(String(fallback.provider||'').toLowerCase())||failedDomains.has(String(fallback.failureDomain||'').toLowerCase());
    if(fallbackFailed){blocked.push({requirementId:placement.requirementId,reasonCodes:['no-surviving-distinct-provider-and-failure-domain-fallback']});continue;}
    moves.push({requirementId:placement.requirementId,from:placement.primary,to:fallback,action:'PROPOSE_FAILOVER_ONLY'});
  }
  if(blocked.length)return fail(['evacuation-path-incomplete'],{moves,blocked});
  return {ok:true,status:'UBERCLOUD_EVACUATION_PLAN_READY',moves,failedProviders:[...failed],failedFailureDomains:[...failedDomains],law:'FAILOVER PLAN DOES NOT CREATE PROVIDER, CREDENTIAL, DEPLOYMENT, SPEND OR DATA-MOVEMENT AUTHORITY',businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero()};
}
