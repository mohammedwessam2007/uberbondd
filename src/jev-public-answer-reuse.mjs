import crypto from 'node:crypto';

const KEY='ubermindJevPublicAnswerReuseV1',MAX=64,TTL_MS=600_000;
const sha=x=>'sha256:'+crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const digest=x=>typeof x==='string'&&/^(sha256:)?[0-9a-f]{64}$/.test(x);
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const fail=reason=>({ok:false,status:'JEV_PUBLIC_REUSE_REFUSED',reason,
  providerCallsPerformed:0,semanticAuthority:'NONE',crownSuppressionAuthority:'NONE'});

/**
 * Scope-bound reuse of an existing VALIDATED public Jev decision.
 * This is an optimization for an exactly identical advisory request, NOT
 * a freshly observed quality decision, model equivalence, or paid baseline.
 */
export function createJevPublicAnswerReuse({store,route,paidAuthorization,clock=Date.now}={}){
 if(typeof store?.transaction!=='function'||!route||typeof clock!=='function')
   throw new Error('protected-store-and-route-required');
 function identity(input){
   const {scope,state,questions,inputTokenCeiling}=input??{};
   if(!obj(scope)||Object.keys(scope).length!==7||
     scope.dataClass!=='PUBLIC'||
     !['IMMUTABLE','DEPENDENCY_BOUND'].includes(scope.freshnessClass)||
     scope.sideEffectClass!=='NONE'||!digest(scope.sourceDigest)||
     !digest(scope.qualityContractHash)||
     typeof scope.tenantId!=='string'||!scope.tenantId||
     typeof scope.credentialScopeId!=='string'||!scope.credentialScopeId||
     !obj(state)||!obj(questions)||!Object.keys(questions).length||
     !Number.isSafeInteger(inputTokenCeiling)||inputTokenCeiling<1||
     inputTokenCeiling>32000)
     return null;
   const now=clock(),expiry=Date.parse(route.expiresAt);
   if(!paidAuthorization?.evidenceRef||paidAuthorization.month!==new Date(now).toISOString().slice(0,7)||
      !Number.isFinite(Date.parse(paidAuthorization.expiresAt))||
      Date.parse(paidAuthorization.expiresAt)<=now)return null;
   if(!Number.isFinite(expiry)||now>=expiry||now<Date.parse(route.verifiedAt))return null;
   const routeIdentity={model:route.model,provider:route.provider,
      modelRevision:route.modelRevision??null,sourceRef:route.sourceRef,
      verifiedAt:route.verifiedAt,expiresAt:route.expiresAt,
      inputUsdPerMillion:route.inputUsdPerMillion,
      outputUsdPerMillion:route.outputUsdPerMillion};
   const binding={scope,state,questions,inputTokenCeiling,routeIdentity};
   const key=sha(binding);
   return {key,binding,now,expiresAt:Math.min(now+TTL_MS,expiry)};
 }
 async function read(input){
   const x=identity(input);
   if(!x)return {ok:true,status:'JEV_PUBLIC_REUSE_INELIGIBLE',result:null};
   return store.transaction(async tx=>{
     const s=await tx.getSettings(),items=s[KEY]?.items??{};
     if(!obj(items))return fail('poisoned-reuse-ledger');
     const row=items[x.key];
     if(!row)return {ok:true,status:'JEV_PUBLIC_REUSE_MISS',result:null};
     if(Number.isFinite(row.expiresAt)&&row.expiresAt<=x.now)
       return {ok:true,status:'JEV_PUBLIC_REUSE_EXPIRED_REVALIDATION_REQUIRED',result:null};
     if(row.key!==x.key||row.bindingDigest!==sha(x.binding)||
       !Number.isFinite(row.cachedAt)||row.cachedAt>x.now||
       !Number.isFinite(row.expiresAt)||row.expiresAt<=x.now||
       row.expiresAt>x.expiresAt+TTL_MS||
       !obj(row.answers)||!Object.keys(row.answers).length||
       !digest(row.answerDigest)||row.answerDigest!==sha(row.answers)||
       !Number.isSafeInteger(row.originalObservedCostMicrousd)||
       row.originalObservedCostMicrousd<0||
       typeof row.providerRequestId!=='string'||!row.providerRequestId)
       return fail('cached-public-answer-integrity-or-expiry');
     return {ok:true,status:'JEV_PUBLIC_EXACT_PRIOR_ANSWER_REUSED',
       result:{ok:true,status:'JEV_PUBLIC_EXACT_PRIOR_ANSWER_REUSED',
         proposal:{answers:structuredClone(row.answers)},
         providerRequestId:row.providerRequestId,
         observedModelRevision:row.observedModelRevision??null,
         upstreamProvider:row.upstreamProvider??null,
         observedCostMicrousd:0,
         originalObservedCostMicrousd:row.originalObservedCostMicrousd,
         providerCallsPerformed:0,reusedPriorAnswer:true,
         priorAnswerDigest:row.answerDigest,
         semanticAuthority:'NONE',crownSuppressionAuthority:'NONE',
         externalEffectAuthority:'NONE',
         independentFrontierQualitySampleAdded:false,
         empiricalMultiplier:null}};
   });
 }
 async function record(input,result){
   const x=identity(input);
   if(!x)return {ok:true,status:'PUBLIC_REUSE_RECORD_INELIGIBLE',recorded:false};
   if(result?.ok!==true||result.providerCallsPerformed!==1||
     !obj(result.proposal?.answers)||
     !Number.isSafeInteger(result.observedCostMicrousd)||
     result.observedCostMicrousd<0||
     typeof result.providerRequestId!=='string'||!result.providerRequestId)
      return fail('provider-billed-complete-answer-required');
   const answers=structuredClone(result.proposal.answers);
   if(Buffer.byteLength(JSON.stringify(answers))>32000)
     return fail('bounded-advisory-answer-required');
   return store.transaction(async tx=>{
     if(tx.transactionClient===true)await tx.pool.query(
       'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
       ['setting:'+KEY]);
     const settings=await tx.getSettings();
     const old=settings[KEY]?.items??{};
     if(!obj(old))return fail('poisoned-reuse-ledger');
     const items={...old};
     const row={key:x.key,bindingDigest:sha(x.binding),
       cachedAt:x.now,expiresAt:x.expiresAt,
       answers,answerDigest:sha(answers),
       providerRequestId:result.providerRequestId,
       originalObservedCostMicrousd:result.observedCostMicrousd,
       observedModelRevision:result.observedModelRevision??null,
       upstreamProvider:result.upstreamProvider??null};
     if(items[x.key]){
       if(items[x.key].answerDigest!==row.answerDigest||
         items[x.key].providerRequestId!==row.providerRequestId)
         return fail('conflicting-billed-answer-must-not-overwrite');
       return {ok:true,status:'PUBLIC_REUSE_ALREADY_RECORDED',recorded:false};
     }
     items[x.key]=row;
     const list=Object.values(items).filter(v=>Number.isFinite(v?.expiresAt)&&v.expiresAt>x.now)
       .sort((a,b)=>a.cachedAt-b.cachedAt);
     while(list.length>MAX)list.shift();
     await tx.setSetting(KEY,{schemaVersion:'uberbond.jev-public-answer-reuse.v1',
       items:Object.fromEntries(list.map(v=>[v.key,v]))});
     return {ok:true,status:'VALIDATED_PUBLIC_ANSWER_REUSE_RECORDED',recorded:true};
   });
 }
 return {read,record,ttlMs:TTL_MS,maxEntries:MAX};
}
