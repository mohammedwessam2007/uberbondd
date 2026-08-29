export const SYSTEM_HEALTH_MATRIX_POLICY_VERSION='uberbond.system-health-matrix.v1';
const num=(v)=>Number.isFinite(Number(v))?Number(v):0;
const max=(arr)=>arr.length?Math.max(...arr):0;

export function compileSystemHealthMatrix(input={}){
 const now=new Date(input.now||Date.now());
 if(!Number.isFinite(now.getTime())) return {ok:false,policyVersion:SYSTEM_HEALTH_MATRIX_POLICY_VERSION,status:'BLOCKED',reasonCodes:['valid-now-required']};
 const senders=Array.isArray(input.senderHealth)?input.senderHealth:[];
 const outbound=Array.isArray(input.hourlyOutbound)?input.hourlyOutbound:[];
 const db=input.database||{};
 const jobs=input.jobs||{};
 const egress=input.egress||{};
 const billing=input.billing&&typeof input.billing==='object'?input.billing:null;
 const senderCounts={total:senders.length,paused:senders.filter(s=>s?.paused===true).length,complaintsToday:senders.reduce((a,s)=>a+num(s?.complaintsToday),0),hardBouncesToday:senders.reduce((a,s)=>a+num(s?.hardBouncesToday),0),maxFailureStreak:max(senders.map(s=>num(s?.failureStreak)))};
 const volume={last24h:outbound.reduce((a,r)=>a+num(r?.count),0),peakHourly:max(outbound.map(r=>num(r?.count)))};
 // Billing evidence backlog.
 //
 // Deliberately four states, not a number, because the honest answers differ:
 //
 //   NOT_OBSERVED       the query returned nothing at all -- not the same as zero
 //   NO_WORKER          evidence is waiting and nothing has EVER claimed a row.
 //                      Nothing in this tree calls claimBillingEvents, so this is
 //                      the true state today. Reporting it as "pending" would
 //                      describe a worker that is behind, and there is no worker.
 //   BACKLOG_AGEING     a worker exists and unsettled evidence is older than the
 //                      threshold
 //   HEALTHY            nothing unsettled, or nothing older than the threshold
 //
 // A webhook row is verified provider evidence. Silently accumulating it is the
 // failure mode worth surfacing: the money question stays unanswered and nobody
 // is told.
 const billingBlock=(()=>{
  if(!billing) return {state:'NOT_OBSERVED',reasonCodes:['billing-backlog-not-observed']};
  const awaitingClaim=num(billing.awaitingClaim);
  const claimed=num(billing.claimed);
  const uncertain=num(billing.uncertain);
  const unsettled=awaitingClaim+claimed+uncertain;
  const everClaimed=num(billing.everClaimed);
  const oldest=billing.oldestUnsettledAt?new Date(billing.oldestUnsettledAt):null;
  const ageMinutes=oldest&&Number.isFinite(oldest.getTime())?Math.max(0,Math.round((now.getTime()-oldest.getTime())/60000)):null;
  const thresholdMinutes=Number.isFinite(Number(input.billingBacklogMinutes))?Number(input.billingBacklogMinutes):60;
  const counts={awaitingClaim,claimed,uncertain,settled:num(billing.settled),failed:num(billing.failed),unsettled,oldestUnsettledAgeMinutes:ageMinutes,thresholdMinutes};
  if(unsettled>0&&everClaimed===0) return {...counts,state:'NO_WORKER',reasonCodes:['billing-evidence-waiting-and-never-claimed']};
  if(unsettled>0&&ageMinutes!==null&&ageMinutes>=thresholdMinutes) return {...counts,state:'BACKLOG_AGEING',reasonCodes:['billing-evidence-unsettled-past-threshold']};
  return {...counts,state:'HEALTHY',reasonCodes:[]};
 })();
 const matrix={observedAt:now.toISOString(),sender:senderCounts,outbound:volume,queue:{pending:num(jobs.pending),leased:num(jobs.leased),failed:num(jobs.failed),deadLetter:num(jobs.deadLetter)},database:{activeConnections:num(db.activeConnections),maxConnections:num(db.maxConnections),connectionUtilizationPct:db.maxConnections?Math.round(num(db.activeConnections)/num(db.maxConnections)*1000)/10:null},egress:{healthy:num(egress.healthy),degraded:num(egress.degraded),quarantined:num(egress.quarantined)},billing:billingBlock,truthLaw:'TELEMETRY_IS_OPERATIONAL_OBSERVATION; IT_DOES_NOT_CREATE_PAYMENT_DELIVERY_ACCEPTANCE_OR_AUTHORITY'};
 // A billing backlog with no worker, or one ageing past the threshold, is a
 // degraded system. NOT_OBSERVED is not degraded and not healthy either --
 // it is reported as its own state rather than being counted as either.
 const billingSevere=billingBlock.state==='NO_WORKER'||billingBlock.state==='BACKLOG_AGEING';
 const severe=matrix.queue.deadLetter>0||senderCounts.paused>0||billingSevere||(matrix.database.connectionUtilizationPct!==null&&matrix.database.connectionUtilizationPct>=90);
 return {ok:true,policyVersion:SYSTEM_HEALTH_MATRIX_POLICY_VERSION,status:severe?'DEGRADED':'HEALTHY',matrix,businessEffectAuthority:'NONE'};
}
