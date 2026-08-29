export const DATABASE_HYGIENE_POLICY_VERSION='uberbond.database-hygiene-maintenance.v1';
const ALLOWED_CLASSES=new Set(['TRANSIENT_BROWSER_ARTIFACT','TRANSIENT_JOB_LOG','DEAD_LETTER_DEBUG_PAYLOAD','STAGED_CONTENT_EXPIRED','PUBLIC_EVIDENCE_CACHE_EXPIRED']);
const NEVER_AUTODELETE=new Set(['PAYMENT_RECEIPT','CUSTOMER_ACCEPTANCE','AUTHORITY_RECEIPT','AUDIT_SECURITY_EVENT','REFUND_DISPUTE','RENEWAL_RECEIPT']);
const clamp=(n,min,max)=>Math.max(min,Math.min(max,Number(n)||0));

export function compileMaintenancePlan(input={}){
 const now=new Date(input.now||Date.now());
 if(!Number.isFinite(now.getTime())) return {ok:false,policyVersion:DATABASE_HYGIENE_POLICY_VERSION,status:'BLOCKED',reasonCodes:['valid-now-required']};
 const rules=Array.isArray(input.rules)?input.rules:[];
 const actions=[]; const reasons=[];
 for(const [index,r] of rules.entries()){
   const dataClass=String(r?.dataClass||'').toUpperCase();
   if(NEVER_AUTODELETE.has(dataClass)){reasons.push(`protected-record-class-cannot-auto-delete:${index}`);continue;}
   if(!ALLOWED_CLASSES.has(dataClass)){reasons.push(`unsupported-retention-class:${index}`);continue;}
   const retentionDays=clamp(r?.retentionDays,1,365);
   const batchSize=clamp(r?.batchSize||500,1,5000);
   actions.push({dataClass,retentionDays,batchSize,cutoff:new Date(now.getTime()-retentionDays*86400000).toISOString(),mode:'BOUNDED_DELETE_OR_EXTERNAL_ARCHIVE'});
 }
 if(reasons.length) return {ok:false,policyVersion:DATABASE_HYGIENE_POLICY_VERSION,status:'BLOCKED',reasonCodes:[...new Set(reasons)],businessEffectAuthority:'NONE'};
 return {ok:true,policyVersion:DATABASE_HYGIENE_POLICY_VERSION,status:'MAINTENANCE_PLAN_PREPARED',plan:{actions,vacuumLaw:'RELY_ON_POSTGRES_AUTOVACUUM_FOR_ROUTINE_MAINTENANCE; DO_NOT_RUN_VACUUM_FULL_IN_SERVERLESS_CRON',archiveLaw:'DO_NOT_RECOMPRESS_LARGE_LOGS_BACK_INTO_PRIMARY_POSTGRES; USE_EXTERNAL_OBJECT_ARCHIVE_ONLY_IF_CONFIGURED_AND_ECONOMIC',screenshotLaw:'STORE_REFERENCES_AND_RETENTION_METADATA; DELETE_EXPIRED_TRANSIENT_SCREENSHOTS_FROM THEIR ARTIFACT STORE'},businessEffectAuthority:'NONE'};
}
