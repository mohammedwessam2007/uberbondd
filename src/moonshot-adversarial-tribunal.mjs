import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const MOONSHOT_ADVERSARIAL_TRIBUNAL_VERSION='uberbond.moonshot-adversarial-tribunal.v1';
export const CHALLENGE_VERDICTS=Object.freeze(['SURVIVED','FALSIFIED','UNRESOLVED']);

const envelope=extra=>({
  businessEffectAuthority:'NONE',
  externalEffectAuthority:'NONE',
  externalEffectLedger:structuredClone(ZERO_EXTERNAL_EFFECTS),
  ...extra
});
const text=(v,max=2400)=>{const s=String(v??'').trim();return s&&s.length<=max?s:null;};
const refs=v=>Array.isArray(v)?[...new Set(v.map(x=>text(x,1000)).filter(Boolean))]:[];
const fail=(status,reasons,extra={})=>envelope({ok:false,status,reasonCodes:[...new Set(reasons.filter(Boolean))],...extra});

export function compileMoonshotAdversarialTribunal({
  claimId,claim,falsifier,evidenceRefs=[],
  builderInstanceRef,reviewer={},
  challenges=[]
}={}){
  const cid=text(claimId,160),statement=text(claim,4000),kill=text(falsifier,2400);
  const builder=text(builderInstanceRef,300);
  const reviewerInstance=text(reviewer?.executionInstanceRef,300);
  const reviewerContext=text(reviewer?.contextRef,500);
  const reasons=[];
  if(!cid||!statement||!kill) reasons.push('claim-id-statement-and-falsifier-required');
  if(!builder||!reviewerInstance||!reviewerContext) reasons.push('builder-and-reviewer-identity-required');
  if(builder&&reviewerInstance&&builder===reviewerInstance) reasons.push('reviewer-must-be-distinct-execution-instance');
  if(reviewer?.contextIsolation!==true) reasons.push('reviewer-context-isolation-required');
  if(reviewer?.canWidenAuthority===true) reasons.push('reviewer-authority-widening-forbidden');
  if(!Array.isArray(challenges)||challenges.length===0||challenges.length>128) reasons.push('one-to-128-challenges-required');
  if(reasons.length) return fail('ADVERSARIAL_TRIBUNAL_INVALID',reasons);

  const rows=[];
  const ids=new Set();
  for(const [index,raw] of challenges.entries()){
    const id=text(raw?.id,160),attack=text(raw?.attack,2400);
    const verdict=String(raw?.verdict||'').toUpperCase();
    const er=refs(raw?.evidenceRefs);
    if(!id||ids.has(id)||!attack||!CHALLENGE_VERDICTS.includes(verdict)){
      return fail('ADVERSARIAL_TRIBUNAL_INVALID',['challenge-'+index+'-invalid-or-duplicate']);
    }
    ids.add(id);
    rows.push({id,attack,verdict,evidenceRefs:er});
  }
  const falsified=rows.filter(r=>r.verdict==='FALSIFIED');
  const unresolved=rows.filter(r=>r.verdict==='UNRESOLVED');
  const status=falsified.length
    ?'ADVERSARIAL_CLAIM_FALSIFIED'
    :unresolved.length
      ?'ADVERSARIAL_REVIEW_UNRESOLVED'
      :'ADVERSARIAL_REVIEW_SURVIVED';

  return envelope({
    ok:true,status,claimId:cid,claim:statement,falsifier:kill,
    evidenceRefs:refs(evidenceRefs),
    builderInstanceRef:builder,
    reviewer:{
      executionInstanceRef:reviewerInstance,
      contextRef:reviewerContext,
      contextIsolation:true,
      canVeto:true,
      canWidenAuthority:false
    },
    challenges:rows,
    falsifiedChallengeIds:falsified.map(r=>r.id),
    unresolvedChallengeIds:unresolved.map(r=>r.id),
    survivedChallengeCount:rows.filter(r=>r.verdict==='SURVIVED').length,
    promotionAuthority:'NONE',
    law:'ADVERSARIAL_REVIEW_MAY_FALSIFY_BLOCK_OR_LEAVE_UNRESOLVED__IT_CANNOT_SELF_CERTIFY_TRUTH_OR_WIDEN_AUTHORITY',
    truthBoundary:'SURVIVING_DECLARED_CHALLENGES_IS_NOT_PROOF_THAT_ALL_RELEVANT_CHALLENGES_WERE_INCLUDED'
  });
}
