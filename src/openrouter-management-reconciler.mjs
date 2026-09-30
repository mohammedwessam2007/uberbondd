const BASE='https://openrouter.ai/api/v1';
const finite=x=>Number.isFinite(Number(x))&&Number(x)>=0;
const parse=async r=>{const t=await r.text();try{return JSON.parse(t)}catch{return null}};
export function createOpenRouterManagementReconciler({managementKeyProvider,fetchImpl=fetch,baseUrl=BASE}={}){
 if(typeof managementKeyProvider!=='function'||typeof fetchImpl!=='function'||baseUrl!==BASE)throw new Error('management-reconciler-config-required');
 async function auth(){const k=await managementKeyProvider();if(typeof k!=='string'||k.length<16)throw new Error('management-key-required');return `Bearer ${k}`;}
 return {
  async listKeyUsage({expectedLabels=[],rejectUnexpectedActiveKeys=true}={}){
   const r=await fetchImpl(`${baseUrl}/keys`,{headers:{Authorization:await auth()}});
   const b=await parse(r);if(!r.ok||!b)return {ok:false,status:'MANAGEMENT_KEY_USAGE_UNAVAILABLE'};
   const rows=Array.isArray(b.data)?b.data:Array.isArray(b.keys)?b.keys:[];
   const projected=rows.map(x=>({hash:x.hash??x.key_hash??null,label:x.name??x.label??null,limitUsd:finite(x.limit)?Number(x.limit):null,limitReset:x.limit_reset??null,usageMonthlyUsd:finite(x.usage_monthly)?Number(x.usage_monthly):null,disabled:x.disabled===true}));
   const selected=expectedLabels.length?projected.filter(x=>expectedLabels.includes(x.label)):projected;
   const missing=expectedLabels.filter(l=>!selected.some(x=>x.label===l));
   const incomplete=selected.filter(x=>!finite(x.limitUsd)||!finite(x.usageMonthlyUsd)||x.limitReset!=='monthly');
   const unexpectedActiveKeys=projected.filter(x=>!expectedLabels.includes(x.label)&&x.disabled!==true&&(x.limitUsd==null||Number(x.limitUsd)>0));
   const ok=missing.length===0&&incomplete.length===0&&(!rejectUnexpectedActiveKeys||unexpectedActiveKeys.length===0);
   return {ok,status:ok?'KEY_USAGE_RECONCILED':'KEY_USAGE_RECONCILIATION_INCOMPLETE',keys:selected,missingLabels:missing,incompleteLabels:incomplete.map(x=>x.label),unexpectedActiveKeys:unexpectedActiveKeys.map(x=>({hash:x.hash,label:x.label,limitUsd:x.limitUsd,limitReset:x.limitReset})),aggregateLimitUsd:selected.reduce((s,x)=>s+Number(x.limitUsd||0),0),aggregateUsageMonthlyUsd:selected.reduce((s,x)=>s+Number(x.usageMonthlyUsd||0),0),secretsReturned:false};
  }
 };
}
