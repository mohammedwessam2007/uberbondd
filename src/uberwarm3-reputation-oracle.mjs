/**
 * UberWarm³ evidence oracle: choose what to measure and when to STOP,
 * not an engagement-simulation or unsolicited-message engine.
 *
 * This module never sends, purchases, edits DNS, marks spam as not spam,
 * manufactures conversations, or claims the provider knows secret filters.
 */
export const UBERWARM3_ORACLE_VERSION = 'uberbond.uberwarm3-reputation-oracle.v1';
const c = (v,n=150) => String(v ?? '').trim().slice(0,n);
const number = v => typeof v === 'number' && Number.isFinite(v) ? v : null;
const fraction = v => number(v)!==null && v>=0 && v<=1 ? v : null;
const positiveInteger = v => Number.isSafeInteger(v) && v>=0 ? v : null;
const observedAt = v => {const n = Date.parse(v);return Number.isFinite(n)?n:null};
const defined = o => o !== null && o !== undefined;
const unique = values => [...new Set(values)];
const PROVIDERS = Object.freeze(['GOOGLE','MICROSOFT','YAHOO','APPLE','OTHER']);
const VALID_SOURCES = Object.freeze([
  'GMAIL_POSTMASTER_V2','YAHOO_COMPLAINT_FEEDBACK','MICROSOFT_SNDS',
  'INDEPENDENT_RECEIVER','SMTP_EVENT_LEDGER','CAMPAIGN_GOVERNED_LEDGER'
]);
const signedSource = row => row.trustBoundary === 'AUTHENTICATED_INGEST' &&
  typeof row.evidenceRef === 'string' && row.evidenceRef.length>8 &&
  VALID_SOURCES.includes(row.source);
const normalizedSourceProvider = provider => {
  const v = c(provider,80).toUpperCase();
  return PROVIDERS.includes(v)?v:null;
};
/** Diagnostics and real receiver outcomes are intentionally distinct. */
export function compileUberWarm3ReputationDecision({
  mailbox = {}, signals = [], now = new Date(), minIndependentProviders=2,
  requireNewRecipientLegalClearance=true, verifyAuthenticatedSignal
}={}) {
  const at = observedAt(now);
  const address = c(mailbox.address,320).toLowerCase();
  const fail = (state, reasons, extra={}) => Object.freeze({
    version:UBERWARM3_ORACLE_VERSION, state, address,
    reasonCodes:unique(reasons), coldDailyCap:0, placementsObserved:0,
    contactEligibilityGranted:false, sendsPerformed:0,
    paidWarmingPurchased:false, ...extra
  });
  if(at===null) return fail('REFUSED',['invalid-clock']);
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return fail('REFUSED',['mailbox-address-missing']);
  if(mailbox.authenticated!==true || mailbox.paused===true ||
    mailbox.quarantined===true || mailbox.placementQuarantine===true)
    return fail('QUARANTINED',['unhealthy-or-unauthenticated-mailbox']);
  const recent=[],excluded=[];
  for(const signal of Array.isArray(signals)?signals:[]){
    const p=normalizedSourceProvider(signal?.provider);
    const time=observedAt(signal?.observedAt);
    const reasons=[];
    if(signal?.mailboxAddress!==address)reasons.push('signal-not-for-exact-mailbox');
    if(!p)reasons.push('unknown-recipient-provider');
    if(!signedSource(signal))reasons.push('no-authenticated-ingestion');
    let sourceVerified=false;
    try { sourceVerified=typeof verifyAuthenticatedSignal==='function' &&
      verifyAuthenticatedSignal(signal)===true; } catch {}
    if(!sourceVerified)reasons.push('independent-ingestion-verifier-required');
    if(time===null||time>at+5*60000||at-time>7*86400000)reasons.push('stale-future-or-invalid-evidence');
    if(signal?.source==='INDEPENDENT_RECEIVER'){
      if(!['INBOX','SPAM','MISSING'].includes(signal.folder))reasons.push('invalid-placement');
      if(signal?.consentedSeed !== true)reasons.push('missing-owner-seed-consent');
    }
    if(signal?.spamComplaintRate!==undefined && fraction(signal.spamComplaintRate)===null)reasons.push('invalid-spam-rate');
    if(signal?.hardBounceRate!==undefined && fraction(signal.hardBounceRate)===null)reasons.push('invalid-bounce-rate');
    if(signal?.spfAligned!==undefined && typeof signal.spfAligned!=='boolean')reasons.push('invalid-spf');
    if(signal?.dkimAligned!==undefined && typeof signal.dkimAligned!=='boolean')reasons.push('invalid-dkim');
    if(signal?.dmarcPass!==undefined && typeof signal.dmarcPass!=='boolean')reasons.push('invalid-dmarc');
    if(reasons.length){excluded.push({provider:p||'UNKNOWN',reasonCodes:reasons});continue}
    recent.push({...signal,provider:p});
  }
  const critical=[];
  if(recent.some(x=>x.spfAligned===false||x.dkimAligned===false||x.dmarcPass===false))
    critical.push('authenticated-sender-compliance-failed');
  if(recent.some(x=>defined(x.spamComplaintRate) && x.spamComplaintRate>=0.003))
    critical.push('spam-complaint-at-or-above-0.3-percent');
  if(recent.some(x=>defined(x.hardBounceRate) && x.hardBounceRate>0.03))
    critical.push('hard-bounce-above-3-percent');
  if(recent.some(x=>x.source==='INDEPENDENT_RECEIVER'&&x.folder==='SPAM'))
    critical.push('independent-seed-spam-placement');
  if(critical.length)return fail('QUARANTINED',critical,{
    excludedEvidenceCount:excluded.length,
    verifiedEvidenceCount:recent.length
  });
  const authenticatedProviders=unique(recent.map(x=>x.provider));
  const placement=recent.filter(x=>x.source==='INDEPENDENT_RECEIVER' &&
    ['INBOX','SPAM'].includes(x.folder));
  const campaign=recent.filter(x=>x.source==='CAMPAIGN_GOVERNED_LEDGER');
  const providerSignals=recent.filter(x=>x.source==='GMAIL_POSTMASTER_V2'||
    x.source==='YAHOO_COMPLAINT_FEEDBACK'||x.source==='MICROSOFT_SNDS');
  const exclusions=excluded.length;
  const knownComplaints=recent.some(x=>fraction(x.spamComplaintRate)!==null);
  const knownBounces=recent.some(x=>fraction(x.hardBounceRate)!==null);
  const knownAuthentication=recent.some(x=>x.spfAligned===true && x.dkimAligned===true && x.dmarcPass===true);
  const days=number(mailbox.conditioningDays);
  const declared=Math.max(0,positiveInteger(mailbox.providerColdDailyCap)??0);
  const proposed=Math.max(0,positiveInteger(mailbox.uberWarm2ColdDailyCap)??0);
  const limit=Math.min(20,declared,proposed);
  const baseline={
    version:UBERWARM3_ORACLE_VERSION,address,
    authenticatedRecipientProviderCoverage:authenticatedProviders,
    distinctObservedProviders:authenticatedProviders.length,
    realReceiverPlacementCount:placement.length,
    providerTelemetryCount:providerSignals.length,
    eligibleCampaignReceiptCount:campaign.length,
    knownAuthentication,knownComplaints,knownBounces,
    excludedEvidenceCount:exclusions,
    verifiedEvidenceCount:recent.length,
    contactEligibilityGranted:false, sendsPerformed:0,paidWarmingPurchased:false,
    evidenceWarnings:[
      ...(providerSignals.length===0?['postmaster-feedback-not-yet-observed']:[]),
      ...(!knownComplaints?['spam-rate-unknown-not-zero']:[]),
      ...(!knownBounces?['hard-bounce-rate-unknown-not-zero']:[])
    ]
  };
  const blockers=[];
  if(days===null || days<7)blockers.push('insufficient-observed-conditioning-days');
  if(authenticatedProviders.length<minIndependentProviders)blockers.push('independent-recipient-provider-diversity-required');
  if(!placement.length)blockers.push('no-independent-observed-inbox-placement');
  if(!knownAuthentication)blockers.push('sender-authentication-evidence-required');
  if(limit===0)blockers.push('existing-governed-send-cap-zero');
  if(requireNewRecipientLegalClearance && mailbox.legalRecipientRouteCleared!==true)
    blockers.push('independent-recipient-law-clearance-required');
  if(mailbox.ownerCampaignAuthority!==true)blockers.push('owner-campaign-authorization-required');
  return Object.freeze({
    ...baseline,
    state:blockers.length?'NOT_READY':'BOUNDED_RAMP_CANDIDATE',
    coldDailyCap:blockers.length?0:limit,
    reasonCodes:blockers,
    truthBoundary:'Only a recommendation, subordinate to live provider/account policy, recipient consent/legal gate, UberWarm2 and exact dispatch authority. Seed Inbox is NOT population-wide reputation.'
  });
}
function wilson(success,total,z=1.959963984540054) {
  if(!Number.isSafeInteger(success)||!Number.isSafeInteger(total)||success<0||total<success||total===0)
    return null;
  const p=success/total,zz=z*z;
  const center=(p+zz/(2*total))/(1+zz/total);
  const half=(z*Math.sqrt((p*(1-p)+zz/(4*total))/total))/(1+zz/total);
  return {rate:Number(p.toFixed(6)),low:Number(Math.max(0,center-half).toFixed(6)),high:Number(Math.min(1,center+half).toFixed(6)),sample:total};
}
/**
 * Test superiority against paid warming with REAL eligible audiences only.
 * Need matched cohorts (recipient provider, market, time window, offer
 * and contact eligibility), independent ground-truth inbox evidence, and
 * enough observations. No proxy seed engagement enters this experiment.
 */
export function compareUberWarm3AgainstWinnr({ cohorts = [], now=new Date(), minRecipientsPerArm=100, minProviders=2, margin=0.02, verifyExperimentCohort }={}) {
  const at=observedAt(now);
  const refusals=[],pairs=new Map();
  if(at===null) return {status:'REFUSED',reasonCodes:['invalid-clock']};
  for(const row of Array.isArray(cohorts)?cohorts:[]) {
    const key=c(row?.matchedPairId,160),arm=row?.arm;
    const reasons=[];
    const p=normalizedSourceProvider(row?.recipientProvider);
    const tested=positiveInteger(row?.independentlyObserved),inbox=positiveInteger(row?.inboxCount);
    if(!key || !['UBERWARM3_NO_ADDON','WINNR_PAID_WARMING'].includes(arm))reasons.push('paired-arm-identity-required');
    if(!p)reasons.push('recipient-provider-required');
    if(!signedSource(row) || row.source!=='CAMPAIGN_GOVERNED_LEDGER')reasons.push('authenticated-campaign-ledger-required');
    let externallyVerified=false;
    try { externallyVerified=typeof verifyExperimentCohort==='function' &&
      verifyExperimentCohort(row)===true; } catch {}
    if(!externallyVerified)reasons.push('authenticated-experiment-ingestion-verifier-required');
    if(row.legalRouteCleared!==true||row.ownerAuthorized!==true||row.randomizedAssignment!==true)
      reasons.push('law-approval-and-randomized-allocation-required');
    if(tested===null||inbox===null||inbox>tested)reasons.push('invalid-independent-recipient-count');
    if(row.recipientEvidenceClass!=='INDEPENDENT_REAL_RECIPIENT')
      reasons.push('no-synthetic-seed-placement-proxy');
    const time=observedAt(row?.observedAt);
    if(time===null||time>at||at-time>60*86400000)reasons.push('stale-or-future-observation');
    if(reasons.length){refusals.push({matchedPairId:key||null,reasonCodes:reasons});continue}
    const cell=pairs.get(key)||{p,uber:null,winnr:null};
    if(cell.p!==p || (arm==='UBERWARM3_NO_ADDON'&&cell.uber)||
      (arm==='WINNR_PAID_WARMING'&&cell.winnr)){
      refusals.push({matchedPairId:key,reasonCodes:['duplicate-or-provider-mismatch']});continue
    }
    cell[arm==='UBERWARM3_NO_ADDON'?'uber':'winnr']={
      total:tested, inbox, sourceRef:c(row.evidenceRef,500)
    };
    pairs.set(key,cell);
  }
  const valid=[...pairs.entries()].filter(([,row])=>row.uber&&row.winnr&&
    row.uber.total>0&&row.winnr.total>0);
  const sum=(a,side)=>a.reduce((v,[,pair])=>({
    total:v.total+pair[side].total,inbox:v.inbox+pair[side].inbox
  }),{total:0,inbox:0});
  const uber=sum(valid,'uber'),winnr=sum(valid,'winnr');
  const uw=wilson(uber.inbox,uber.total),wi=wilson(winnr.inbox,winnr.total);
  const providers=unique(valid.map(([,row])=>row.p));
  // Owner-supplied parameters may tighten evidence standards, never weaken
  // minimum statistical safeguards or turn negative margins into victory.
  const minSample=Math.max(100,positiveInteger(minRecipientsPerArm)??100);
  const requiredProviders=Math.max(2,positiveInteger(minProviders)??2);
  const minMargin=Math.max(0.02,number(margin)??0.02);
  const balancedPairs=valid.every(([,pair])=>{
    const ratio=pair.uber.total/pair.winnr.total;
    return ratio>=0.8 && ratio<=1.25;
  });
  const providerDirections=providers.map(provider=>{
    const sample=valid.filter(([,pair])=>pair.p===provider);
    const u=sum(sample,'uber'),w=sum(sample,'winnr');
    return {provider,uberRate:u.total?u.inbox/u.total:null,
      winnrRate:w.total?w.inbox/w.total:null,
      nUber:u.total,nWinnr:w.total};
  });
  const sufficientlyPowered=valid.length>=2&&providers.length>=requiredProviders&&
    uber.total>=minSample&&winnr.total>=minSample&&balancedPairs;
  // Prevent Simpson-style pooled "wins" masking losses in a provider type.
  const noProviderRegression=providerDirections.every(p=>
    p.uberRate!==null&&p.winnrRate!==null&&p.uberRate>=p.winnrRate);
  const noProviderAdvantage=providerDirections.every(p=>
    p.uberRate!==null&&p.winnrRate!==null&&p.winnrRate>=p.uberRate);
  const superior=sufficientlyPowered&&noProviderRegression&&uw.low>wi.high+minMargin;
  const inferior=sufficientlyPowered&&noProviderAdvantage&&wi.low>uw.high+minMargin;
  const status=!sufficientlyPowered?'INSUFFICIENT_REAL_CAUSAL_EVIDENCE':
    superior?'MEASURED_HIGHER_INBOX_RATE_WITH_MATCHED_EVIDENCE':
    inferior?'PAID_WARMING_MEASURED_HIGHER':'INCONCLUSIVE';
  return Object.freeze({
    version:UBERWARM3_ORACLE_VERSION,status,
    evidenceCounts:{validMatchedPairs:valid.length,recipientProviders:providers,
      uberWarm3:uber.total,winnr:winnr.total,excludedRows:refusals.length},
    inboxWilson95:{uberWarm3:uw,winnr:wi},providerDirections,balancedPairs,percentagePointDifference:uw&&wi?
      Number(((uw.rate-wi.rate)*100).toFixed(3)):null,
    paidProviderWarmingBeaten:superior,refusals,
    sendsPerformed:0,spendCents:0,
    truthBoundary:'Requires genuinely randomized matched real-recipient experiments. Even an observed win applies only to these cohorts; it does not prove universal deliverability or reputation.'
  });
}
