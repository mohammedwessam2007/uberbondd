import { semanticHash } from './semantic-closure-kernel.mjs';

export const JEV_APPLICABILITY_PASSPORT_SCHEMA='uberbond.jev-applicability-passport.v1';
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const id=v=>typeof v==='string'&&/^[a-zA-Z0-9_.:/-]{1,240}$/.test(v);
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);

export function verifyJevApplicabilityPassport({
  passport,trustedPassportHashes={},context={},now=Date.now(),
  expectedPurpose=null,expectedTaskArchetype=null,expectedModel=null
}={}){
  const reasons=[];
  try{
    if(!plain(passport)||passport.schemaVersion!==JEV_APPLICABILITY_PASSPORT_SCHEMA)throw new Error('jev-passport-v1-required');
    for(const key of ['circuitId','semanticPurpose','taskArchetype','crownReferenceModel','crownReferenceRevision','certificatePointer'])
      if(!id(passport[key]))throw new Error('passport-identity-field-required:'+key);
    if(passport.promotionState!=='BOUNDED_REFLEX')throw new Error('jev-not-promoted-to-bounded-reflex');
    if(expectedPurpose&&passport.semanticPurpose!==expectedPurpose)throw new Error('jev-purpose-mismatch');
    if(expectedTaskArchetype&&passport.taskArchetype!==expectedTaskArchetype)throw new Error('jev-task-archetype-mismatch');
    if(expectedModel&&passport.model!==expectedModel)throw new Error('jev-model-mismatch');
    if(!plain(passport.validInputDomain)||!Number.isSafeInteger(passport.validInputDomain.maxSharedStateTokens)||
       passport.validInputDomain.maxSharedStateTokens<1||passport.validInputDomain.maxSharedStateTokens>32000)throw new Error('bounded-jev-input-domain-required');
    if(!Array.isArray(passport.excludedStates))throw new Error('jev-excluded-states-required');
    if(!Number.isSafeInteger(passport.pairedHoldoutCount)||passport.pairedHoldoutCount<1)throw new Error('paired-holdout-evidence-required');
    if(passport.pairedRegressions!==0)throw new Error('zero-regression-certification-required');
    for(const key of ['falsePositiveEvidenceRef','falseNegativeEvidenceRef','calibrationEvidenceRef'])
      if(typeof passport[key]!=='string'||!passport[key])throw new Error('jev-evidence-ref-required:'+key);
    if(!plain(passport.sourceDependencies)||!Object.keys(passport.sourceDependencies).length)throw new Error('jev-source-dependencies-required');
    for(const [k,v] of Object.entries(passport.sourceDependencies)){
      if(!id(k)||!digest(v)||context.sourceDependencies?.[k]!==v)throw new Error('jev-source-dependency-drift:'+k);
    }
    if(!Number.isFinite(Date.parse(passport.evidenceDate))||Date.parse(passport.evidenceDate)>now)throw new Error('jev-evidence-date-invalid');
    if(!Number.isSafeInteger(passport.freshnessTtlMs)||passport.freshnessTtlMs<1)throw new Error('jev-freshness-ttl-required');
    if(Date.parse(passport.evidenceDate)+passport.freshnessTtlMs<=now)throw new Error('jev-passport-stale');
    if(!Array.isArray(passport.driftTriggers)||!passport.driftTriggers.length)throw new Error('jev-drift-triggers-required');
    if(passport.driftTriggers.some(k=>!id(k)||context.driftState?.[k]!==false))throw new Error('jev-drift-triggered-or-unknown');
    if(!Number.isFinite(passport.auditRate)||passport.auditRate<0||passport.auditRate>1)throw new Error('jev-audit-rate-required');
    if(passport.decompileAction!=='FREEZE_DECOMPILE_CROWN_REVALIDATE')throw new Error('jev-decompile-law-required');
    if(!digest(trustedPassportHashes?.[passport.circuitId])||trustedPassportHashes[passport.circuitId]!==semanticHash(passport))throw new Error('jev-passport-not-independently-trusted');
  }catch(error){reasons.push(String(error.message||error));}
  return {
    ok:reasons.length===0,
    status:reasons.length?'JEV_PASSPORT_REFUSED':'JEV_PASSPORT_CURRENT',
    reasons,
    authority:reasons.length?'NONE':'Q_CERTIFIED_BOUNDED',
    decompileAction:'FREEZE_DECOMPILE_CROWN_REVALIDATE'
  };
}

export function planCertifiedJevEvidenceGate({
  passport,trustedPassportHashes={},context={},now=Date.now(),
  sourceTokens=0,chunkTokens=30000,expectedRelevantTokens=0,
  model='typesafe/jev-1.13'
}={}){
  const verified=verifyJevApplicabilityPassport({
    passport,trustedPassportHashes,context,now,
    expectedPurpose:'SOURCE_CHUNK_RELEVANCE',
    expectedTaskArchetype:context.taskArchetype,
    expectedModel:model
  });
  if(!verified.ok)return {...verified,eligible:false};
  if(!Number.isSafeInteger(sourceTokens)||sourceTokens<1||!Number.isSafeInteger(chunkTokens)||chunkTokens<1||
     chunkTokens>passport.validInputDomain.maxSharedStateTokens) return {ok:false,eligible:false,status:'JEV_EVIDENCE_GATE_REFUSED',reasons:['bounded-source-token-geometry-required'],authority:'NONE'};
  if(!Number.isSafeInteger(expectedRelevantTokens)||expectedRelevantTokens<0||expectedRelevantTokens>sourceTokens)
    return {ok:false,eligible:false,status:'JEV_EVIDENCE_GATE_REFUSED',reasons:['bounded-relevant-token-estimate-required'],authority:'NONE'};
  return {
    ok:true,eligible:true,status:'CERTIFIED_JEV_EVIDENCE_GATE_READY',
    circuitId:passport.circuitId,sourceTokens,chunkTokens,
    chunkCount:Math.ceil(sourceTokens/chunkTokens),expectedRelevantTokens,
    authority:'Q_CERTIFIED_BOUNDED',
    outputLaw:'JEV_DECIDES_RELEVANCE_ONLY__EXACT_CODE_COPIES_SOURCE_BYTES__NO_SUMMARY_AUTHORITY',
    auditRate:passport.auditRate,
    decompileAction:passport.decompileAction
  };
}
