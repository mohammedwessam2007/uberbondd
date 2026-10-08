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

 // Durable, transaction-locked claim comes BEFORE any paid model dispatch.
 // A second process may never buy the same exact public decision while one
 // claim is pending. A crash after claim stays HELD (not a retry trigger).
 async function claim(input,operationId){
   const x=identity(input);
   if(!x)return {ok:true,status:'JEV_PUBLIC_CLAIM_INELIGIBLE',claimed:false};
   if(typeof operationId!=='string'||!/^[A-Za-z0-9_.:-]{1,180}$/.test(operationId))
     return fail('bounded-operation-identity-required');
   return store.transaction(async tx=>{
     if(tx.transactionClient===true)await tx.pool.query(
       'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',['setting:'+KEY]);
     const settings=await tx.getSettings(),ledger=settings[KEY]??{};
     const items=ledger.items??{},pending=ledger.pending??{};
     if(!obj(items)||!obj(pending))return fail('invalid-protected-singleflight-ledger');
     const existing=items[x.key];
     if(existing&&existing.expiresAt>x.now)
       return {ok:true,status:'JEV_PUBLIC_PRIOR_RESULT_ALREADY_AVAILABLE',claimed:false,recheck:true};
     if(pending[x.key])
       return {ok:false,status:'JEV_PUBLIC_EXACT_REQUEST_ALREADY_IN_FLIGHT_OR_UNCERTAIN',
         reason:'durable-claim-exists-no-automatic-retry',providerCallsPerformed:0,
         semanticAuthority:'NONE',crownSuppressionAuthority:'NONE'};
     if(Object.keys(pending).length>=64)return fail('too-many-unreconciled-public-dispatches');
     const next={...pending,[x.key]:{key:x.key,
       bindingDigest:sha(x.binding),operationId,
       nativeCallId:'jev-shadow-call-'+sha({operationId,state:input.state,questions:input.questions,inputTokenCeiling:input.inputTokenCeiling}).slice(7,31),
       claimedAt:x.now,status:'CLAIMED_BEFORE_PROVIDER_EFFECT'}};
     await tx.setSetting(KEY,{schemaVersion:'uberbond.jev-public-answer-reuse.v1',
       ...ledger,items,pending:next});
     return {ok:true,status:'JEV_PUBLIC_DURABLE_DISPATCH_CLAIMED',
       claimed:true,providerCallsPerformed:0};
   });
 }
 // Only a caller with a recorded zero-call outcome may release the claim.
 // A dispatched/uncertain bill remains held for explicit reconciliation.
 async function releaseUncalled(input,operationId){
   const x=identity(input);
   if(!x)return {ok:true,released:false,status:'JEV_PUBLIC_NOT_CLAIMED'};
   return store.transaction(async tx=>{
     if(tx.transactionClient===true)await tx.pool.query(
       'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',['setting:'+KEY]);
     const settings=await tx.getSettings(),ledger=settings[KEY]??{},pending=ledger.pending??{};
     if(!obj(pending))return fail('invalid-protected-singleflight-ledger');
     const claim=pending[x.key];
     if(!claim)return {ok:true,released:false,status:'JEV_PUBLIC_CLAIM_ALREADY_ABSENT'};
     if(claim.operationId!==operationId||claim.bindingDigest!==sha(x.binding))
       return fail('claim-release-identity-mismatch');
     const next={...pending};delete next[x.key];
     await tx.setSetting(KEY,{schemaVersion:'uberbond.jev-public-answer-reuse.v1',
       ...ledger,pending:next});
     return {ok:true,released:true,status:'JEV_PUBLIC_PROVEN_UNCALLED_RELEASED'};
   });
 }
 async function record(input,result,operationId=null){
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
     const pending=settings[KEY]?.pending??{};
     if(!obj(pending))return fail('invalid-protected-pending-claims');
     const claimed=pending[x.key]??null;
     if(claimed&&(claimed.operationId!==operationId||claimed.bindingDigest!==sha(x.binding)))
       return fail('billed-result-not-owner-of-protected-claim');

     const row={key:x.key,bindingDigest:sha(x.binding),
       cachedAt:x.now,expiresAt:x.expiresAt,
       answers,answerDigest:sha(answers),
       providerRequestId:result.providerRequestId,
       originalObservedCostMicrousd:result.observedCostMicrousd,
       observedModelRevision:result.observedModelRevision??null,
       upstreamProvider:result.upstreamProvider??null};
     if(items[x.key]&&items[x.key].expiresAt>x.now){
       if(items[x.key].answerDigest!==row.answerDigest||
         items[x.key].providerRequestId!==row.providerRequestId)
         return fail('conflicting-billed-answer-must-not-overwrite');
       return {ok:true,status:'PUBLIC_REUSE_ALREADY_RECORDED',recorded:false};
     }
     items[x.key]=row;
     const list=Object.values(items).filter(v=>Number.isFinite(v?.expiresAt)&&v.expiresAt>x.now)
       .sort((a,b)=>a.cachedAt-b.cachedAt);
     while(list.length>MAX)list.shift();
     const remaining={...pending};
     if(claimed)delete remaining[x.key];
     await tx.setSetting(KEY,{schemaVersion:'uberbond.jev-public-answer-reuse.v1',
       items:Object.fromEntries(list.map(v=>[v.key,v])),pending:remaining});
     return {ok:true,status:'VALIDATED_PUBLIC_ANSWER_REUSE_RECORDED',recorded:true};
   });
 }
 return {read,claim,releaseUncalled,record,ttlMs:TTL_MS,maxEntries:MAX};
}
