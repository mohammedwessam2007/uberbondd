import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const UBERSKILLS_CORE_VERSION='uberbond.uberskills-core.v1';
const EFFECTS=new Set(['NONE','READ_ONLY_NETWORK','LOCAL_WRITE','MESSAGE']);
const DATA=new Set(['PUBLIC','INTERNAL_NON_SECRET','SOURCE_CODE','FOUNDER_PRIVATE','CUSTOMER_AUTHORIZED']);
const zero=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
const text=(v,m=1200)=>{const s=String(v??'').trim();return s&&s.length<=m?s:null;};
const integer=(v,a=0,b=1e9)=>{const n=Number(v);return Number.isSafeInteger(n)&&n>=a&&n<=b?n:null;};
const sha=v=>`sha256:${crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex')}`;
const fail=(reasonCodes,extra={})=>({ok:false,status:'UBERSKILL_ATOM_BLOCKED',reasonCodes:[...new Set(reasonCodes.filter(Boolean))],businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero(),...extra});

export const UBERSKILL_ATOMS=Object.freeze({
 'web.crawl':{effect:'READ_ONLY_NETWORK'},'web.render-js':{effect:'READ_ONLY_NETWORK'},'data.extract-structured':{effect:'NONE'},'http.retry':{effect:'READ_ONLY_NETWORK'},'contact.validate-email':{effect:'READ_ONLY_NETWORK'},'buyer.classify-intent':{effect:'NONE'},'code.search':{effect:'NONE'},'cloud.inspect-deployment':{effect:'READ_ONLY_NETWORK'},'database.query-postgres':{effect:'READ_ONLY_NETWORK'},'document.generate-spreadsheet':{effect:'LOCAL_WRITE'},'messaging.send-authorized-email':{effect:'MESSAGE'},'payment.verify-cleared':{effect:'READ_ONLY_NETWORK'},'invoice.parse':{effect:'NONE'},'document.summarize':{effect:'NONE'},'model.route-request':{effect:'READ_ONLY_NETWORK'},'context.compress-reversible':{effect:'NONE'},'memory.recover-session':{effect:'NONE'},'sandbox.run-test':{effect:'LOCAL_WRITE'},'code.evaluate-generated':{effect:'LOCAL_WRITE'},'capability.discover':{effect:'READ_ONLY_NETWORK'},'capability.dedupe':{effect:'NONE'},'capability.security-admit':{effect:'NONE'},'capability.retrieve':{effect:'NONE'},'capability.benchmark':{effect:'LOCAL_WRITE'},'capability.revoke':{effect:'NONE'}
});

export function getUberSkillAtomSpec(atomId){const id=text(atomId,120);const spec=id&&UBERSKILL_ATOMS[id];return spec?{id,effect:spec.effect}:null;}

function normalizeAdapter(raw,atom,dataClass){
 const adapterId=text(raw?.adapterId,160),provider=text(raw?.provider,120)?.toLowerCase(),evidenceRef=text(raw?.evidenceRef,1000),observedAt=text(raw?.observedAt,100);
 const atomIds=[...new Set((Array.isArray(raw?.atomIds)?raw.atomIds:[]).map(v=>text(v,120)).filter(Boolean))];
 const allowedDataClasses=[...new Set((Array.isArray(raw?.allowedDataClasses)?raw.allowedDataClasses:[]).map(v=>text(v,80)?.toUpperCase()).filter(v=>DATA.has(v)))];
 const effectClass=text(raw?.effectClass,80)?.toUpperCase();
 const reasons=[];
 if(!adapterId||!provider||!evidenceRef||!observedAt||!Number.isFinite(Date.parse(observedAt)))reasons.push('adapter-identity-provenance-required');
 if(raw?.callable!==true)reasons.push('adapter-callability-required');
 if(!atomIds.includes(atom.id))reasons.push('adapter-atom-binding-required');
 if(effectClass!==atom.effect)reasons.push('adapter-effect-class-mismatch');
 if(!allowedDataClasses.includes(dataClass))reasons.push('adapter-data-class-not-permitted');
 if(raw?.policyAuthority===true||raw?.effectAuthority===true||raw?.founderAuthority===true)reasons.push('adapter-authority-claim-prohibited');
 if('secret' in (raw||{})||'token' in (raw||{})||'apiKey' in (raw||{})||'password' in (raw||{}))reasons.push('secret-bearing-adapter-profile-prohibited');
 return reasons.length?{ok:false,reasonCodes:reasons}:{ok:true,adapter:{adapterId,provider,evidenceRef,observedAt:new Date(observedAt).toISOString(),atomIds,allowedDataClasses,effectClass}};
}

function validateEffectContext(atom,input={},authority={}){
 const reasons=[];
 if(atom.effect==='READ_ONLY_NETWORK'){
   if(!text(input.networkPolicyRef,1000)||!text(input.allowedTargetRef,1000))reasons.push('read-only-network-policy-and-target-required');
   if(input.method&&String(input.method).toUpperCase()!=='GET'&&atom.id!=='model.route-request'&&atom.id!=='database.query-postgres')reasons.push('read-only-network-method-required');
 }
 if(atom.effect==='LOCAL_WRITE'){
   if(!text(input.sandboxRef,1000)||!text(input.rollbackRef,1000))reasons.push('sandbox-and-rollback-reference-required');
   const maxWrites=integer(input.maxWrites??1,1,1000);if(maxWrites==null)reasons.push('bounded-local-write-count-required');
 }
 if(atom.effect==='MESSAGE'){
   if(authority?.allowed!==true||String(authority?.kind||'').toUpperCase()!=='MESSAGE_SEND')reasons.push('message-send-authority-required');
   for(const key of ['consentRef','suppressionRef','recipientScopeRef','authorityRef'])if(!text(authority?.[key],1000))reasons.push(`${key.replace(/[A-Z]/g,m=>'-'+m.toLowerCase())}-required`);
   const expires=Date.parse(authority?.expiresAt||''); if(!Number.isFinite(expires)||expires<=Date.now())reasons.push('fresh-message-authority-expiry-required');
 }
 if(atom.id==='payment.verify-cleared'&&!text(input.providerEvidenceRef,1000))reasons.push('provider-origin-payment-evidence-ref-required');
 if(atom.id==='database.query-postgres'&&String(input.queryClass||'').toUpperCase()!=='READ_ONLY')reasons.push('read-only-query-class-required');
 if(atom.id==='model.route-request'&&!text(input.expectedIdentityRef,1000))reasons.push('expected-model-identity-ref-required');
 if(atom.id==='context.compress-reversible'&&!text(input.authoritativeOriginalRef,1000))reasons.push('authoritative-original-ref-required');
 if(atom.id==='memory.recover-session'&&!text(input.repositoryTruthRef,1000))reasons.push('repository-truth-ref-required');
 return reasons;
}

export function compileUberSkillAtomPlan({atomId,inputRef,input={},dataClass='INTERNAL_NON_SECRET',adapters=[],authority={}}={}){
 const atom=getUberSkillAtomSpec(atomId); if(!atom)return fail(['recognized-capability-atom-required']);
 const ref=text(inputRef,1000),klass=text(dataClass,80)?.toUpperCase(); if(!ref||!DATA.has(klass))return fail(['input-ref-and-recognized-data-class-required']);
 if(!EFFECTS.has(atom.effect))return fail(['recognized-effect-class-required']);
 const normalized=(Array.isArray(adapters)?adapters:[]).map(raw=>normalizeAdapter(raw,atom,klass));
 const invalid=normalized.filter(x=>!x.ok); if(invalid.length)return fail(['invalid-adapter-profile'],{adapterErrors:invalid.map(x=>x.reasonCodes)});
 const admitted=normalized.filter(x=>x.ok).map(x=>x.adapter);
 const reasons=validateEffectContext(atom,input,authority);
 let adapter=null;
 if(atom.effect!=='NONE'){
   adapter=admitted.sort((a,b)=>a.adapterId.localeCompare(b.adapterId))[0]||null;
   if(!adapter)reasons.push('admitted-callable-adapter-required');
 }
 if(reasons.length)return fail(reasons,{atomId:atom.id,effectClass:atom.effect});
 const plan={schemaVersion:'uberbond.uberskill-atom-plan.v1',atomId:atom.id,effectClass:atom.effect,inputRef:ref,dataClass:klass,adapter,executionMode:atom.effect==='NONE'?'UBERBOND_NATIVE_PURE':'ADMITTED_REPLACEABLE_ADAPTER',effectContext:{networkPolicyRef:text(input.networkPolicyRef,1000),allowedTargetRef:text(input.allowedTargetRef,1000),sandboxRef:text(input.sandboxRef,1000),rollbackRef:text(input.rollbackRef,1000),providerEvidenceRef:text(input.providerEvidenceRef,1000),expectedIdentityRef:text(input.expectedIdentityRef,1000),authoritativeOriginalRef:text(input.authoritativeOriginalRef,1000),repositoryTruthRef:text(input.repositoryTruthRef,1000)},authorityBoundary:atom.effect==='MESSAGE'?'EXPLICIT_MESSAGE_AUTHORITY_REQUIRED':'NO_EXTERNAL_EFFECT_AUTHORITY_CREATED_BY_PLAN',businessEffectAuthority:'NONE',externalEffectAuthority:'NONE'};
 return {ok:true,status:'UBERSKILL_ATOM_PLAN_READY',plan,planDigest:sha(plan),businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero()};
}

export async function executeUberSkillAtom({planResult,executor}={}){
 if(!planResult?.ok||!planResult.plan||!planResult.planDigest||sha(planResult.plan)!==planResult.planDigest)return fail(['verified-uberskill-plan-required']);
 if(typeof executor!=='function')return fail(['executor-required']);
 const expected=planResult.plan.adapter?.adapterId||'UBERBOND_NATIVE_PURE';
 if(text(executor.adapterId,160)!==expected)return fail(['executor-adapter-identity-mismatch']);
 const raw=await executor(structuredClone(planResult.plan));
 if(!raw||raw.ok!==true||!text(raw.resultRef,1000))return fail(['successful-result-ref-required']);
 if(raw.authorityGranted===true||raw.policyAuthority===true)return fail(['executor-authority-escalation-prohibited']);
 const receipt={schemaVersion:'uberbond.uberskill-execution-receipt.v1',atomId:planResult.plan.atomId,planDigest:planResult.planDigest,adapterId:expected,resultRef:text(raw.resultRef,1000),observedEffectClass:text(raw.observedEffectClass,80)?.toUpperCase()||planResult.plan.effectClass,observedAt:new Date().toISOString(),businessEffectAuthority:'NONE',externalEffectAuthority:'NONE'};
 if(receipt.observedEffectClass!==planResult.plan.effectClass)return fail(['observed-effect-class-mismatch']);
 return {ok:true,status:'UBERSKILL_ATOM_EXECUTED_WITH_BOUND_RECEIPT',receipt,receiptDigest:sha(receipt),businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero()};
}

export const UBERSKILL_ATOM_IDS=Object.freeze(Object.keys(UBERSKILL_ATOMS));
export const UBERSKILL_TRUTH_BOUNDARY='UBERSKILLS OWNS CAPABILITY SEMANTICS, ADMISSION, AUTHORITY ATTENUATION AND RECEIPTS. PROVIDERS ARE REPLACEABLE EFFECTORS. SOURCE READINESS DOES NOT PROVE A LIVE PROVIDER, ACCOUNT, CUSTOMER, PAYMENT OR EXTERNAL EFFECT.';
