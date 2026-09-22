import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { buildIdeationActivationPlan } from './million-branch-ideation-genome.mjs';

export const GENESIS_IDEA_BURST_VERSION='uberbond.genesis-idea-burst.v1';
const zero=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
const envelope=extra=>({businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero(),...extra});
const text=(v,m=4000)=>{const s=String(v??'').trim();return s&&s.length<=m?s:null;};
const list=(v,n=128,m=1000)=>Array.isArray(v)&&v.length<=n?[...new Set(v.map(x=>text(x,m)).filter(Boolean))]:null;
const unit=v=>Number.isFinite(Number(v))&&Number(v)>=0&&Number(v)<=1?Number(v):null;
const digest=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');

export function compileGenesisIdeaBurst({
  signal,
  affectedDomains=[],
  candidates=[],
  maxGenerators=12,
  candidateBudgetPerGenerator=50
}={}){
  const reasons=[];
  const signalId=text(signal?.id,240);
  const summary=text(signal?.summary,6000);
  const evidenceRefs=list(signal?.evidenceRefs,32,2000);
  if(!signalId||!summary) reasons.push('signal-id-and-summary-required');
  if(!evidenceRefs?.length) reasons.push('signal-evidence-required');
  if(!Array.isArray(candidates)||candidates.length<1||candidates.length>500) reasons.push('bounded-materialized-candidates-required');
  if(reasons.length) return envelope({ok:false,status:'GENESIS_IDEA_BURST_BLOCKED',reasonCodes:[...new Set(reasons)]});

  const activation=buildIdeationActivationPlan({
    context:summary,
    affectedDomains,
    maxGenerators,
    candidateBudgetPerGenerator,
    seed:signalId
  });
  if(!activation.ok) return envelope({ok:false,status:'GENESIS_IDEA_BURST_BLOCKED',reasonCodes:['ideation-activation-required'],activation});

  const allowed=new Set(activation.selectedGenerators.map(g=>g.key));
  const ids=new Set();
  const normalized=[];
  for(const raw of candidates){
    const id=text(raw?.id,240),title=text(raw?.title,300),hypothesis=text(raw?.hypothesis,3000),
      mechanism=text(raw?.mechanism,3000),falsifier=text(raw?.falsifier,2000),
      nextProbe=text(raw?.nextProbe,2000),generatorKey=text(raw?.generatorKey,300);
    const moonshotAffinity=list(raw?.moonshotAffinity,32,120);
    const substrateNeeds=list(raw?.substrateNeeds,32,120);
    const novelty=unit(raw?.novelty),leverage=unit(raw?.leverage),testability=unit(raw?.testability),reversibility=unit(raw?.reversibility);
    const localReasons=[];
    if(!id||!/^genesis-candidate-[a-z0-9-]+$/.test(id)||ids.has(id)) localReasons.push('unique-stable-candidate-id-required');
    if(!title||!hypothesis||!mechanism||!falsifier||!nextProbe) localReasons.push('complete-hypothesis-mechanism-falsifier-probe-required');
    if(!generatorKey||!allowed.has(generatorKey)) localReasons.push('candidate-must-bind-selected-generator');
    if(!moonshotAffinity||moonshotAffinity.some(x=>!/^founder-moonshot-\d{4}$/.test(x))) localReasons.push('valid-moonshot-affinity-required');
    if(!substrateNeeds?.length) localReasons.push('substrate-needs-required');
    if([novelty,leverage,testability,reversibility].some(v=>v===null)) localReasons.push('bounded-candidate-scores-required');
    if(localReasons.length) return envelope({ok:false,status:'GENESIS_IDEA_BURST_BLOCKED',reasonCodes:[...new Set(localReasons)],candidateId:id||null});
    ids.add(id);
    const utility=Number((0.30*leverage+0.25*testability+0.20*novelty+0.15*reversibility+0.10*(moonshotAffinity.length?1:0)).toFixed(4));
    normalized.push({
      id,title,hypothesis,mechanism,falsifier,nextProbe,generatorKey,
      moonshotAffinity,substrateNeeds,novelty,leverage,testability,reversibility,
      utility,
      promotionState:'GENERATED_HYPOTHESIS',
      executionAuthority:'NONE'
    });
  }

  const core={
    signal:{id:signalId,summary,evidenceRefs},
    affectedDomains:[...new Set(affectedDomains.map(String))],
    activation:{
      selectedGeneratorCount:activation.selectedGeneratorCount,
      selectedGeneratorKeys:activation.selectedGenerators.map(g=>g.key),
      selectedFirstGenerationCapacity:activation.selectedFirstGenerationCapacity
    },
    materializedCandidateCount:normalized.length,
    candidates:normalized.sort((a,b)=>b.utility-a.utility||a.id.localeCompare(b.id))
  };
  return envelope({
    ok:true,status:'GENESIS_IDEA_BURST_READY',version:GENESIS_IDEA_BURST_VERSION,
    ...core,
    burstDigest:`sha256:${digest(core)}`,
    materializedFractionOfSelectedCapacity:normalized.length/activation.selectedFirstGenerationCapacity,
    law:'NEW_GENESIS_CANDIDATES_EXTEND_THE_LIVING_NURSERY_WITHOUT_MUTATING_THE_IMMUTABLE_890_FOUNDER_MOONSHOT_CORPUS',
    truthBoundary:'IDEA_BURST_OUTPUTS_ARE_EVIDENCE_BOUND_HYPOTHESES_NOT_DISCOVERIES_FEASIBILITY_PROOF_MARKET_PROOF_OR_EXTERNAL_AUTHORITY'
  });
}
