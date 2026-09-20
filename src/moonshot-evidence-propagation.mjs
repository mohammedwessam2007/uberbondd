import { REALITY_STATES } from './moonshot-reality-compiler.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const MOONSHOT_EVIDENCE_PROPAGATION_VERSION = 'uberbond.moonshot-evidence-propagation.v1';

const envelope=extra=>({
  businessEffectAuthority:'NONE',
  externalEffectAuthority:'NONE',
  externalEffectLedger:structuredClone(ZERO_EXTERNAL_EFFECTS),
  ...extra
});

const text=(value,max=1200)=>{
  const out=String(value??'').trim();
  return out&&out.length<=max?out:null;
};

export function foldMoonshotEvidence({ledgerRows=[],events=[]}={}){
  if(!Array.isArray(ledgerRows)||!Array.isArray(events)){
    return envelope({ok:false,status:'MOONSHOT_EVIDENCE_INVALID',reasonCodes:['ledger-and-events-required']});
  }
  const states=new Map();
  for(const row of ledgerRows){
    states.set(row.stableId,{
      stableId:row.stableId,
      ordinal:row.ordinal,
      literalTitle:row.literalTitle,
      parentRealityState:row.realityState||'IMAGINED',
      parentEvidence:[],
      childMechanisms:[],
      falsifiedChildren:[],
      blockers:[],
      sourceRealityRoute:row
    });
  }

  const rejected=[];
  for(const event of events){
    if(event?.targetType!=='MOONSHOT') continue;
    const state=states.get(event.targetId);
    if(!state){rejected.push({eventId:event?.eventId||null,reason:'unknown-moonshot'});continue;}
    const refs=Array.isArray(event.evidenceRefs)?event.evidenceRefs.filter(Boolean):[];
    if(!refs.length){rejected.push({eventId:event?.eventId||null,reason:'evidence-required'});continue;}

    if(event.eventType==='PARENT_STATE_EVIDENCE'){
      const next=text(event.state,80)?.toUpperCase();
      if(!REALITY_STATES.includes(next)){rejected.push({eventId:event.eventId,reason:'unknown-parent-state'});continue;}
      const currentIndex=REALITY_STATES.indexOf(state.parentRealityState);
      const nextIndex=REALITY_STATES.indexOf(next);
      if(nextIndex!==currentIndex+1){
        rejected.push({eventId:event.eventId,reason:'parent-state-must-advance-contiguously'});
        continue;
      }
      state.parentRealityState=next;
      state.parentEvidence.push({eventId:event.eventId,state:next,evidenceRefs:refs});
    }else if(event.eventType==='CHILD_MECHANISM_EVIDENCE'){
      const childId=text(event.childMechanismId,200);
      const childState=text(event.childState,120);
      if(!childId||!childState){rejected.push({eventId:event.eventId,reason:'child-id-and-state-required'});continue;}
      state.childMechanisms.push({
        childMechanismId:childId,
        childState,
        reviewStatus:event.reviewStatus||'UNREVIEWED',
        evidenceRefs:refs
      });
    }else if(event.eventType==='CHILD_MECHANISM_FALSIFIED'){
      const childId=text(event.childMechanismId,200);
      if(!childId){rejected.push({eventId:event.eventId,reason:'child-id-required'});continue;}
      state.falsifiedChildren.push({childMechanismId:childId,evidenceRefs:refs});
    }else if(event.eventType==='BLOCKED'){
      state.blockers.push({reason:text(event.reason,1000)||'unspecified',evidenceRefs:refs});
    }
  }

  return envelope({
    ok:rejected.length===0,
    status:rejected.length?'MOONSHOT_EVIDENCE_FOLDED_WITH_REJECTIONS':'MOONSHOT_EVIDENCE_FOLDED',
    states:[...states.values()],
    rejected,
    law:'CHILD_MECHANISMS_NEVER_AUTO_PROMOTE_PARENT_REALITY_STATE'
  });
}

export function summarizeMoonshotEvidence({states=[]}={}){
  const summary={
    total:states.length,
    parentByState:{},
    parentsWithDemonstratedChildren:0,
    totalChildMechanisms:0,
    falsifiedChildMechanisms:0
  };
  for(const state of states){
    summary.parentByState[state.parentRealityState]=(summary.parentByState[state.parentRealityState]||0)+1;
    if(state.childMechanisms.some(child=>String(child.childState).includes('SOFTWARE_DEMONSTRATED'))) summary.parentsWithDemonstratedChildren+=1;
    summary.totalChildMechanisms+=state.childMechanisms.length;
    summary.falsifiedChildMechanisms+=state.falsifiedChildren.length;
  }
  return envelope({ok:true,status:'MOONSHOT_EVIDENCE_SUMMARY_READY',summary});
}
