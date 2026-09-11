import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const UBER_SOVEREIGN_SUBSTRATE_VERSION='uberbond.uber-sovereign-substrate.v1';
const zero=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
const text=(v,m=1000)=>{const s=String(v??'').trim();return s&&s.length<=m?s:null;};
const digest=v=>`sha256:${crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex')}`;
const isDigest=v=>/^sha256:[0-9a-f]{64}$/.test(String(v||''));
const fail=(layer,reasons)=>({ok:false,status:`${layer}_PLAN_BLOCKED`,reasonCodes:[...new Set(reasons)],businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero()});
const ready=(layer,plan)=>({ok:true,status:`${layer}_PLAN_READY`,plan:{...plan,planDigest:digest(plan)},businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero(),truthBoundary:'SOURCE_PLAN_ONLY__RUNTIME_AND_EXTERNAL_EFFECTS_REQUIRE_SEPARATE_OBSERVED_EVIDENCE'});
const providerAuthorityReasons=input=>[
 input?.providerPolicyAuthority===true?'provider-policy-authority-forbidden':null,
 input?.providerEffectAuthority===true?'provider-effect-authority-forbidden':null,
 input?.providerFounderAuthority===true?'provider-founder-authority-forbidden':null
].filter(Boolean);

export const UBER_SUBSTRATE_LAYERS=Object.freeze([
 {id:'UBERSOURCE',role:'provider-independent source custody mirrors export restore and immutable revision truth',kind:'SOVEREIGN_CORE',stateful:true,runtimeProof:true,sourceRefs:['src/uber-sovereign-substrate.mjs','tests/uber-sovereign-substrate.test.mjs']},
 {id:'UBERFORGE',role:'isolated reproducible build CI artifact signing and provenance plane',kind:'SOVEREIGN_CORE',stateful:true,runtimeProof:true,sourceRefs:['src/uber-sovereign-substrate.mjs','tests/uber-sovereign-substrate.test.mjs']},
 {id:'UBERSTATE',role:'portable encrypted application state export restore migration and evacuation plane',kind:'SOVEREIGN_CORE',stateful:true,runtimeProof:true,sourceRefs:['src/uber-sovereign-substrate.mjs','tests/uber-sovereign-substrate.test.mjs']},
 {id:'UBERQUEUE',role:'durable fair idempotent leased mission scheduling with restart and dead-letter semantics',kind:'SOVEREIGN_CORE',stateful:true,runtimeProof:true,sourceRefs:['src/uber-sovereign-substrate.mjs','tests/uber-sovereign-substrate.test.mjs']},
 {id:'UBEROBSERVE',role:'provider-neutral redacted telemetry health logs traces and evidence receipts',kind:'SOVEREIGN_CORE',stateful:true,runtimeProof:true,sourceRefs:['src/uber-sovereign-substrate.mjs','tests/uber-sovereign-substrate.test.mjs']},
 {id:'UBERBROWSER',role:'governed isolated browser and computer-use execution with target and authority boundaries',kind:'SUPPLIER_ABSTRACTION',stateful:true,runtimeProof:true,sourceRefs:['src/uber-sovereign-substrate.mjs','tests/uber-sovereign-substrate.test.mjs']},
 {id:'UBERIDENTITY',role:'founder device workload identity expiry revocation and credential-reference custody',kind:'SOVEREIGN_CORE',stateful:true,runtimeProof:true,sourceRefs:['src/uber-sovereign-substrate.mjs','tests/uber-sovereign-substrate.test.mjs']},
 {id:'UBERSKILLS',role:'first-party capability semantics admission routing authority attenuation and replaceable adapters',kind:'SOVEREIGN_CORE',stateful:false,runtimeProof:true,sourceRefs:['src/uberskills-core.mjs','src/uberskills-registry.mjs','scripts/uberskills-doctor.mjs']}
]);

export function compileUberSourcePlan(input={}){
 const reasons=providerAuthorityReasons(input); const revision=text(input.immutableRevisionRef,200); const exportRef=text(input.sourceExportRef); const restore=text(input.restoreDrillRef); const cells=Array.isArray(input.custodyCells)?input.custodyCells:[];
 const normalized=cells.map(c=>({cellId:text(c?.cellId,160),provider:text(c?.provider,120)?.toLowerCase(),evidenceRef:text(c?.evidenceRef),readable:c?.readable===true,writable:c?.writable===true}));
 if(!revision)reasons.push('immutable-revision-required'); if(!exportRef)reasons.push('source-export-required'); if(!restore)reasons.push('restore-drill-required');
 if(normalized.length<2)reasons.push('distinct-custody-cells-required'); if(new Set(normalized.map(c=>c.provider).filter(Boolean)).size<2)reasons.push('distinct-custody-providers-required');
 if(normalized.some(c=>!c.cellId||!c.provider||!c.evidenceRef||!c.readable))reasons.push('custody-cell-evidence-required');
 if(input.githubAuthorityRoot===true)reasons.push('github-cannot-be-authority-root');
 if(reasons.length)return fail('UBERSOURCE',reasons); return ready('UBERSOURCE',{immutableRevisionRef:revision,sourceExportRef:exportRef,restoreDrillRef:restore,custodyCells:normalized,authorityRoot:'UBERBOND'});
}

export function compileUberForgePlan(input={}){
 const reasons=providerAuthorityReasons(input); const sourceRevision=text(input.sourceRevision,200),recipeDigest=text(input.recipeDigest,100),runnerIsolationRef=text(input.runnerIsolationRef),artifactDigest=text(input.artifactDigest,100),signerRef=text(input.signerRef);
 if(!sourceRevision)reasons.push('source-revision-required'); if(!isDigest(recipeDigest))reasons.push('recipe-digest-required'); if(!runnerIsolationRef)reasons.push('isolated-runner-required'); if(!isDigest(artifactDigest))reasons.push('artifact-digest-required'); if(!signerRef)reasons.push('signer-ref-required');
 if(input.secretsMounted===true)reasons.push('build-secrets-mount-forbidden'); if(input.selfPromote===true||input.deployAuthority===true)reasons.push('build-cannot-self-promote');
 if(reasons.length)return fail('UBERFORGE',reasons); return ready('UBERFORGE',{sourceRevision,recipeDigest,runnerIsolationRef,artifactDigest,signerRef,secretsMounted:false,promotionAuthority:'NONE'});
}

export function compileUberStatePlan(input={}){
 const reasons=providerAuthorityReasons(input); const schemaVersion=text(input.schemaVersion,120),exportFormat=text(input.exportFormat,40)?.toUpperCase(),snapshotDigest=text(input.snapshotDigest,100),encryptionKeyRef=text(input.encryptionKeyRef),restoreDrillRef=text(input.restoreDrillRef),provider=text(input.provider,120)?.toLowerCase();
 if(!schemaVersion)reasons.push('schema-version-required'); if(!['JSON','SQL','PARQUET','TAR','SQLITE'].includes(exportFormat))reasons.push('portable-export-format-required'); if(!isDigest(snapshotDigest))reasons.push('snapshot-digest-required'); if(!encryptionKeyRef)reasons.push('encryption-key-reference-required'); if(!restoreDrillRef)reasons.push('restore-drill-required'); if(!provider)reasons.push('current-provider-required');
 if(input.rawEncryptionKey||input.rawSecret)reasons.push('raw-secret-forbidden'); if(input.portable!==true)reasons.push('state-portability-required');
 if(reasons.length)return fail('UBERSTATE',reasons); return ready('UBERSTATE',{schemaVersion,exportFormat,snapshotDigest,encryptionKeyRef,restoreDrillRef,provider,portable:true,authorityRoot:'UBERBOND'});
}

export function compileUberQueuePlan(input={}){
 const reasons=providerAuthorityReasons(input); const missionId=text(input.missionId,240),idempotencyKey=text(input.idempotencyKey,240),leaseOwner=text(input.leaseOwner,160),deadLetterRef=text(input.deadLetterRef),durableStateRef=text(input.durableStateRef); const ttl=Number(input.leaseTtlSeconds),attempts=Number(input.maxAttempts);
 if(!missionId)reasons.push('mission-id-required'); if(!idempotencyKey)reasons.push('idempotency-key-required'); if(!leaseOwner)reasons.push('lease-owner-required'); if(!Number.isInteger(ttl)||ttl<5||ttl>3600)reasons.push('bounded-lease-ttl-required'); if(!Number.isInteger(attempts)||attempts<1||attempts>20)reasons.push('bounded-attempts-required'); if(!deadLetterRef)reasons.push('dead-letter-ref-required'); if(!durableStateRef)reasons.push('durable-state-ref-required');
 if(input.effectAuthority===true)reasons.push('queue-cannot-create-effect-authority');
 if(reasons.length)return fail('UBERQUEUE',reasons); return ready('UBERQUEUE',{missionId,idempotencyKey,leaseOwner,leaseTtlSeconds:ttl,maxAttempts:attempts,deadLetterRef,durableStateRef,effectAuthority:'NONE'});
}

export function compileUberObservePlan(input={}){
 const reasons=providerAuthorityReasons(input); const sourceRef=text(input.sourceRef),eventType=text(input.eventType,120),observedAt=text(input.observedAt,100),evidenceRef=text(input.evidenceRef),redactionPolicyRef=text(input.redactionPolicyRef),payloadDigest=text(input.payloadDigest,100); const retentionDays=Number(input.retentionDays);
 if(!sourceRef)reasons.push('source-ref-required'); if(!eventType)reasons.push('event-type-required'); if(!observedAt||!Number.isFinite(Date.parse(observedAt)))reasons.push('observed-at-required'); if(!evidenceRef)reasons.push('evidence-ref-required'); if(!redactionPolicyRef)reasons.push('redaction-policy-required'); if(!isDigest(payloadDigest))reasons.push('payload-digest-required'); if(!Number.isInteger(retentionDays)||retentionDays<1||retentionDays>3650)reasons.push('bounded-retention-required');
 if(input.containsSecret===true)reasons.push('secret-bearing-telemetry-forbidden'); if(input.containsRawFounderPrivate===true)reasons.push('raw-founder-private-telemetry-forbidden'); if(input.truthAuthority==='PROVIDER')reasons.push('provider-cannot-be-truth-authority');
 if(reasons.length)return fail('UBEROBSERVE',reasons); return ready('UBEROBSERVE',{sourceRef,eventType,observedAt,evidenceRef,redactionPolicyRef,payloadDigest,retentionDays,truthAuthority:'UBERBOND_EVIDENCE_GRAPH'});
}

export function compileUberBrowserPlan(input={}){
 const reasons=providerAuthorityReasons(input); let url; try{url=new URL(String(input.targetUrl||''));}catch{} const allowedTargetRef=text(input.allowedTargetRef),sessionIsolationRef=text(input.sessionIsolationRef),evidenceRef=text(input.evidenceRef),dataClass=text(input.dataClass,80)?.toUpperCase(),mode=(text(input.mode,40)||'READ_ONLY').toUpperCase();
 if(!url||url.protocol!=='https:')reasons.push('https-target-required'); if(!allowedTargetRef)reasons.push('allowed-target-ref-required'); if(!sessionIsolationRef)reasons.push('session-isolation-required'); if(!evidenceRef)reasons.push('browser-evidence-ref-required'); if(!['PUBLIC','INTERNAL_NON_SECRET','CUSTOMER_AUTHORIZED','FOUNDER_PRIVATE'].includes(dataClass))reasons.push('data-class-required'); if(!['READ_ONLY','MUTATING'].includes(mode))reasons.push('browser-mode-invalid');
 if(mode==='MUTATING'&&!text(input.effectAuthorityRef))reasons.push('mutating-browser-authority-ref-required'); if(mode==='READ_ONLY'&&input.externalEffect===true)reasons.push('read-only-browser-cannot-effect');
 if(reasons.length)return fail('UBERBROWSER',reasons); return ready('UBERBROWSER',{targetOrigin:url.origin,allowedTargetRef,sessionIsolationRef,evidenceRef,dataClass,mode,effectAuthorityRef:mode==='MUTATING'?text(input.effectAuthorityRef):null});
}

export function compileUberIdentityPlan(input={}){
 const reasons=providerAuthorityReasons(input); const subjectId=text(input.subjectId,240),identityClass=text(input.identityClass,40)?.toUpperCase(),credentialRef=text(input.credentialRef),revocationRef=text(input.revocationRef),expiresAt=text(input.expiresAt,100),issuer=text(input.issuer,160);
 if(!subjectId)reasons.push('subject-id-required'); if(!['FOUNDER','DEVICE','WORKLOAD','SERVICE'].includes(identityClass))reasons.push('identity-class-required'); if(!credentialRef)reasons.push('credential-reference-required'); if(!revocationRef)reasons.push('revocation-ref-required'); if(!expiresAt||!Number.isFinite(Date.parse(expiresAt)))reasons.push('expiry-required'); if(!issuer)reasons.push('issuer-required');
 if(input.rawCredential||input.rawSecret)reasons.push('raw-credential-forbidden'); if(String(input.authorityRoot||'').toUpperCase()!=='UBERBOND')reasons.push('uberbond-identity-authority-root-required');
 if(reasons.length)return fail('UBERIDENTITY',reasons); return ready('UBERIDENTITY',{subjectId,identityClass,credentialRef,revocationRef,expiresAt,issuer,authorityRoot:'UBERBOND'});
}

export function compileUberSubstratePlan(layerId,input={}){
 const id=String(layerId||'').trim().toUpperCase(); const fn={UBERSOURCE:compileUberSourcePlan,UBERFORGE:compileUberForgePlan,UBERSTATE:compileUberStatePlan,UBERQUEUE:compileUberQueuePlan,UBEROBSERVE:compileUberObservePlan,UBERBROWSER:compileUberBrowserPlan,UBERIDENTITY:compileUberIdentityPlan}[id];
 return fn?fn(input):fail('UBERSUBSTRATE',['unknown-substrate-layer']);
}
