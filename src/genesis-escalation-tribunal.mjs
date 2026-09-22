import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const GENESIS_ESCALATION_TRIBUNAL_VERSION='uberbond.genesis-escalation-tribunal.v1';
const zero=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
const envelope=extra=>({businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero(),...extra});
const text=(v,m=4000)=>{const s=String(v??'').trim();return s&&s.length<=m?s:null;};
const unit=v=>Number.isFinite(Number(v))&&Number(v)>=0&&Number(v)<=1?Number(v):null;
const list=(v,n=64,m=1200)=>Array.isArray(v)&&v.length<=n?[...new Set(v.map(x=>text(x,m)).filter(Boolean))]:[];

const REALITY_NEEDS=new Set(['HUMAN_APPROVAL','UBERWATT','THERMAL_TELEMETRY','TELEMETRY']);
const SEMANTIC_NEEDS=new Set(['MODEL_MARKET','LOCAL_COMPUTE','SOVEREIGN_COMPUTE','FRONTIER_REVIEW','RESEARCH_SEARCH','RESEARCH_INGEST','CODE_GENERATION']);

export function compileGenesisEscalationDecision({
  candidate,
  cognitionReceipt,
  realization=null,
  callableSuppliers=[],
  paidProviderEnabled=false
}={}){
  const reasons=[];
  const candidateId=text(candidate?.candidateId||candidate?.candidate_id||candidate?.id,240);
  const title=text(candidate?.title,500);
  const utility=unit(candidate?.utility),testability=unit(candidate?.testability),reversibility=unit(candidate?.reversibility);
  const substrateNeeds=list(candidate?.substrateNeeds||candidate?.substrate_needs,64,120);
  if(!candidateId||!/^genesis-candidate-[a-z0-9-]+$/.test(candidateId)) reasons.push('valid-candidate-id-required');
  if(!title||utility===null||testability===null||reversibility===null||!substrateNeeds) reasons.push('bounded-candidate-required');
  if(!cognitionReceipt?.ok||!cognitionReceipt?.result) reasons.push('successful-cognition-receipt-required');
  if(reasons.length) return envelope({ok:false,status:'GENESIS_ESCALATION_DECISION_BLOCKED',reasonCodes:[...new Set(reasons)]});

  if(realization?.realizationState==='SOURCE_IMPLEMENTED_HYPOTHESIS_UNVALIDATED' || realization?.realization_state==='SOURCE_IMPLEMENTED_HYPOTHESIS_UNVALIDATED'){
    return envelope({ok:true,status:'GENESIS_ESCALATION_DECISION_READY',candidateId,title,decision:'ALREADY_IMPLEMENTED',score:1,reasonCodes:['source-realization-exists'],executionAuthority:'NONE'});
  }

  const unresolved=list(cognitionReceipt.result.unresolved,32,2000);
  const counterexamples=list(cognitionReceipt.result.strongestCounterexamples,16,2000);
  const confidence=unit(cognitionReceipt.result.confidence) ?? 0;
  const realityBlockers=substrateNeeds.filter(x=>REALITY_NEEDS.has(x));
  const semanticNeeds=substrateNeeds.filter(x=>SEMANTIC_NEEDS.has(x));
  const supplierClasses=new Set((Array.isArray(callableSuppliers)?callableSuppliers:[])
    .filter(s=>s?.callable===true).map(s=>String(s.supplierClass||s.supplier_class||'').toUpperCase()));
  const localSemanticCallable=supplierClasses.has('LOCAL');
  const cloudCallable=supplierClasses.has('CHEAP_CLOUD')||supplierClasses.has('FRONTIER');

  let decision='HOLD';
  const decisionReasons=[];
  if(realityBlockers.length){
    decision='WAIT_REALITY_EVIDENCE';
    decisionReasons.push('reality-evidence-required',...realityBlockers.map(x=>`needs:${x}`));
  } else if(utility>=0.93 && testability>=0.88 && reversibility>=0.94 && semanticNeeds.length===0 && confidence>=0.60){
    decision='IMPLEMENT_NOW';
    decisionReasons.push('high-utility-high-testability-high-reversibility','no-reality-blocker','no-semantic-supplier-dependency');
  } else if(semanticNeeds.length>0 && localSemanticCallable){
    decision='ESCALATE_LOCAL_SEMANTIC';
    decisionReasons.push('material-semantic-uncertainty','callable-local-semantic-supplier-exists');
  } else if((utility>=0.90||testability>=0.90) && semanticNeeds.length>0 && paidProviderEnabled && cloudCallable){
    decision='ESCALATE_PAID_SEMANTIC';
    decisionReasons.push('material-semantic-uncertainty','paid-provider-authority-present');
  } else if(semanticNeeds.length>0){
    decision=paidProviderEnabled?'WAIT_CALLABLE_SEMANTIC_SUPPLIER':'WAIT_PAID_SEMANTIC_AUTHORITY';
    decisionReasons.push('material-semantic-uncertainty',paidProviderEnabled?'no-callable-semantic-supplier':'paid-provider-disabled');
  } else if(utility>=0.90 && testability>=0.84 && reversibility>=0.94){
    decision='IMPLEMENT_NOW';
    decisionReasons.push('strong-internal-source-prototype-candidate','no-reality-blocker');
  } else {
    decision='HOLD';
    decisionReasons.push('below-current-realization-frontier');
  }

  const score=Number((0.38*utility+0.30*testability+0.20*reversibility+0.12*confidence).toFixed(4));
  return envelope({
    ok:true,status:'GENESIS_ESCALATION_DECISION_READY',version:GENESIS_ESCALATION_TRIBUNAL_VERSION,
    candidateId,title,decision,score,
    reasonCodes:decisionReasons,
    realityBlockers,
    semanticNeeds,
    unresolved,
    counterexampleCount:counterexamples.length,
    callableSupplierClasses:[...supplierClasses].sort(),
    paidProviderEnabled:paidProviderEnabled===true,
    executionAuthority:'NONE',
    truthBoundary:'THE_TRIBUNAL_PRIORITIZES_INTERNAL_RESEARCH_AND_SOURCE_PROTOTYPES__IT_DOES_NOT_AUTHORIZE_SPEND_EXTERNAL_ACTIONS_OR_CLAIM_FEASIBILITY.'
  });
}

export function compileGenesisEscalationPortfolio({rows=[],limit=12}={}){
  const max=Number(limit);
  if(!Array.isArray(rows)||rows.length<1||rows.length>1000||!Number.isSafeInteger(max)||max<1||max>100){
    return envelope({ok:false,status:'GENESIS_ESCALATION_PORTFOLIO_BLOCKED',reasonCodes:['bounded-rows-and-limit-required']});
  }
  const valid=rows.filter(r=>r?.ok&&r.status==='GENESIS_ESCALATION_DECISION_READY');
  const order={IMPLEMENT_NOW:0,ESCALATE_LOCAL_SEMANTIC:1,ESCALATE_PAID_SEMANTIC:2,WAIT_REALITY_EVIDENCE:3,WAIT_PAID_SEMANTIC_AUTHORITY:4,WAIT_CALLABLE_SEMANTIC_SUPPLIER:5,HOLD:6,ALREADY_IMPLEMENTED:7};
  valid.sort((a,b)=>(order[a.decision]??99)-(order[b.decision]??99)||b.score-a.score||a.candidateId.localeCompare(b.candidateId));
  const selected=valid.slice(0,max);
  return envelope({
    ok:true,status:'GENESIS_ESCALATION_PORTFOLIO_READY',
    selectedCount:selected.length,
    selected,
    counts:Object.fromEntries([...new Set(valid.map(x=>x.decision))].sort().map(k=>[k,valid.filter(x=>x.decision===k).length])),
    executionAuthority:'NONE',
    law:'CHEAPEST_SUFFICIENT_LAYER_FIRST__REALITY_EVIDENCE_BEFORE_CLAIMS__SPEND_ONLY_WITH_EXPLICIT_AUTHORITY.'
  });
}
