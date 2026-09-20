import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const RECURSION_CIVILIZATION_STACK_VERSION='uberbond.recursion-civilization-stack.v1';

const envelope=extra=>({
  businessEffectAuthority:'NONE',
  externalEffectAuthority:'NONE',
  externalEffectLedger:structuredClone(ZERO_EXTERNAL_EFFECTS),
  ...extra
});
const fail=(status,reasons,extra={})=>envelope({
  ok:false,status,reasonCodes:[...new Set(reasons.filter(Boolean))],...extra
});
const text=(v,max=500)=>{
  const s=String(v??'').trim();
  return s&&s.length<=max?s:null;
};
const num=(v,min=-Infinity,max=Infinity)=>{
  const n=Number(v);
  return Number.isFinite(n)&&n>=min&&n<=max?n:null;
};
const uniq=a=>[...new Set((Array.isArray(a)?a:[]).map(String).filter(Boolean))];

function motifSignature(row){
  return JSON.stringify({
    trigger:String(row?.trigger||'').toUpperCase(),
    operator:String(row?.operator||'').toUpperCase(),
    evaluator:String(row?.evaluatorClass||'').toUpperCase(),
    gate:String(row?.promotionGate||'').toUpperCase(),
    rollback:String(row?.rollbackClass||'').toUpperCase()
  });
}

export function extractRecursionGenome({lineages=[]}={}){
  if(!Array.isArray(lineages)||lineages.length>10000) return fail('RECURSION_GENOME_INVALID',['bounded-lineages-required']);
  const normalized=[];
  for(const [index,row] of lineages.entries()){
    const id=text(row?.id,200),trigger=text(row?.trigger,120),operator=text(row?.operator,120);
    const evaluatorClass=text(row?.evaluatorClass,120),promotionGate=text(row?.promotionGate,120);
    const rollbackClass=text(row?.rollbackClass,120),outcome=String(row?.outcome||'').toUpperCase();
    const evidenceRefs=uniq(row?.evidenceRefs);
    if(!id||!trigger||!operator||!evaluatorClass||!promotionGate||!rollbackClass||
       !['SUPPORTED','FALSIFIED','INCONCLUSIVE'].includes(outcome)||!evidenceRefs.length){
      return fail('RECURSION_GENOME_INVALID',[`lineage-${index}-incomplete`]);
    }
    normalized.push({
      id,trigger,operator,evaluatorClass,promotionGate,rollbackClass,outcome,
      evidenceRefs,independent:Boolean(row?.independent)
    });
  }
  const groups=new Map();
  for(const row of normalized){
    const sig=motifSignature(row);
    const rows=groups.get(sig)||[];
    rows.push(row); groups.set(sig,rows);
  }
  const motifs=[...groups.entries()].map(([signature,rows])=>{
    const supported=rows.filter(r=>r.outcome==='SUPPORTED');
    const falsified=rows.filter(r=>r.outcome==='FALSIFIED');
    const independentSupports=supported.filter(r=>r.independent).length;
    return {
      motifId:`recursion-motif-${Buffer.from(signature).toString('base64url').slice(0,24)}`,
      signature:JSON.parse(signature),
      lineageIds:rows.map(r=>r.id).sort(),
      supportCount:supported.length,
      independentSupportCount:independentSupports,
      falsificationCount:falsified.length,
      status:independentSupports>=1&&supported.length>=2&&falsified.length===0
        ?'REUSABLE_CANDIDATE'
        :falsified.length?'CONTESTED':'INSUFFICIENT_REPLICATION'
    };
  }).sort((a,b)=>b.independentSupportCount-a.independentSupportCount||b.supportCount-a.supportCount);
  return envelope({
    ok:true,status:'RECURSION_GENOME_EXTRACTED',
    lineageCount:normalized.length,motifCount:motifs.length,motifs,
    law:'RECURSION_MOTIFS_ARE_REUSABLE_ONLY_WHEN_EVIDENCE_REPEATS_AND_FAILURES_REMAIN_VISIBLE'
  });
}

export function evolveRecursionMechanisms({motif,mutations=[]}={}){
  if(!motif?.motifId||!Array.isArray(mutations)||mutations.length===0||mutations.length>128){
    return fail('RECURSION_EVOLUTION_INVALID',['motif-and-bounded-mutations-required']);
  }
  const forbidden=new Set(['REMOVE_INDEPENDENT_EVALUATOR','REMOVE_ROLLBACK','WIDEN_AUTHORITY','SELF_APPROVE_PROMOTION','EDIT_SOVEREIGN_GUARD']);
  const candidates=[];
  for(const [index,m] of mutations.entries()){
    const id=text(m?.id,160),operator=String(m?.operator||'').toUpperCase();
    if(!id||!operator) return fail('RECURSION_EVOLUTION_INVALID',[`mutation-${index}-invalid`]);
    const refused=forbidden.has(operator);
    candidates.push({
      id,operator,refused,
      status:refused?'REFUSED':'HYPOTHESIS',
      reason:refused?'mutation-would-weaken-governance':null,
      parentMotifId:motif.motifId,
      promotionAuthority:'NONE'
    });
  }
  return envelope({
    ok:true,status:'RECURSION_EVOLUTION_CANDIDATES_READY',
    candidates,
    law:'SELF_IMPROVEMENT_MAY_CHANGE_CAPABILITY_MECHANISMS_BUT_NOT_DELETE_THE_GATES_THAT_JUDGE_OR_REVOKE_IT'
  });
}

export function evaluateMetaRecursionDesign({designs=[]}={}){
  if(!Array.isArray(designs)||designs.length===0||designs.length>256){
    return fail('META_RECURSION_INVALID',['bounded-designs-required']);
  }
  const rows=[];
  for(const [index,d] of designs.entries()){
    const id=text(d?.id,160);
    const improvement=num(d?.verifiedImprovement,0,100);
    const replication=num(d?.replicationStrength,0,100);
    const diversity=num(d?.searchDiversity,0,100);
    const rollback=num(d?.rollbackConfidence,0,100);
    const evaluatorIndependence=num(d?.evaluatorIndependence,0,100);
    const authorityExpansion=num(d?.authorityExpansion,0,100);
    if(!id||[improvement,replication,diversity,rollback,evaluatorIndependence,authorityExpansion].some(x=>x==null)){
      return fail('META_RECURSION_INVALID',[`design-${index}-invalid`]);
    }
    const eligible=authorityExpansion===0&&rollback>=80&&evaluatorIndependence>=80;
    const score=eligible
      ? improvement*.30+replication*.25+diversity*.15+rollback*.15+evaluatorIndependence*.15
      : null;
    rows.push({id,eligible,score:score==null?null:Number(score.toFixed(3)),authorityExpansion,
      reasonCodes:eligible?[]:[
        ...(authorityExpansion>0?['authority-expansion-forbidden']:[]),
        ...(rollback<80?['rollback-confidence-insufficient']:[]),
        ...(evaluatorIndependence<80?['independent-evaluator-insufficient']:[])
      ]
    });
  }
  rows.sort((a,b)=>(b.eligible-a.eligible)||((b.score??-1)-(a.score??-1))||a.id.localeCompare(b.id));
  return envelope({
    ok:true,status:'META_RECURSION_DESIGNS_EVALUATED',designs:rows,
    selected:rows.find(r=>r.eligible)||null,
    selectionAuthority:'NONE',
    truthBoundary:'META_SCORE_PRIORITIZES_BOUNDED_DESIGNS_FOR_TESTING__IT_DOES_NOT_AUTHORIZE_SELF_MODIFICATION'
  });
}

export function governRecursionLoops({loops=[]}={}){
  if(!Array.isArray(loops)||loops.length>1000) return fail('RECURSION_GOVERNOR_INVALID',['bounded-loops-required']);
  const rows=[];
  for(const [index,l] of loops.entries()){
    const id=text(l?.id,160),gain=num(l?.gain,0,100),uncertainty=num(l?.uncertainty,0,100);
    const coupling=num(l?.coupling,0,100),failure=num(l?.failureRate,0,1);
    const authorityDelta=num(l?.authorityDelta,0,100);
    if(!id||[gain,uncertainty,coupling,failure,authorityDelta].some(x=>x==null)){
      return fail('RECURSION_GOVERNOR_INVALID',[`loop-${index}-invalid`]);
    }
    const independentEvaluator=l?.independentEvaluator===true;
    const rollbackReady=l?.rollbackReady===true;
    const evidenceBound=l?.evidenceBound===true;
    const riskIndex=(uncertainty*.35)+(coupling*.30)+(failure*100*.35);
    const permitted=
      authorityDelta===0&&independentEvaluator&&rollbackReady&&evidenceBound&&riskIndex<60;
    rows.push({
      id,gain,uncertainty,coupling,failureRate:failure,authorityDelta,
      riskIndex:Number(riskIndex.toFixed(3)),
      status:permitted?'BOUNDED_RECURSION_PERMITTED':'RECURSION_HELD',
      reasonCodes:permitted?[]:[
        ...(authorityDelta>0?['authority-growth']:[]),
        ...(!independentEvaluator?['independent-evaluator-required']:[]),
        ...(!rollbackReady?['rollback-required']:[]),
        ...(!evidenceBound?['evidence-bound-required']:[]),
        ...(riskIndex>=60?['feedback-risk-too-high']:[])
      ]
    });
  }
  const interacting=rows.length>1;
  const held=rows.filter(r=>r.status==='RECURSION_HELD');
  return envelope({
    ok:held.length===0,status:held.length?'RECURSION_SINGULARITY_GOVERNOR_HOLD':'RECURSION_SINGULARITY_GOVERNOR_CLEAR',
    interactingLoopCount:rows.length,interacting,loops:rows,
    authorityToRelease:'NONE',
    law:'POSITIVE_FEEDBACK_MAY_COMPOUND_CAPABILITY_BUT_NEVER_SELF_GRANTS_AUTHORITY_OR_SELF_CERTIFIES_EVIDENCE'
  });
}

export function compileCivilizationControlPlane({systems=[]}={}){
  if(!Array.isArray(systems)||systems.length>10000) return fail('CIVILIZATION_CONTROL_PLANE_INVALID',['bounded-systems-required']);
  const rows=[];
  for(const [index,s] of systems.entries()){
    const id=text(s?.id,160),kind=text(s?.kind,120);
    const criticality=num(s?.criticality,0,100),health=num(s?.health,0,100);
    const capability=num(s?.capability,0,100);
    const scope=String(s?.scope||'').toUpperCase();
    if(!id||!kind||[criticality,health,capability].some(x=>x==null)||
       !['CRITICAL_CAPABILITY_SYSTEM','ORDINARY_HUMAN_LIFE'].includes(scope)){
      return fail('CIVILIZATION_CONTROL_PLANE_INVALID',[`system-${index}-invalid`]);
    }
    rows.push({
      id,kind,scope,criticality,health,capability,
      observable:true,
      commandAuthority:scope==='ORDINARY_HUMAN_LIFE'?'NONE':'SEPARATE_EXPLICIT_AUTHORITY_REQUIRED',
      attentionScore:Number((criticality*(100-health)/100).toFixed(3))
    });
  }
  rows.sort((a,b)=>b.attentionScore-a.attentionScore||a.id.localeCompare(b.id));
  return envelope({
    ok:true,status:'CIVILIZATION_CONTROL_PLANE_COMPILED',
    systems:rows,
    criticalAttention:rows.filter(r=>r.scope==='CRITICAL_CAPABILITY_SYSTEM'&&r.attentionScore>=50),
    ordinaryLifeCommandAuthority:'NONE',
    law:'OBSERVE_CRITICAL_CAPABILITY_SYSTEMS_WITHOUT_CENTRALLY_DICTATING_ORDINARY_HUMAN_LIFE'
  });
}
