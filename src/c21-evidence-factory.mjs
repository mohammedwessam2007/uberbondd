import crypto from 'node:crypto';

export const C21_EVIDENCE_FACTORY_VERSION='uberbond.c21-evidence-factory.v1';
export const CANONICAL_C21_DIMENSIONS=Object.freeze([
  'novel problem solving','causal reasoning','scientific discovery','software engineering','mathematical reasoning','strategy','forecasting','world-model construction','mechanism invention','economic reasoning','planning under uncertainty','long-horizon coherence','transfer between domains','learning from sparse evidence','capability acquisition','autonomous recovery','self-improvement','tool invention','adversarial robustness','calibrated refusal and ignorance detection'
]);
export const CRITICAL_C21_DIMENSIONS=Object.freeze(['causal reasoning','planning under uncertainty','long-horizon coherence','transfer between domains','self-improvement','adversarial robustness','calibrated refusal and ignorance detection']);
const SHA=/^[0-9a-f]{64}$/;
const ZERO=Object.freeze({customerMessages:0,providerCalls:0,spendCents:0,deployments:0,dnsChanges:0,credentialChanges:0,paymentMutations:0,productionMutations:0});
const H=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const text=(v,n=500)=>typeof v==='string'&&v.trim()&&v.trim().length<=n?v.trim():null;

export const EXTERNAL_BENCHMARK_SURFACES=Object.freeze({
  'novel problem solving':['ARC-AGI-2 private evaluation','UberBond rotating private abstraction holdout'],
  'causal reasoning':['UberBond intervention/counterfactual causal suite','independent causal-world private holdout'],
  'scientific discovery':["Humanity's Last Exam expert science slice",'Terminal-Bench-Science / private scientific workflow holdout'],
  'software engineering':['Terminal-Bench 3 / 2.1','SWE-bench Pro or equivalent contamination-audited private repository set'],
  'mathematical reasoning':['FrontierMath v2 private tiers','FrontierMath Open Problems / private proof-and-answer holdout'],
  'strategy':['private adversarial strategy tournament','hidden multi-agent game-theoretic tasks'],
  'forecasting':['ForecastBench tournament','private time-locked forecasting round'],
  'world-model construction':['private simulator identification suite','held-out dynamics prediction tasks'],
  'mechanism invention':['private mechanism-design challenge','independent expert blind review of novel mechanisms'],
  'economic reasoning':['private economic decision suite','provider-origin real-world economic outcomes where lawful and applicable'],
  'planning under uncertainty':['private stochastic planning suite','hidden partial-observability long-horizon tasks'],
  'long-horizon coherence':['Terminal-Bench Challenges','METR-style long-horizon autonomous task suite'],
  'transfer between domains':['private cross-domain transfer matrix','fresh-context zero-leak transfer tasks'],
  'learning from sparse evidence':['ARC-style few-demonstration tasks','private few-shot rule-learning suite'],
  'capability acquisition':['private unseen-tool onboarding suite','fresh API/tool learning tasks'],
  'autonomous recovery':['fault-injection recovery suite','private dependency/provider failure scenarios'],
  'self-improvement':['frozen pre-candidate efficiency/capability challenge','independent post-change heldout replay'],
  'tool invention':['private task requiring creation of a reusable tool','independent reuse test on unseen tasks'],
  'adversarial robustness':['hostile prompt/tool/environment suite','independent red-team private holdout'],
  'calibrated refusal and ignorance detection':['private unknowable/ambiguous task suite','confidence calibration + abstention holdout']
});

export function compileC21EvidenceCampaign({candidateId,candidateRevision,frozenAt,rotationSaltDigest,minimumIndependentVerifierIdentities=3}={}){
  const id=text(candidateId,200),revision=text(candidateRevision,300),at=text(frozenAt,100),salt=text(rotationSaltDigest,64)?.toLowerCase();
  const reasons=[];
  if(!id||!revision||!at) reasons.push('candidate-revision-and-frozen-time-required');
  if(!salt||!SHA.test(salt)) reasons.push('sha256-rotation-salt-digest-required');
  if(!Number.isSafeInteger(minimumIndependentVerifierIdentities)||minimumIndependentVerifierIdentities<3) reasons.push('at-least-three-independent-verifiers-required');
  if(reasons.length) return {ok:false,status:'C21_EVIDENCE_CAMPAIGN_REFUSED',reasonCodes:reasons,asiStatus:'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED',businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:{...ZERO}};
  const cells=CANONICAL_C21_DIMENSIONS.map((dimension,index)=>{
    const surfaces=EXTERNAL_BENCHMARK_SURFACES[dimension];
    const taskPopulationHash=H({version:C21_EVIDENCE_FACTORY_VERSION,candidateId:id,candidateRevision:revision,dimension,index,rotationSaltDigest:salt,surfaces});
    return Object.freeze({dimension,critical:CRITICAL_C21_DIMENSIONS.includes(dimension),benchmarkSurfaces:[...surfaces],taskPopulationHash,evaluationContract:Object.freeze({thresholdsFrozenBeforeCandidateRun:true,freshContextHeldoutRequired:true,baselineVerifiedAtEvaluationTime:true,contaminationStatusAllowed:['CLEAN','BOUNDED_DISCLOSED'],independentEvaluatorRequired:true,independentVerifierLineageRequired:true,matchedResourceBudgetRequired:true,evidenceReuseAcrossDimensionsProhibited:true,syntheticEvidenceProhibited:true,externalBenchmarkPlusPrivateHoldoutRequired:true})});
  });
  const campaign={version:C21_EVIDENCE_FACTORY_VERSION,candidateId:id,candidateRevision:revision,frozenAt:at,rotationSaltDigest:salt,minimumIndependentVerifierIdentities,canonicalDimensionCount:cells.length,cells};
  return {ok:true,status:'C21_EVIDENCE_CAMPAIGN_FROZEN',campaign,campaignDigest:H(campaign),asiStatus:'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED',promotionAuthority:'NONE',selfModificationAuthority:'NONE',businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:{...ZERO},truthBoundary:'PLAN_ONLY__NO_BENCHMARK_EXECUTION_OR_ASI_CLAIM'};
}

export function auditC21EvidenceBundle({campaign,receipts=[]}={}){
  if(!campaign||campaign.version!==C21_EVIDENCE_FACTORY_VERSION||!Array.isArray(campaign.cells)||campaign.cells.length!==20) return {ok:false,status:'C21_EVIDENCE_BUNDLE_REFUSED',reasonCodes:['valid-frozen-campaign-required'],asiStatus:'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED'};
  const rows=Array.isArray(receipts)?receipts:[];
  const reasons=[];
  const dimensions=new Set(); const refs=new Set(); const taskHashes=new Set(); const receiptHashes=new Set(); const verifierIds=new Set(); const verifierLineages=new Set();
  for(const r of rows){
    if(!CANONICAL_C21_DIMENSIONS.includes(r?.dimension)) reasons.push('noncanonical-dimension');
    if(dimensions.has(r?.dimension)) reasons.push('duplicate-dimension'); else dimensions.add(r?.dimension);
    if(r?.observed!==true||r?.synthetic===true) reasons.push('observed-nonsynthetic-evidence-required');
    if(r?.thresholdFrozenBeforeEvaluation!==true||r?.freshContextHeldout!==true||r?.baselineVerifiedAtEvaluationTime!==true||r?.independentEvaluator!==true) reasons.push('frozen-heldout-baseline-independent-evaluation-required');
    if(!['CLEAN','BOUNDED_DISCLOSED'].includes(r?.contaminationStatus)) reasons.push('contamination-contract-required');
    const cell=campaign.cells.find(c=>c.dimension===r?.dimension);
    if(!cell||r?.taskPopulationHash!==cell.taskPopulationHash) reasons.push('task-population-binding-mismatch');
    for(const [set,value,code] of [[refs,r?.evidenceRef,'unique-evidence-ref-required'],[taskHashes,r?.taskPopulationHash,'unique-task-population-required'],[receiptHashes,r?.compoundReceiptHash,'unique-compound-receipt-required']]){if(!text(value,500)||set.has(value)) reasons.push(code); else set.add(value);}
    const vid=text(r?.verifierId,200),lin=text(r?.verifierLineageRef,500);
    if(!vid||!lin) reasons.push('verifier-identity-and-lineage-required'); else {verifierIds.add(vid.toLowerCase());verifierLineages.add(lin.toLowerCase());}
  }
  const missing=CANONICAL_C21_DIMENSIONS.filter(d=>!dimensions.has(d));
  const missingCritical=CRITICAL_C21_DIMENSIONS.filter(d=>!dimensions.has(d));
  const verifierFloor=campaign.minimumIndependentVerifierIdentities||3;
  const strong=reasons.length===0&&missing.length===0&&missingCritical.length===0&&verifierIds.size>=verifierFloor&&verifierLineages.size>=verifierFloor;
  return {ok:reasons.length===0,status:strong?'C21_EVIDENCE_BUNDLE_READY_FOR_CANONICAL_TRIBUNAL':'C21_EVIDENCE_INCOMPLETE',evidenceStage:strong?'SYSTEM_LEVEL_ASI_EVIDENCE_STRONG_WITHIN_DEFINED_SCOPE':'SYSTEM_LEVEL_ASI_EVIDENCE_NOT_ESTABLISHED',asiStatus:'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED',counts:{evidencedDimensions:dimensions.size,missingDimensions:missing.length,independentVerifierIdentities:verifierIds.size,independentVerifierLineages:verifierLineages.size},missingDimensions:missing,missingCriticalDimensions:missingCritical,reasonCodes:[...new Set(reasons)],promotionAuthority:'NONE',selfModificationAuthority:'NONE',businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:{...ZERO},truthBoundary:'THIS_AUDIT_ONLY_CHECKS_EVIDENCE_PACKET_COMPLETENESS__CANONICAL_C21_REMAINS_THE_ARBITER__NO_ASI_DECLARATION'};
}
