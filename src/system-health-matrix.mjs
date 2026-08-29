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
 const senderCounts={total:senders.length,paused:senders.filter(s=>s?.paused===true).length,complaintsToday:senders.reduce((a,s)=>a+num(s?.complaintsToday),0),hardBouncesToday:senders.reduce((a,s)=>a+num(s?.hardBouncesToday),0),maxFailureStreak:max(senders.map(s=>num(s?.failureStreak)))};
 const volume={last24h:outbound.reduce((a,r)=>a+num(r?.count),0),peakHourly:max(outbound.map(r=>num(r?.count)))};
 const matrix={observedAt:now.toISOString(),sender:senderCounts,outbound:volume,queue:{pending:num(jobs.pending),leased:num(jobs.leased),failed:num(jobs.failed),deadLetter:num(jobs.deadLetter)},database:{activeConnections:num(db.activeConnections),maxConnections:num(db.maxConnections),connectionUtilizationPct:db.maxConnections?Math.round(num(db.activeConnections)/num(db.maxConnections)*1000)/10:null},egress:{healthy:num(egress.healthy),degraded:num(egress.degraded),quarantined:num(egress.quarantined)},truthLaw:'TELEMETRY_IS_OPERATIONAL_OBSERVATION; IT_DOES_NOT_CREATE_PAYMENT_DELIVERY_ACCEPTANCE_OR_AUTHORITY'};
 const severe=matrix.queue.deadLetter>0||senderCounts.paused>0||(matrix.database.connectionUtilizationPct!==null&&matrix.database.connectionUtilizationPct>=90);
 return {ok:true,policyVersion:SYSTEM_HEALTH_MATRIX_POLICY_VERSION,status:severe?'DEGRADED':'HEALTHY',matrix,businessEffectAuthority:'NONE'};
}
