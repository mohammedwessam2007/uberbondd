import { normalizeComputeOffer } from './compute-sovereignty.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const SOVEREIGN_COMPUTE_CELL_FABRIC_VERSION='uberbond.sovereign-compute-cell-fabric.v1';
const TYPES=new Set(['COMPUTE','MODEL','BROWSER','STORAGE','EXECUTION']);
const DATA=new Set(['PUBLIC','INTERNAL_NON_SECRET','SOURCE_CODE','FOUNDER_PRIVATE']);
const zero=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
const text=(v,m=1000)=>{const s=String(v??'').trim();return s&&s.length<=m?s:null;};
const finite=(v,a=0,b=1)=>{const n=Number(v);return Number.isFinite(n)&&n>=a&&n<=b?n:null;};
const integer=(v,a=0,b=1e9)=>{const n=Number(v);return Number.isSafeInteger(n)&&n>=a&&n<=b?n:null;};
const fail=(reasonCodes,extra={})=>({ok:false,status:'SOVEREIGN_CELL_FABRIC_BLOCKED',reasonCodes:[...new Set(reasonCodes)],businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero(),...extra});

export function normalizeResourceCell(raw={}){
  const resourceType=text(raw.resourceType,80)?.toUpperCase();
  if(!TYPES.has(resourceType))return fail(['recognized-resource-type-required']);
  const cellId=text(raw.cellId,160),provider=text(raw.provider,120)?.toLowerCase(),sourceRef=text(raw.sourceRef,1000),verifiedAt=text(raw.verifiedAt,100);
  const capabilityTags=[...new Set((Array.isArray(raw.capabilityTags)?raw.capabilityTags:[]).map(v=>text(v,120)?.toLowerCase()).filter(Boolean))];
  const allowedDataClasses=[...new Set((Array.isArray(raw.allowedDataClasses)?raw.allowedDataClasses:[]).map(v=>text(v,80)?.toUpperCase()).filter(v=>DATA.has(v)))];
  const availableUnits=integer(raw.availableUnits,1,1e12),costCents=integer(raw.costCents??0,0,1e9);
  const reliability=finite(raw.reliability),latencyScore=finite(raw.latencyScore),privacyScore=finite(raw.privacyScore),trustScore=finite(raw.trustScore),reversibilityScore=finite(raw.reversibilityScore);
  const reasons=[];
  if(!cellId||!provider||!sourceRef||!verifiedAt||!Number.isFinite(Date.parse(verifiedAt)))reasons.push('identity-provenance-time-required');
  if(!capabilityTags.length||!allowedDataClasses.length)reasons.push('capability-and-data-class-required');
  if([availableUnits,costCents,reliability,latencyScore,privacyScore,trustScore,reversibilityScore].some(v=>v==null))reasons.push('bounded-resource-metrics-required');
  let computeIdentity=null;
  if((resourceType==='MODEL'||resourceType==='COMPUTE')&&raw.computeOffer){
    const compute=normalizeComputeOffer(raw.computeOffer);if(!compute.ok)reasons.push('valid-compute-offer-required');else computeIdentity={offerId:compute.offerId,model:compute.model,revision:compute.revision,rightsClass:compute.rightsClass};
  }
  if(reasons.length)return fail(reasons);
  return {ok:true,status:'RESOURCE_CELL_ADMISSIBLE',cell:{cellId,resourceType,provider,sourceRef,verifiedAt:new Date(verifiedAt).toISOString(),capabilityTags,allowedDataClasses,availableUnits,costCents,reliability,latencyScore,privacyScore,trustScore,reversibilityScore,computeIdentity},businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero()};
}

/** Selects the minimum sufficient set of replaceable governed resource cells. */
export function allocateSovereignCells({requirements=[],cells=[],maxTotalCostCents=0}={}){
  if(!Array.isArray(requirements)||!requirements.length||requirements.length>64||!Array.isArray(cells)||!cells.length||cells.length>512)return fail(['bounded-requirements-and-cells-required']);
  const maxCost=integer(maxTotalCostCents,0,1e9);if(maxCost==null)return fail(['valid-cost-ceiling-required']);
  const normalized=cells.map(normalizeResourceCell);const admitted=normalized.filter(x=>x.ok).map(x=>x.cell);
  const allocations=[];const blocked=[];let spent=0;
  for(const [index,raw] of requirements.entries()){
    const resourceType=text(raw?.resourceType,80)?.toUpperCase(),dataClass=text(raw?.dataClass,80)?.toUpperCase();
    const tags=[...new Set((Array.isArray(raw?.requiredTags)?raw.requiredTags:[]).map(v=>text(v,120)?.toLowerCase()).filter(Boolean))];
    const units=integer(raw?.units??1,1,1e12),minReliability=finite(raw?.minimumReliability??0),minPrivacy=finite(raw?.minimumPrivacy??0),minTrust=finite(raw?.minimumTrust??0),minReversibility=finite(raw?.minimumReversibility??0);
    if(!TYPES.has(resourceType)||!DATA.has(dataClass)||!tags.length||[units,minReliability,minPrivacy,minTrust,minReversibility].some(v=>v==null)){blocked.push({index,reasonCodes:['valid-resource-requirement-required']});continue;}
    const eligible=admitted.filter(c=>c.resourceType===resourceType&&c.allowedDataClasses.includes(dataClass)&&tags.every(t=>c.capabilityTags.includes(t))&&c.availableUnits>=units&&c.reliability>=minReliability&&c.privacyScore>=minPrivacy&&c.trustScore>=minTrust&&c.reversibilityScore>=minReversibility)
      .map(c=>({cell:c,score:(c.reliability+c.latencyScore+c.privacyScore+c.trustScore+c.reversibilityScore)/5-(c.costCents/Math.max(1,c.availableUnits))/1000000}))
      .sort((a,b)=>b.score-a.score||a.cell.costCents-b.cell.costCents||a.cell.cellId.localeCompare(b.cell.cellId));
    const winner=eligible[0];
    if(!winner){blocked.push({index,resourceType,reasonCodes:['no-eligible-resource-cell']});continue;}
    const proportionalCost=Math.ceil(winner.cell.costCents*(units/winner.cell.availableUnits));
    if(spent+proportionalCost>maxCost){blocked.push({index,resourceType,reasonCodes:['cost-ceiling-would-be-exceeded']});continue;}
    spent+=proportionalCost;allocations.push({index,resourceType,cellId:winner.cell.cellId,provider:winner.cell.provider,units,estimatedCostCents:proportionalCost,sourceRef:winner.cell.sourceRef,computeIdentity:winner.cell.computeIdentity});
  }
  if(blocked.length)return fail(['resource-requirements-unfilled'],{allocations,blocked,totalEstimatedCostCents:spent});
  return {ok:true,status:'SOVEREIGN_CELL_FABRIC_ALLOCATED',allocations,totalEstimatedCostCents:spent,cellDiversity:new Set(allocations.map(a=>a.provider)).size,law:'RESOURCE_CELLS_ARE_REPLACEABLE_SUPPLIERS; ALLOCATION_NEVER_CREATES ACCOUNT_QUOTA_CREDENTIAL_SPEND_OR_EFFECT_AUTHORITY',businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero()};
}

export const SOVEREIGN_RESOURCE_CELL_TYPES=Object.freeze([...TYPES]);
