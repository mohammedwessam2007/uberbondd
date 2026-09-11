import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const ECONOMIC_METABOLISM_VERSION='uberbond.economic-metabolism.v1';
const KINDS=new Set(['RESEARCH','COGNITION','SOFTWARE_MUTATION','PROVIDER_SPEND','EXPERIMENT','ATTENTION_INTERVENTION']);
const zero=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
const text=(v,m=1000)=>{const s=String(v??'').trim();return s&&s.length<=m?s:null;};
const finite=(v,a=0,b=1)=>{const n=Number(v);return Number.isFinite(n)&&n>=a&&n<=b?n:null;};
const integer=(v,a=0,b=1e9)=>{const n=Number(v);return Number.isSafeInteger(n)&&n>=a&&n<=b?n:null;};
const digest=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const fail=(reasonCodes,extra={})=>({ok:false,status:'ECONOMIC_METABOLISM_BLOCKED',reasonCodes:[...new Set(reasonCodes)],businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero(),...extra});

function normalizeCandidate(raw,index){
  const id=text(raw?.id,160),kind=text(raw?.kind,80)?.toUpperCase(),objective=text(raw?.objective,2000);
  const expectedValue=finite(raw?.expectedValue),founderImpact=finite(raw?.founderImpact),evidenceConfidence=finite(raw?.evidenceConfidence),reversibility=finite(raw?.reversibility);
  const costCents=integer(raw?.costCents??0,0,1e9),founderMinutes=finite(raw?.founderMinutes??0,0,100000),resourceUnits=integer(raw?.resourceUnits??1,1,1e9);
  const reasons=[];
  if(!id||!objective||!KINDS.has(kind))reasons.push(`identity-kind-objective-required:${index}`);
  if([expectedValue,founderImpact,evidenceConfidence,reversibility,costCents,founderMinutes,resourceUnits].some(v=>v==null))reasons.push(`bounded-economics-required:${index}`);
  if(reasons.length)return {ok:false,reasons};
  const valueSignal=expectedValue*founderImpact*evidenceConfidence*(0.5+0.5*reversibility);
  const burden=1+(costCents/10000)+(founderMinutes/60)+(resourceUnits/1000);
  const fitness=valueSignal/burden;
  return {ok:true,candidate:{id,kind,objective,expectedValue,founderImpact,evidenceConfidence,reversibility,costCents,founderMinutes,resourceUnits,fitness:Number(fitness.toFixed(9))}};
}

/**
 * Allocates scarce cognition/research/mutation/experiment/attention capacity.
 * The result is a proposal only. Provider spend remains a separately authorized
 * external consequence even when selected.
 */
export function allocateEconomicMetabolism({candidates=[],budget={}}={}){
  if(!Array.isArray(candidates)||!candidates.length||candidates.length>1000)return fail(['bounded-nonempty-candidates-required']);
  const maxCostCents=integer(budget?.maxCostCents??0,0,1e9),maxFounderMinutes=finite(budget?.maxFounderMinutes??0,0,100000),maxResourceUnits=integer(budget?.maxResourceUnits??100,1,1e9),minimumEvidenceConfidence=finite(budget?.minimumEvidenceConfidence??0.2),explorationSlots=integer(budget?.explorationSlots??1,0,100);
  if([maxCostCents,maxFounderMinutes,maxResourceUnits,minimumEvidenceConfidence,explorationSlots].some(v=>v==null))return fail(['valid-metabolism-budget-required']);
  const normalized=candidates.map(normalizeCandidate);const errors=normalized.filter(x=>!x.ok).flatMap(x=>x.reasons);
  if(errors.length)return fail(errors);
  const rows=normalized.map(x=>x.candidate);
  const eligible=rows.filter(c=>c.evidenceConfidence>=minimumEvidenceConfidence).sort((a,b)=>b.fitness-a.fitness||b.founderImpact-a.founderImpact||a.id.localeCompare(b.id));
  const selected=[];let usedCost=0,usedMinutes=0,usedUnits=0;
  for(const candidate of eligible){
    if(usedCost+candidate.costCents>maxCostCents||usedMinutes+candidate.founderMinutes>maxFounderMinutes||usedUnits+candidate.resourceUnits>maxResourceUnits)continue;
    selected.push({...candidate,allocationReason:'FITNESS_RANKED'});usedCost+=candidate.costCents;usedMinutes+=candidate.founderMinutes;usedUnits+=candidate.resourceUnits;
  }
  const selectedIds=new Set(selected.map(x=>x.id));
  const uncertain=rows.filter(c=>!selectedIds.has(c.id)&&c.evidenceConfidence<minimumEvidenceConfidence).sort((a,b)=>b.founderImpact-a.founderImpact||b.expectedValue-a.expectedValue||a.id.localeCompare(b.id));
  let explorationUsed=0;
  for(const candidate of uncertain){
    if(explorationUsed>=explorationSlots)break;
    if(usedCost+candidate.costCents>maxCostCents||usedMinutes+candidate.founderMinutes>maxFounderMinutes||usedUnits+candidate.resourceUnits>maxResourceUnits)continue;
    selected.push({...candidate,allocationReason:'BOUNDED_UNCERTAINTY_REDUCTION'});selectedIds.add(candidate.id);usedCost+=candidate.costCents;usedMinutes+=candidate.founderMinutes;usedUnits+=candidate.resourceUnits;explorationUsed++;
  }
  const proposal={schemaVersion:'uberbond.economic-metabolism.proposal.v1',selected,rejected:rows.filter(c=>!selectedIds.has(c.id)).map(c=>({id:c.id,kind:c.kind,reason:'OUTRANKED_OR_BUDGET_CONSTRAINED'})),budget:{maxCostCents,maxFounderMinutes,maxResourceUnits,minimumEvidenceConfidence,explorationSlots},usage:{costCents:usedCost,founderMinutes:Number(usedMinutes.toFixed(4)),resourceUnits:usedUnits,explorationSlots:explorationUsed},law:'EXPECTED_VALUE_AND_FOUNDER_IMPACT_COMPETE_FOR_BOUNDED_RESOURCES; FOUNDER_MINUTES_ARE_A_COST; SELECTION_NEVER_AUTHORIZES_SPEND_OR_INTERVENTION'};
  return {ok:true,status:selected.length?'ECONOMIC_METABOLISM_PROPOSAL_READY':'NO_DEPENDENCY_SATISFIED_ALLOCATION',proposal,proposalDigest:digest(proposal),businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero()};
}

export const ECONOMIC_METABOLISM_KINDS=Object.freeze([...KINDS]);
