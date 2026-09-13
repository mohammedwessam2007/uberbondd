import crypto from 'node:crypto';

export const FOUNDER_EXCEPTION_MARKET_VERSION='uberbond.founder-exception-market.v1';
export const FOUNDER_ACTION_CEILING=3;
const text=(v,n=600)=>{const s=String(v??'').trim();return s&&s.length<=n?s:null;};
const refs=a=>[...new Set((Array.isArray(a)?a:[]).map(v=>text(v,1000)).filter(Boolean))];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const fail=(codes,extra={})=>({ok:false,status:'FOUNDER_EXCEPTION_MARKET_REFUSED',reasonCodes:[...new Set(codes.filter(Boolean))],externalEffectAuthority:'NONE',businessEffectAuthority:'NONE',...extra});

export function allocateFounderExceptions({exceptions=[],maxActions=FOUNDER_ACTION_CEILING}={}){
  const ceiling=Math.max(0,Math.min(FOUNDER_ACTION_CEILING,Math.floor(num(maxActions,FOUNDER_ACTION_CEILING))));
  const evaluated=[];
  for(const raw of Array.isArray(exceptions)?exceptions:[]){
    const id=text(raw?.id,160),action=text(raw?.action,500),evidenceRefs=refs(raw?.evidenceRefs);
    if(!id||!action)continue;
    const humanOnly=raw.humanOnly===true,exhausted=raw.machineRemediationExhausted===true,requiredAuthority=text(raw.requiredAuthority,80)?.toUpperCase();
    const founderMinutes=Math.max(0.1,num(raw.founderMinutes,60));
    const blockingValue=Math.max(0,num(raw.blockingValue,0));
    const urgency=Math.max(0,num(raw.urgency,0));
    const reversibility=Math.max(0,Math.min(1,num(raw.reversibility,0)));
    const evidenceReady=evidenceRefs.length>0;
    const admissible=humanOnly&&exhausted&&requiredAuthority==='FOUNDER'&&evidenceReady;
    const score=admissible?((blockingValue*2+urgency+reversibility*0.25)/founderMinutes):Number.NEGATIVE_INFINITY;
    evaluated.push({id,action,humanOnly,machineRemediationExhausted:exhausted,requiredAuthority,evidenceRefs,founderMinutes,blockingValue,urgency,reversibility,admissible,score});
  }
  const selected=evaluated.filter(row=>row.admissible).sort((a,b)=>b.score-a.score||b.blockingValue-a.blockingValue||a.founderMinutes-b.founderMinutes||a.id.localeCompare(b.id)).slice(0,ceiling);
  const rejected=evaluated.filter(row=>!row.admissible).map(row=>({id:row.id,reasonCodes:[...(row.humanOnly?[]:['not-human-only']),...(row.machineRemediationExhausted?[]:['machine-remediation-not-exhausted']),...(row.requiredAuthority==='FOUNDER'?[]:['founder-authority-not-required']),...(row.evidenceRefs.length?[]:['evidence-required'])]}));
  const queue=selected.map((row,index)=>({rank:index+1,id:row.id,action:row.action,founderMinutes:row.founderMinutes,evidenceRefs:row.evidenceRefs,score:Number(row.score.toFixed(6))}));
  const receipt={schemaVersion:FOUNDER_EXCEPTION_MARKET_VERSION,ceiling,selectedCount:queue.length,queue,rejected,deferredAdmissibleCount:Math.max(0,evaluated.filter(r=>r.admissible).length-queue.length),law:'FOUNDER_EXCEPTION_QUEUE_IS_ONLY_FOR_GENUINE_HUMAN_ONLY_CROSSINGS_AFTER_MACHINE_REMEDIATION_IS_EXHAUSTED'};
  receipt.receiptDigest=`sha256:${hash(receipt)}`;
  return{ok:true,status:queue.length?'FOUNDER_EXCEPTION_QUEUE_COMPILED':'NO_FOUNDER_EXCEPTION_REQUIRED',...receipt,externalEffectAuthority:'NONE',businessEffectAuthority:'NONE'};
}
