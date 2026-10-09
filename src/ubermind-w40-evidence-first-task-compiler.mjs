/**
 * UBERMIND W40 • Evidence-First Mission Compiler
 *
 * Generates a bounded, reproducible ROUTING PROPOSAL, never performs inference,
 * calls providers, tests code, authenticates source receipts or accepts quality.
 * A proposed native replay MUST be separately verified in the live checkout.
 *
 * This is a small operational addition to W1–W39, not a second capability OS.
 */
export const W40_ROUTER_SCHEMA='uberbond.ubermind.evidence-first-task-compiler.v1';
const enumIn=(value,set)=>set.includes(value);
const digest=s=>typeof s==='string'&&/^sha256:[0-9a-f]{64}$/.test(s);
const pos=n=>Number.isSafeInteger(n)&&n>=0&&n<=10000000;
const reject=reason=>({
  ok:false,status:'W40_CONTRACT_REJECTED',reason,
  providerCalls:0,paidApiUsdAuthorized:0,actualProUsagePercent:null,
  qualityProven:false,productionEffectAuthorized:false
});
const advice=Object.freeze({
  'NATIVE_REVERIFY':Object.freeze({model:'none',effort:'none',agent:'native-exact-work',
    tools:'approved-local-source-verifier',maxTurns:0}),
  'SONNET_SOLO':Object.freeze({model:'sonnet',effort:'medium',agent:'accountable-lead',
    tools:'repo-native-tools-under-policy',maxTurns:null}),
  'SONNET_HIGH':Object.freeze({model:'sonnet',effort:'high',agent:'accountable-lead',
    tools:'repo-native-tools-under-policy',maxTurns:null}),
  'OPUS_PRIMARY':Object.freeze({model:'opus',effort:'high',agent:'accountable-frontier-lead',
    tools:'repo-native-tools-under-policy',maxTurns:null})
});

/**
 * Contract shape. Fields describe mission facts provided by the CALLER.
 * A digest match from caller input is an intent to REVERIFY, NOT trusted proof.
 *
 * Novelty frontier and critical unbounded consequences use Opus immediately:
 * no preliminary medium-Sonnet architecture report wasting context.
 * Independent teams remain OFF absent empirical, task-class quality/cost proof.
 */
export function compileUberMindTaskRoute({
 taskDigest,sourceDigest,rubricDigest,
 novelty='routine',risk='low',operation='code',
 sourceReplay=null,
 authorization='NONE',
 scout=null,
 independentSubtasks=0,
 disjointWorktrees=false,
 matchedTeamEvidence=false,
 knownAcceptanceFailure=false,
 nativeAcceptanceStatus='not-run',
 unresolvedFrontierContradiction=false,
 opusAvailable=true
}={}){
 if(!digest(taskDigest)||!digest(sourceDigest)||!digest(rubricDigest))
  return reject('source-task-rubric-sha256-contract-required');
 if(!enumIn(novelty,['routine','complex','frontier'])||
    !enumIn(risk,['low','material','critical'])||
    !enumIn(operation,['read','code','research','decision','side-effect'])||
    !enumIn(nativeAcceptanceStatus,['not-run','passed','failed','inconclusive'])||
    !enumIn(authorization,['NONE','EXPLICIT_OWNER'])||
    !Number.isSafeInteger(independentSubtasks)||independentSubtasks<0||independentSubtasks>32||
    [disjointWorktrees,matchedTeamEvidence,knownAcceptanceFailure,
     unresolvedFrontierContradiction,opusAvailable].some(x=>typeof x!=='boolean'))
  return reject('invalid-mission-flags');
 if(sourceReplay!==null&&(
   typeof sourceReplay!=='object'||Array.isArray(sourceReplay)||
   ![sourceReplay.taskDigest,sourceReplay.sourceDigest,sourceReplay.rubricDigest].every(digest)||
   typeof sourceReplay.exactEligible!=='boolean'))
  return reject('invalid-replay-certificate');
 if(scout!==null&&(
   typeof scout!=='object'||Array.isArray(scout)||
   !pos(scout.leadContextTokensAvoided)||
   !pos(scout.fullScoutInputTokens)||
   !pos(scout.scoutOutputTokens)||
   typeof scout.readOnly!=='boolean'||
   typeof scout.needed!=='boolean'))
  return reject('invalid-scout-budget');
 if(operation==='side-effect'&&authorization!=='EXPLICIT_OWNER')
  return { ...reject('external-effects-require-explicit-owner-authority'),
    status:'W40_OWNER_AUTHORITY_HOLD' };

 const exact=!!sourceReplay&&sourceReplay.exactEligible===true&&
   sourceReplay.taskDigest===taskDigest&&
   sourceReplay.sourceDigest===sourceDigest&&
   sourceReplay.rubricDigest===rubricDigest&&
   !knownAcceptanceFailure&&nativeAcceptanceStatus!=='failed'&&
   !unresolvedFrontierContradiction;

 const frontier=novelty==='frontier'||risk==='critical'||
   unresolvedFrontierContradiction===true||
   (operation==='decision'&&risk==='material');
 const base=exact?'NATIVE_REVERIFY':frontier?'OPUS_PRIMARY':
   novelty==='complex'||risk==='material'?'SONNET_HIGH':'SONNET_SOLO';
 if(base==='OPUS_PRIMARY'&&!opusAvailable)
  return {...reject('frontier-model-required-but-unavailable'),
     status:'W40_QUALITY_HOLD_NO_OPUS',requiredModel:'opus'};

 const main=advice[base];
 const delegates=[];
 const gates=[];
 if(exact){
   gates.push('RUN_EXISTING_SOURCE_VERIFIER_AGAINST_LIVE_CHECKOUT');
   gates.push('CHECK_SOURCE_TASK_RUBRIC_PERMISSION_FRESHNESS');
   gates.push('IF_REPLAY_FAILS_RECOMPILE_WITHOUT_REPLAY_CERTIFICATE');
   gates.push('RUN_RELEVANT_NATIVE_ACCEPTANCE_TESTS');
 }else{
   gates.push('RETRIEVE_TASK_RELEVANT_890_GENESIS_TOTAL_BRAIN_PHOENIX_POINTERS');
   gates.push('RUN_NATIVE_TESTS_AND_SOURCE_CHECKS_FIRST');
   const clearScout=scout&&scout.needed&&scout.readOnly&&
     operation!=='side-effect'&&scout.leadContextTokensAvoided>
     scout.fullScoutInputTokens+scout.scoutOutputTokens;
   // Scout ROI is only a TOKEN-VOLUME SCREEN, not guaranteed Pro-meter ROI.
   if(clearScout){
     delegates.push({name:'ubermind-haiku-scout',model:'haiku',
       effort:'low',maxTurns:6,scope:'read-only-evidence',when:'bounded-source-overload'});
   }
   if(knownAcceptanceFailure||nativeAcceptanceStatus==='failed'||
     (risk==='material'&&nativeAcceptanceStatus==='inconclusive')){
     delegates.push({name:'ubermind-sonnet-falsifier',model:'sonnet',
       effort:'high',maxTurns:6,scope:'read-only-falsification',
       when:'material-regression-or-quality-risk'});
   }
   if(unresolvedFrontierContradiction&&base!=='OPUS_PRIMARY'){
     delegates.push({name:'ubermind-opus-frontier-judge',model:'opus',
       effort:'high',maxTurns:8,scope:'read-only-hard-unknown',
       when:'source-grounded-irreducible-contradiction'});
   }
   if(risk==='material'&&nativeAcceptanceStatus==='not-run')
     gates.push('RECOMPILE_AFTER_NATIVE_TESTS_BEFORE_OPTIONAL_FALSIFIER');
   if(frontier)gates.push('KEEP_OPUS_PRIMARY_THROUGH_HARD_REASONING');
   else gates.push('ESCALATE_ONLY_RESIDUAL_FRONTIER_FAILURE_TO_OPUS');
   if(risk==='critical'||operation==='side-effect')
     gates.push('REQUIRE_STRONG_INDEPENDENT_ACCEPTANCE_AND_OWNER_EFFECT_GATE');
 }
 const teamEligible=!exact&&independentSubtasks>=2&&disjointWorktrees&&
   matchedTeamEvidence&&risk!=='critical'&&operation!=='side-effect';
 gates.push(teamEligible?
   'OPTIONAL_TEAM_UP_TO_TWO_INITIAL_PEERS_ONLY_IF_RECEIPTED_NET_BENEFIT':
   'NO_AGENT_TEAM');
 gates.push('PHOENIX_STORE_HASHED_ACCEPTED_PROOFS_ONLY');
 gates.push('MEASURE_ENTIRE_REAL_CLAUDE_PRO_USAGE_IF_ACCESSIBLE');

 return {
  ok:true,status:'ROUTING_PROPOSAL_NOT_EXECUTED',
  taskDigest,sourceDigest,rubricDigest,
  main,
  exactNativeReplayCandidate:exact,
  requiredAction:exact?'REVERIFY_BEFORE_ANY_REPLAY':
    base==='OPUS_PRIMARY'?'DIRECT_OPUS_PRIMARY_NO_PRELIMINARY_SONNET':
    'SINGLE_CAPABLE_LEAD',
  delegates,teamEligible,teamMaximumInitialPeers:teamEligible?2:0,
  gates,authorization,novelty,risk,
  providerCalls:0,paidApiUsdAuthorized:0,
  actualProUsagePercent:null,qualityProven:false,
  proofAuthenticityVerified:false,taskCompleted:false,
  productionEffectAuthorized:false,
  advisoryWarnings:[
   'Caller-provided hashes/risks are untrusted until checked against the live repository.',
   'A scout token-volume advantage is not a Pro quota saving; account model weighting is unpublished.',
   'Every model, context, retry and peer invocation must count toward actual usage.',
   'Quality-required Opus reasoning and tests outrank the cost objective.'
  ]
 };
}
