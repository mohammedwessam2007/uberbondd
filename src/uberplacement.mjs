import crypto from 'node:crypto';

export const UBERPLACEMENT_VERSION='uberbond.uberplacement.v1';
export const PLACEMENT_STATES=Object.freeze(['INBOX','SPAM','MISSING','OTHER','UNKNOWN']);
const clean=(v,n=1000)=>String(v??'').trim().slice(0,n);
const lower=(v,n=1000)=>clean(v,n).toLowerCase();
const digest=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const emailOk=v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v||'').trim());
function providerFrom(seed={}){
  const explicit=lower(seed.provider,80);if(explicit)return explicit;
  const domain=lower(seed.email,320).split('@')[1]||'';
  if(['gmail.com','googlemail.com'].includes(domain))return'google';
  if(['outlook.com','hotmail.com','live.com','msn.com'].includes(domain))return'microsoft';
  if(['yahoo.com','aol.com'].includes(domain))return'yahoo';
  return'other';
}
function normalizeFolder(v=''){
  const s=lower(v,160);
  if(/inbox|primary|focused/.test(s))return'INBOX';
  if(/spam|junk/.test(s))return'SPAM';
  if(/missing|not[- _]?found|absent/.test(s))return'MISSING';
  if(s)return'OTHER';
  return'UNKNOWN';
}

export function compilePlacementProbePlan({
  senders=[],seedInboxes=[],campaignId='placement-canary',maxSeedsPerSender=4,now=new Date()
}={}){
  const eligibleSenders=(Array.isArray(senders)?senders:[]).filter(s=>s?.connected===true&&emailOk(s?.email)&&s?.paused!==true);
  const eligibleSeeds=(Array.isArray(seedInboxes)?seedInboxes:[]).filter(s=>s?.ownerControlled===true&&emailOk(s?.email)&&s?.receiveReady===true);
  const cap=Math.max(1,Math.min(20,Number(maxSeedsPerSender)||4));
  const probes=[];
  for(const sender of eligibleSenders){
    const byProvider=new Map();
    for(const seed of eligibleSeeds){
      const p=providerFrom(seed);
      if(!byProvider.has(p))byProvider.set(p,[]);
      byProvider.get(p).push(seed);
    }
    const balanced=[];
    const buckets=[...byProvider.values()].map(x=>[...x]);
    while(balanced.length<cap&&buckets.some(x=>x.length)){
      for(const bucket of buckets){
        if(bucket.length&&balanced.length<cap)balanced.push(bucket.shift());
      }
    }
    for(const seed of balanced){
      const token=`ubplacement_${digest([campaignId,sender.email,seed.email,now.toISOString()]).slice(0,24)}`;
      probes.push({
        probeId:token,campaignId:clean(campaignId,180),
        senderSlot:clean(sender.slot,120)||null,senderEmail:lower(sender.email,320),
        seedEmail:lower(seed.email,320),seedProvider:providerFrom(seed),
        subject:`UberBond placement probe ${token.slice(-8)}`,
        bodyToken:token,
        authority:'PLAN_ONLY',
        sendAuthorized:false
      });
    }
  }
  return Object.freeze({
    version:UBERPLACEMENT_VERSION,
    generatedAt:now.toISOString(),
    senderCount:eligibleSenders.length,
    seedCount:eligibleSeeds.length,
    probes,
    providerCoverage:[...new Set(eligibleSeeds.map(providerFrom))].sort(),
    externalEffectAuthority:'NONE',
    messagesSent:0,
    truthBoundary:'This is a placement probe plan for owner-controlled seed inboxes. It does not authorize or perform sends, create seed accounts, or infer placement before a receiving provider observation exists.'
  });
}

export function normalizePlacementObservation({
  probeId='',senderEmail='',seedEmail='',seedProvider='',folder='',observedAt='',evidenceRef='',messageId=''
}={}){
  const reasons=[];
  if(!clean(probeId,240))reasons.push('probe-id-required');
  if(!emailOk(senderEmail))reasons.push('sender-email-required');
  if(!emailOk(seedEmail))reasons.push('seed-email-required');
  const state=normalizeFolder(folder);
  if(state==='UNKNOWN')reasons.push('observed-folder-required');
  if(!clean(evidenceRef,1500))reasons.push('placement-evidence-ref-required');
  const ts=Date.parse(observedAt);
  if(!Number.isFinite(ts))reasons.push('placement-observed-at-required');
  if(reasons.length)return{ok:false,status:'UBERPLACEMENT_OBSERVATION_REFUSED',reasonCodes:reasons};
  const obs={
    probeId:clean(probeId,240),senderEmail:lower(senderEmail,320),seedEmail:lower(seedEmail,320),
    seedProvider:lower(seedProvider,80)||providerFrom({email:seedEmail}),state,
    observedAt:new Date(ts).toISOString(),evidenceRef:clean(evidenceRef,1500),
    messageId:clean(messageId,500)||null
  };
  return{ok:true,status:'UBERPLACEMENT_OBSERVED',observation:Object.freeze(obs),observationDigest:`sha256:${digest(obs)}`};
}

function ratio(a,b){return b?Number((a/b).toFixed(4)):null;}
export function compilePlacementReport({plan={},observations=[],now=new Date()}={}){
  const planned=new Map((Array.isArray(plan?.probes)?plan.probes:[]).map(p=>[p.probeId,p]));
  const dedup=new Map();
  for(const raw of Array.isArray(observations)?observations:[]){
    const normalized=raw?.ok&&raw.observation?raw:normalizePlacementObservation(raw);
    if(!normalized.ok)continue;
    const o=normalized.observation;
    if(!planned.has(o.probeId))continue;
    const key=`${o.probeId}|${o.seedEmail}`;
    const prev=dedup.get(key);
    if(!prev||Date.parse(o.observedAt)>Date.parse(prev.observedAt))dedup.set(key,o);
  }
  const rows=[...dedup.values()];
  const senders=[...new Set((plan?.probes||[]).map(p=>p.senderEmail).filter(Boolean))];
  const senderReports=senders.map(senderEmail=>{
    const expected=(plan.probes||[]).filter(p=>p.senderEmail===senderEmail);
    const observed=rows.filter(o=>o.senderEmail===senderEmail);
    const inbox=observed.filter(o=>o.state==='INBOX').length;
    const spam=observed.filter(o=>o.state==='SPAM').length;
    const missing=expected.length-observed.filter(o=>['INBOX','SPAM','OTHER','MISSING'].includes(o.state)).length+observed.filter(o=>o.state==='MISSING').length;
    const effectiveObserved=inbox+spam+observed.filter(o=>o.state==='OTHER').length;
    return{
      senderEmail,expected:expected.length,observed:observed.length,
      inbox,spam,missing:Math.max(0,missing),
      inboxPlacementRate:ratio(inbox,effectiveObserved),
      spamPlacementRate:ratio(spam,effectiveObserved),
      observationCoverage:ratio(observed.length,expected.length),
      byProvider:[...new Set(expected.map(p=>p.seedProvider))].map(provider=>{
        const exp=expected.filter(p=>p.seedProvider===provider);
        const obs=observed.filter(o=>o.seedProvider===provider);
        const i=obs.filter(o=>o.state==='INBOX').length,s=obs.filter(o=>o.state==='SPAM').length;
        return{provider,expected:exp.length,observed:obs.length,inbox:i,spam:s,inboxPlacementRate:ratio(i,i+s),spamPlacementRate:ratio(s,i+s)};
      })
    };
  });
  return Object.freeze({
    version:UBERPLACEMENT_VERSION,generatedAt:now.toISOString(),
    expectedProbes:(plan?.probes||[]).length,observedProbes:rows.length,
    senderReports,observations:rows,
    externalEffectAuthority:'NONE',
    truthBoundary:'Rates summarize only owner-controlled seed inbox observations supplied for this exact probe plan. They do not prove population-wide inbox placement, future delivery, or recipient engagement.'
  });
}

export function uberWarmPlacementObservation(senderReport={}){
  return Object.freeze({
    inboxPlacementRate:Number.isFinite(Number(senderReport.inboxPlacementRate))?Number(senderReport.inboxPlacementRate):null,
    spamPlacementRate:Number.isFinite(Number(senderReport.spamPlacementRate))?Number(senderReport.spamPlacementRate):null,
    placementObservationCoverage:Number.isFinite(Number(senderReport.observationCoverage))?Number(senderReport.observationCoverage):0
  });
}
