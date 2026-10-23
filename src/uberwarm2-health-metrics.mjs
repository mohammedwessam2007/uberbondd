// Provider-reported metrics only. Never grants send readiness or stores identities/secrets.
import { createHash } from 'node:crypto';
const metric = /^(health|health_score|healthScore|score|spam_rate|spamRate|spam_rate_7d|inbox_rate|inboxRate|inboxPlacement|sent|received|replied|replies|rescued|errors|daily_target|dailyTarget|daily_cap|dailyCap|warmup_day|warmupDay|target|sentToday|receivedToday)$/;
const group = /^(health|today|last7|last7Days|last_7_days|stats|warmup|metrics)$/;
export const mailboxDigest = email => 'sha256:' + createHash('sha256').update(email).digest('hex');
export function extractHealthMetrics(row, prefix='', depth=0) {
  const out={};
  if (!row || typeof row!=='object' || Array.isArray(row) || depth>3) return out;
  for (const [key,value] of Object.entries(row)) {
    if (metric.test(key) && typeof value==='number' && Number.isFinite(value) && value>=0 && value<=Number.MAX_SAFE_INTEGER) out[prefix+key]=value;
    else if(group.test(key)) Object.assign(out,extractHealthMetrics(value,prefix+key+'.',depth+1));
  }
  return out;
}
export function compileMailboxHealth(rows) {
  if (!Array.isArray(rows) || rows.length>53) return [];
  const seen=new Set();
  return rows.flatMap(row=>{
    if(!/^sha256:[a-f0-9]{64}$/.test(row?.mailboxDigest||'') || seen.has(row.mailboxDigest)) return [];
    seen.add(row.mailboxDigest);
    const metrics={};
    for(const [path,value] of Object.entries(row.metrics||{})) {
      const keys=path.split('.');
      if(keys.length<=5 && keys.slice(0,-1).every(k=>group.test(k)) && metric.test(keys.at(-1)) && typeof value==='number' && Number.isFinite(value) && value>=0 && value<=Number.MAX_SAFE_INTEGER) metrics[path]=value;
    }
    return [{mailboxDigest:row.mailboxDigest,metrics,source:'PROVIDER_REPORTED',
      interpretation:'PROVIDER_FIELD_NAMES_AND_UNITS__NOT_ROLLING_24H',independentPlacementVerified:false}];
  });
}

// Deltas compare identical provider fields; never relabel them as complete 24h counts.
export function compareMailboxHealth(current, previous) {
  const before=new Map(compileMailboxHealth(previous).map(row=>[row.mailboxDigest,row]));
  return compileMailboxHealth(current).map(row=>{
    const prior=before.get(row.mailboxDigest);const changes={};
    for(const [key,value] of Object.entries(row.metrics)) {
      if(typeof prior?.metrics[key]==='number') changes[key]=value-prior.metrics[key];
    }
    return {mailboxDigest:row.mailboxDigest,baselineAvailable:!!prior,changes};
  });
}
