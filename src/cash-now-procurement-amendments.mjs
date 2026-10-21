// Cash Now prototype B: bilingual public-notice delta from permitted externally supplied records.
// Does not fetch, translate, authenticate source origin, or submit procurement bids.
import crypto from 'node:crypto';
const hash = x => crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const fail = code => ({ok:false,status:'ABSTAIN',code,evidenceClass:'UNVERIFIED_LOCAL_SOURCE',deltas:[]});
const iso = s => typeof s==='string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(s) && Number.isFinite(Date.parse(s));
const text = x => typeof x === 'string' && x.trim().length>0;
function valid(n) {return n && text(n.noticeId) && text(n.sourceUrl) && /^https:\/\//.test(n.sourceUrl) && iso(n.observedAt) && iso(n.deadlineAt) && Array.isArray(n.requirements) && n.requirements.every(r=>text(r.id) && ['ar','en'].includes(r.locale) && text(r.body)) && (n.budget===null || n.budget===undefined || (Number.isSafeInteger(n.budget.minorUnits) && n.budget.minorUnits>=0 && /^[A-Z]{3}$/.test(n.budget.currency)));}
export function compareProcurementNotices(before, after) {
  if (!valid(before)||!valid(after)) return fail('INVALID_NOTICE_FORMAT');
  if (before.noticeId!==after.noticeId) return fail('DIFFERENT_NOTICE_ID');
  if (Date.parse(after.observedAt)<=Date.parse(before.observedAt)) return fail('NON_FORWARD_OBSERVATIONS');
  const deltas=[];const push=(field,oldValue,newValue)=>deltas.push({field,oldValue,newValue});
  if (before.deadlineAt!==after.deadlineAt) push('deadlineAt',before.deadlineAt,after.deadlineAt);
  if (JSON.stringify(before.budget??null)!==JSON.stringify(after.budget??null)) push('budget',before.budget??null,after.budget??null);
  const prev=new Map(before.requirements.map(r=>[`${r.id}:${r.locale}`,r.body]));
  const next=new Map(after.requirements.map(r=>[`${r.id}:${r.locale}`,r.body]));
  if(prev.size!==before.requirements.length||next.size!==after.requirements.length) return fail('DUPLICATE_REQUIREMENT_KEY');
  for(const [key,value] of prev) if(!next.has(key)) push(`requirement:${key}`,value,null); else if(next.get(key)!==value) push(`requirement:${key}`,value,next.get(key));
  for(const [key,value] of next) if(!prev.has(key)) push(`requirement:${key}`,null,value);
  deltas.sort((a,b)=>a.field.localeCompare(b.field));
  return {ok:true,status:'UNVERIFIED_SOURCE_DELTA',noticeId:before.noticeId,firstDigest:hash(before),secondDigest:hash(after),sourceUrls:[before.sourceUrl,after.sourceUrl],evidenceClass:'USER_SUPPLIED_NOT_PUBLISHER_AUTHENTICATED',deltas,requiresHumanSourceValidation:true,translationPerformed:false,financialTransactionPerformed:false};
}
