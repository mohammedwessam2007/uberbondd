import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const FOUNDER_OUTCOME_MISSION_VERSION = 'uberbond.founder-outcome-mission.v1.2';
const zeroEffects = () => structuredClone(ZERO_EXTERNAL_EFFECTS);
const text = (value, max = 8000) => String(value ?? '').trim().slice(0, max);
const uniq = values => [...new Set((Array.isArray(values) ? values : []).map(String).filter(Boolean))];
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const MONTHS = new Map(['january','february','march','april','may','june','july','august','september','october','november','december'].map((m,i)=>[m,i]));

function fail(reasonCodes, status = 'FOUNDER_OUTCOME_MISSION_REFUSED', extra = {}) {
  return { ok:false, policyVersion:FOUNDER_OUTCOME_MISSION_VERSION, status, reasonCodes:uniq(reasonCodes), businessEffectAuthority:'NONE', externalEffectAuthority:'NONE', externalEffectLedger:zeroEffects(), ...extra };
}
function asDate(value) { if(value==null||value==='')return null; const d=value instanceof Date?value:new Date(value); return Number.isFinite(d.getTime())?d:null; }
function parseClock(raw) {
  const m=raw.match(/\b(?:until|by|before|at)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if(!m)return null;
  let hour=Number(m[1]); const minute=Number(m[2]||0);
  if(hour<1||hour>12||minute<0||minute>59)return null;
  if(m[3].toLowerCase()==='pm'&&hour!==12)hour+=12;
  if(m[3].toLowerCase()==='am'&&hour===12)hour=0;
  return {hour,minute};
}
function explicitCalendarDate(raw, localNow) {
  const m=raw.match(/\b(?:on\s+)?(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/i);
  if(!m)return null;
  const month=MONTHS.get(m[1].toLowerCase()); const day=Number(m[2]); const year=m[3]?Number(m[3]):localNow.getUTCFullYear();
  if(month==null||day<1||day>31||year<1970||year>9999)return null;
  const probe=new Date(Date.UTC(year,month,day));
  if(probe.getUTCFullYear()!==year||probe.getUTCMonth()!==month||probe.getUTCDate()!==day)return null;
  return {year,month,day};
}
function parseClockDeadline(raw, now, timezoneOffsetMinutes=180) {
  const next=raw.match(/\bnext\s+(\d{1,3}(?:\.\d+)?)\s*hours?\b/i);
  if(next){const hours=Number(next[1]); if(Number.isFinite(hours)&&hours>0&&hours<=168)return new Date(now.getTime()+hours*3_600_000);}
  const clock=parseClock(raw); if(!clock)return null;
  const offsetMs=Number(timezoneOffsetMinutes)*60_000; const local=new Date(now.getTime()+offsetMs);
  const explicit=explicitCalendarDate(raw,local);
  let year=explicit?.year??local.getUTCFullYear(), month=explicit?.month??local.getUTCMonth(), day=explicit?.day??local.getUTCDate();
  let deadline=new Date(Date.UTC(year,month,day,clock.hour,clock.minute)-offsetMs);
  if(explicit)return deadline;
  if(/\btomorrow\b/i.test(raw))deadline=new Date(deadline.getTime()+86_400_000);
  else if(!/\btoday\b/i.test(raw)&&deadline.getTime()<=now.getTime())deadline=new Date(deadline.getTime()+86_400_000);
  return deadline;
}

export function classifyFounderOutcomeIntent(founderIntent) {
  const raw=text(founderIntent); if(!raw)return {recognized:false,missionClass:null};
  const economic=/\b(money|revenue|profit|cash|payment|paid|sales?)\b/i.test(raw)&&/\b(make|earn|maximi[sz]e|generate|create|get|produce|bring)\b/i.test(raw);
  return {recognized:economic,missionClass:economic?'ECONOMIC_OUTCOME':null,objectiveClass:economic?'MAXIMIZE_CLEARED_CONTRIBUTION_PROFIT':null};
}

export function compileFounderOutcomeMission({founderIntent,now=new Date(),deadline=null,timezone='Africa/Cairo',timezoneOffsetMinutes=180,sourceRevision=null,spendCeilingCents=null}={}) {
  const raw=text(founderIntent), startedAt=asDate(now); if(!raw||!startedAt)return fail(['founder-intent-and-valid-now-required']);
  const classification=classifyFounderOutcomeIntent(raw); if(!classification.recognized)return fail(['recognized-outcome-mission-required']);
  const resolved=asDate(deadline)||parseClockDeadline(raw,startedAt,timezoneOffsetMinutes);
  if(!resolved||resolved.getTime()<=startedAt.getTime())return fail(['future-mission-deadline-required']);
  const paypal=raw.match(/\bpaypal\.me\/[A-Za-z0-9._-]+\b/i);
  const explicitZero=/\b(?:\$\s*0|0\s*cents?|zero[- ]spend|spend ceiling[^\n]{0,40}\b0)\b/i.test(raw);
  const spend=spendCeilingCents==null?(explicitZero?0:null):Number(spendCeilingCents);
  if(spend!=null&&(!Number.isSafeInteger(spend)||spend<0))return fail(['valid-nonnegative-spend-ceiling-required']);
  const core={schemaVersion:FOUNDER_OUTCOME_MISSION_VERSION,missionClass:classification.missionClass,objectiveClass:classification.objectiveClass,founderIntent:raw,startedAt:startedAt.toISOString(),deadlineAt:resolved.toISOString(),timezone,nominatedPaymentDestination:paypal?paypal[0]:null,spendCeilingCents:spend,sourceRevision:text(sourceRevision,80)||null};
  return {ok:true,policyVersion:FOUNDER_OUTCOME_MISSION_VERSION,status:'FOUNDER_OUTCOME_MISSION_ACTIVE',state:'ACTIVE',terminal:false,terminalResultAllowed:false,missionId:`mission-${digest(core).slice(0,24)}`,...core,successMetric:'PROVIDER_ORIGIN_CLEARED_CONTRIBUTION_PROFIT_BEFORE_DEADLINE',founderMinuteTarget:0,authority:{mode:'MISSION_SCOPED_EXISTING_GATES_ONLY',newSpendAuthorized:spend===0?false:null,outboundAuthorityInferredFromIntent:false,paymentAuthorityInferredFromDestination:false,rule:'The outcome mission may drive planning, prioritization and already-authorized execution, but never manufactures a channel, customer, payment, credential, spend, deployment or legal authority merely from founder intent.'},businessEffectAuthority:'MISSION_SCOPED_EXISTING_GATES_ONLY',externalEffectAuthority:'MISSION_SCOPED_EXISTING_GATES_ONLY',externalEffectLedger:zeroEffects(),truthBoundary:'This is an active founder outcome contract, not a result. Terminal money requires a reconciled provider-origin observation covering the required terminal instant; silence, stale receipts, sandbox events and internal rows are never zero proof.'};
}

function normalizePaymentObservation({paymentObservation,clearedContributionProfitCents,providerEvidenceRefs,paymentObservationComplete}={}) {
  if(paymentObservation&&typeof paymentObservation==='object'&&!Array.isArray(paymentObservation)){
    const amount=paymentObservation.clearedContributionProfitCents==null?null:Number(paymentObservation.clearedContributionProfitCents);
    const throughAt=asDate(paymentObservation.throughAt); const refs=uniq(paymentObservation.evidenceRefs);
    const environment=text(paymentObservation.environment,40).toUpperCase();
    const nonProduction=['SANDBOX','TEST','FIXTURE','MOCK'].includes(environment)||paymentObservation.testMode===true;
    return {amount:Number.isSafeInteger(amount)&&amount>=0?amount:null,refs,throughAt,providerOrigin:paymentObservation.providerOrigin===true,reconciled:paymentObservation.reconciled===true,independentVerification:paymentObservation.independentVerification===true,evidenceClass:text(paymentObservation.evidenceClass,80).toUpperCase(),nonProduction,structured:true};
  }
  const amount=clearedContributionProfitCents==null?null:Number(clearedContributionProfitCents);
  return {amount:Number.isSafeInteger(amount)&&amount>=0?amount:null,refs:uniq(providerEvidenceRefs),throughAt:null,providerOrigin:paymentObservationComplete===true,reconciled:paymentObservationComplete===true,independentVerification:false,nonProduction:false,structured:false};
}
function paymentTruth(obs, requiredThroughAt) {
  const currentKnown=obs.amount!=null&&obs.providerOrigin&&obs.reconciled&&obs.refs.length>0&&!obs.nonProduction;
  const terminalKnown=currentKnown&&obs.structured&&obs.independentVerification&&obs.evidenceClass==='PROVIDER_ORIGIN_RECONCILIATION'&&obs.throughAt&&obs.throughAt.getTime()>=requiredThroughAt.getTime();
  return {currentKnown,terminalKnown};
}

export function evaluateFounderOutcomeMission({mission,now=new Date(),paymentObservation=null,clearedContributionProfitCents=null,providerEvidenceRefs=[],paymentObservationComplete=false,exhaustionProof=null,cancelled=false}={}) {
  if(!mission?.ok||mission.state!=='ACTIVE'||!mission.missionId)return fail(['active-founder-outcome-mission-required']);
  const observedAt=asDate(now),deadline=asDate(mission.deadlineAt); if(!observedAt||!deadline)return fail(['valid-observation-and-deadline-required']);
  const obs=normalizePaymentObservation({paymentObservation,clearedContributionProfitCents,providerEvidenceRefs,paymentObservationComplete});
  if((paymentObservation?.clearedContributionProfitCents!=null||clearedContributionProfitCents!=null)&&obs.amount==null)return fail(['valid-cleared-profit-cents-required']);
  const before=observedAt.getTime()<deadline.getTime();
  const exhaustionValid=Boolean(exhaustionProof?.complete===true&&Number.isSafeInteger(exhaustionProof?.admissibleBranchCount)&&exhaustionProof.admissibleBranchCount>0&&Array.isArray(exhaustionProof?.proofRefs)&&exhaustionProof.proofRefs.length>0);
  const requiredThrough=before&&exhaustionValid?observedAt:deadline;
  const truth=paymentTruth(obs,requiredThrough);
  const common={ok:true,policyVersion:FOUNDER_OUTCOME_MISSION_VERSION,missionId:mission.missionId,observedAt:observedAt.toISOString(),deadlineAt:deadline.toISOString(),providerEvidenceRefs:obs.refs,paymentObservationThroughAt:obs.throughAt?.toISOString()||null,paymentObservationComplete:truth.terminalKnown,externalEffectLedger:zeroEffects()};
  if(cancelled)return {...common,status:'FOUNDER_OUTCOME_MISSION_CANCELLED',state:'TERMINAL',terminal:true,terminalResultAllowed:truth.terminalKnown,clearedContributionProfitCents:truth.terminalKnown?obs.amount:null,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE'};
  if(before&&!exhaustionValid)return {...common,status:'FOUNDER_OUTCOME_MISSION_ACTIVE',state:'ACTIVE',terminal:false,terminalResultAllowed:false,missionWindowClosed:false,remainingMs:deadline.getTime()-observedAt.getTime(),currentObservedClearedContributionProfitCents:truth.currentKnown?obs.amount:null,paymentObservationComplete:false,businessEffectAuthority:'MISSION_SCOPED_EXISTING_GATES_ONLY',externalEffectAuthority:'MISSION_SCOPED_EXISTING_GATES_ONLY',truthBoundary:'The deadline has not arrived. Current provider-observed profit is current state only. Continue every admissible lane; stale, sandbox or internal evidence cannot terminalize the mission.'};
  if(before&&exhaustionValid&&!truth.terminalKnown)return {...common,status:'FOUNDER_OUTCOME_MISSION_EXHAUSTED_RECONCILIATION_REQUIRED',state:'RECONCILIATION_REQUIRED',terminal:false,terminalResultAllowed:false,missionWindowClosed:true,clearedContributionProfitCents:null,exhaustionProof:{complete:true,admissibleBranchCount:exhaustionProof.admissibleBranchCount,proofRefs:uniq(exhaustionProof.proofRefs)},businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',truthBoundary:'Execution branches are proof-completely exhausted, but terminal money remains unknown until an independently verified provider-origin observation covers the exhaustion instant. Unknown is not zero.'};
  if(before&&exhaustionValid)return {...common,status:'FOUNDER_OUTCOME_MISSION_EXHAUSTED_BEFORE_DEADLINE',state:'TERMINAL',terminal:true,terminalResultAllowed:true,missionWindowClosed:true,clearedContributionProfitCents:obs.amount,paymentObservationComplete:true,exhaustionProof:{complete:true,admissibleBranchCount:exhaustionProof.admissibleBranchCount,proofRefs:uniq(exhaustionProof.proofRefs)},businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',truthBoundary:'Early terminalization is permitted only because branch exhaustion is proved and provider-origin monetary truth independently covers the exhaustion instant.'};
  if(!truth.terminalKnown)return {...common,status:'FOUNDER_OUTCOME_MISSION_DEADLINE_REACHED_RECONCILIATION_REQUIRED',state:'RECONCILIATION_REQUIRED',terminal:false,terminalResultAllowed:false,missionWindowClosed:true,clearedContributionProfitCents:null,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',truthBoundary:'The window is closed but terminal payment truth is not. A terminal amount requires independently verified provider-origin reconciliation through the deadline. Silence, stale evidence, sandbox events and unread provider state are UNKNOWN, never zero.'};
  return {...common,status:'FOUNDER_OUTCOME_MISSION_DEADLINE_REACHED',state:'TERMINAL',terminal:true,terminalResultAllowed:true,missionWindowClosed:true,clearedContributionProfitCents:obs.amount,paymentObservationComplete:true,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',truthBoundary:'The deadline arrived and an independently verified provider-origin payment observation covers the deadline. The terminal amount is bounded to that evidence.'};
}

export function compileFounderEconomicPulsePlan({mission,now=new Date(),zeroMarginalDiscoveryConfigured=false,outboundAuthorization=null,paymentReconciliationAvailable=true}={}) {
  const state=evaluateFounderOutcomeMission({mission,now}); if(!state.ok)return state;
  if(state.terminal)return {ok:true,policyVersion:FOUNDER_OUTCOME_MISSION_VERSION,status:'FOUNDER_ECONOMIC_PULSE_NOT_REQUIRED',missionId:mission.missionId,jobs:[],terminal:true,externalEffectLedger:zeroEffects()};
  if(state.missionWindowClosed)return {ok:true,policyVersion:FOUNDER_OUTCOME_MISSION_VERSION,status:'FOUNDER_ECONOMIC_RECONCILIATION_PULSE_PLAN_READY',missionId:mission.missionId,deadlineAt:mission.deadlineAt,jobs:paymentReconciliationAvailable?[{type:'payment.reconciliation.tick',payload:{limit:20},consequenceClass:'READ_ONLY_EXTERNAL'}]:[],outboundReady:false,reconciliationOnly:true,externalEffectLedger:zeroEffects(),truthBoundary:'The revenue window is closed. New monetization effects stop; payment reconciliation continues until terminal money is actually observed.'};
  const jobs=[{type:'prometheus.commercial.catalog',payload:{},consequenceClass:'LOCAL_PREPARATION'},{type:'prometheus.commercial.tournament',payload:{},consequenceClass:'LOCAL_PREPARATION'},{type:'prometheus.commercial_memory.contradiction_scan',payload:{},consequenceClass:'LOCAL_PREPARATION'},{type:'replies.poll',payload:{},consequenceClass:'READ_ONLY_EXTERNAL'},{type:'monitoring.process',payload:{},consequenceClass:'READ_ONLY_EXTERNAL'}];
  if(paymentReconciliationAvailable)jobs.push({type:'payment.reconciliation.tick',payload:{limit:20},consequenceClass:'READ_ONLY_EXTERNAL'});
  if(zeroMarginalDiscoveryConfigured)jobs.push({type:'discovery.run',payload:{missionId:mission.missionId,zeroMarginalCostOnly:true},consequenceClass:'CONFIGURED_EXTERNAL_READ'});
  const outboundReady=Boolean(outboundAuthorization?.current===true&&text(outboundAuthorization?.channel,200)&&text(outboundAuthorization?.audience,500)&&outboundAuthorization?.senderHealthVerified===true&&outboundAuthorization?.suppressionRecheckRequired===true);
  if(outboundReady)jobs.push({type:'outbound.process',payload:{missionId:mission.missionId,authorityRef:text(outboundAuthorization.authorityRef,1000)||null},consequenceClass:'AUTHORIZED_BUSINESS_OUTBOUND'});
  return {ok:true,policyVersion:FOUNDER_OUTCOME_MISSION_VERSION,status:'FOUNDER_ECONOMIC_PULSE_PLAN_READY',missionId:mission.missionId,deadlineAt:mission.deadlineAt,jobs,outboundReady,reconciliationOnly:false,externalEffectLedger:zeroEffects(),truthBoundary:'This plan drives existing economic machinery. Queuing is not execution; provider, message, payment and delivery effects still need their own receipts.'};
}
