// Durable legacy and institution capital compiler.
// Converts long-horizon intent into reversible, evidenced institution specs without pretending software can create real-world legacy.
export const LEGACY_INSTITUTION_ENGINE_VERSION = 'uberbond.legacy-institution-engine.v1';
const text=(v,m=800)=>{const s=String(v??'').trim();return s&&s.length<=m?s:null};
const list=v=>Array.isArray(v)?v:[];
const envelope=extra=>({businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',...extra});

export function knowledgeCapitalRecord(input={}) {
  const id=text(input.id); const title=text(input.title);
  if(!id||!title) return envelope({ok:false,status:'KNOWLEDGE_CAPITAL_INVALID',reasonCodes:['id-and-title-required']});
  return envelope({ok:true,status:'KNOWLEDGE_CAPITAL_READY',record:{
    id,title,kind:text(input.kind)||'LESSON',sourceRefs:[...new Set(list(input.sourceRefs).map(v=>text(v,2000)).filter(Boolean))].sort(),
    successorUse:text(input.successorUse),privacy:text(input.privacy)||'PRIVATE',supersedes:text(input.supersedes)
  }});
}

export function institutionSpec(input={}) {
  const mission=text(input.mission); const horizonYears=Math.max(1,Number(input.horizonYears)||1);
  if(!mission) return envelope({ok:false,status:'INSTITUTION_SPEC_INVALID',reasonCodes:['mission-required']});
  const invariants=[...new Set(list(input.invariants).map(v=>text(v)).filter(Boolean))].sort();
  const sunsetConditions=[...new Set(list(input.sunsetConditions).map(v=>text(v)).filter(Boolean))].sort();
  return envelope({ok:true,status:'INSTITUTION_SPEC_READY',spec:{
    mission,horizonYears,invariants,sunsetConditions,governance:text(input.governance)||'FOUNDER_REVIEW_REQUIRED',
    beneficiaries:[...new Set(list(input.beneficiaries).map(v=>text(v)).filter(Boolean))].sort(),
    fundingPolicy:text(input.fundingPolicy),successEvidence:[...new Set(list(input.successEvidence).map(v=>text(v)).filter(Boolean))].sort()
  },activationAuthority:'NONE'});
}

export function patronageCandidate({candidate={},missionNeeds=[]}={}) {
  const id=text(candidate.id); if(!id) return envelope({ok:false,status:'PATRONAGE_INVALID',reasonCodes:['candidate-id-required']});
  const needs=new Set(list(missionNeeds).map(v=>text(v)).filter(Boolean));
  const strengths=[...new Set(list(candidate.strengths).map(v=>text(v)).filter(Boolean))];
  const overlap=strengths.filter(x=>needs.has(x));
  return envelope({ok:true,status:'PATRONAGE_CANDIDATE_READY',candidate:{id,overlap,fit:needs.size?overlap.length/needs.size:0,evidenceRefs:list(candidate.evidenceRefs)},requiresOwnerApproval:true});
}
