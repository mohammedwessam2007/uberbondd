/**
 * UberMind All-Ω Subscription Director: PURE ADVISORY compiler.
 * Operates without model, network, shell, secret access, or provider calls.
 * Claude Code's parent must actually run Opus through an authenticated subscription.
 */
export const SCHEMA='uberbond.ubermind.all-omega-subscription-director.v1';
const hex=x=>typeof x==='string'&&/^sha256:[a-f0-9]{64}$/.test(x);
const isObj=x=>x&&typeof x==='object'&&!Array.isArray(x);
const kinds=new Set(['native','lookup','research','code','review','frontier','synthesis']);
const risks=new Set(['low','material','critical']);
const impacts=new Set(['read','local-write','external-effect']);
const forbiddenKeys=['ANTHROPIC_API_KEY','ANTHROPIC_AUTH_TOKEN','ANTHROPIC_BASE_URL',
 'CLAUDE_CODE_USE_BEDROCK','CLAUDE_CODE_USE_VERTEX','CLAUDE_CODE_USE_FOUNDRY',
 'AWS_BEARER_TOKEN_BEDROCK','AWS_ACCESS_KEY_ID','GOOGLE_APPLICATION_CREDENTIALS',
 'ANTHROPIC_FOUNDRY_API_KEY','CLAUDE_CODE_SUBAGENT_MODEL'];

/** This is a preflight, NOT proof of what Claude CLI is authenticated to. */
export function subscriptionPreflight(env={},authorization={}) {
  const present=forbiddenKeys.filter(k=>typeof env[k]==='string'&&env[k].length>0&&env[k]!=='0');
  const noExtraCredits=authorization.usageCreditsDisabled===true;
  const subscriptionVerified=authorization.subscriptionStatusConfirmed===true;
  const noGateway=authorization.providerIsClaudeSubscription===true;
  return {
    status:present.length?'BLOCKED_EXTERNAL_PROVIDER_OVERRIDE':!noExtraCredits?'BLOCKED_USAGE_CREDITS_UNCONFIRMED':
      !subscriptionVerified||!noGateway?'BLOCKED_SUBSCRIPTION_NOT_VERIFIED':'PREFLIGHT_ONLY',
    allowed:present.length===0&&noExtraCredits&&subscriptionVerified&&noGateway,
    presentVariableNames:present,valuesExposed:false,
    actualAccountAuthenticationIndependentlyVerified:false,
    separateApiSpendAuthorizedUsd:0,
    nextCheck:'Open Claude Code /status and /usage; verify Pro/Max auth and no extra credits. This module never launches Claude.'
  };
}

export function screen52(registry,statusById={}) {
  if(!isObj(registry)||registry.cardCount!==52||!Array.isArray(registry.cards)||registry.cards.length!==52)
    return {ok:false,reason:'EXACT_52_REGISTRY_REQUIRED'};
  const expected=[...Array(52)].map((_,i)=>i+1);
  const numbers=registry.cards.map(x=>x.number);
  if(numbers.some((n,i)=>n!==expected[i])||
    registry.cards.some(c=>typeof c.operation!=='string'||!c.operation.trim()||
      typeof c.falsifier!=='string'||!c.falsifier.trim()||!c.omega||!c.id)||
    new Set(registry.cards.map(c=>c.id)).size!==52)
    return {ok:false,reason:'INVALID_OR_LOSSY_52_REGISTER'};
  const coverage=[];
  for(const c of registry.cards){
    const mark=statusById[c.id]??statusById[String(c.number)]??null;
    const status=mark?.status??'R';
    if(!['A','C','R','N','X'].includes(status))return {ok:false,reason:'INVALID_STATUS:'+c.id};
    if(status==='A' && (!isObj(mark)||typeof mark.operationReceipt!=='string'||mark.operationReceipt.length<8))
      return {ok:false,reason:'UNPROVEN_APPLICATION:'+c.id};
    coverage.push({number:c.number,omega:c.omega,id:c.id,status,
      method:c.operation,falsifier:c.falsifier,
      operationReceipt:status==='A'?mark.operationReceipt:null});
  }
  return {ok:true,total:52,screened:coverage.length,actualApplied:coverage.filter(c=>c.status==='A').length,
    noAutomaticAppliedClaims:true,coverage};
}

export function inventoryOmega(relativePaths=[]) {
  const found=[];
  for(const path of relativePaths){
    if(typeof path!=='string'||path.startsWith('/')||path.includes('..'))continue;
    if(!/(omega|ubermind|founder|genesis|phoenix|jev|capability)/i.test(path))continue;
    if(!/\.(mjs|md|mmd|txt|json)$/i.test(path))continue;
    found.push(path);
  }
  return [...new Set(found)].sort();
}

const reject=reason=>({ok:false,status:'ROUTING_REJECTED',reason,actualModelCalls:0,
  actualSubscriptionSavingPercent:null,paidApiCalls:0,completionVerified:false});

/**
 * mission: source/rubric SHA + typed task DAG. Each task own digest and evidence policy.
 * Routes are DECLARED for Claude Code's Tool/subagent mechanism, never silently executed.
 */
export function compileOmegaMission(mission,{preflight=null,maxParallel=2}={}){
  if(!isObj(mission)||!hex(mission.sourceDigest)||!hex(mission.rubricDigest)||
    !Array.isArray(mission.tasks)||mission.tasks.length<1||mission.tasks.length>48)
    return reject('MISSION_SOURCE_RUBRIC_OR_TASKS_INVALID');
  if(!Number.isSafeInteger(maxParallel)||maxParallel<1||maxParallel>8)
    return reject('PARALLEL_LIMIT_INVALID');
  if(preflight && preflight.allowed!==true)
    return reject('SUBSCRIPTION_PREFLIGHT_BLOCKED:'+preflight.status);
  const taskById=new Map();
  for(const t of mission.tasks){
    if(!isObj(t)||typeof t.id!=='string'||!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(t.id)||
      !hex(t.taskDigest)||!kinds.has(t.kind)||!risks.has(t.risk)||
      !impacts.has(t.impact)||!Array.isArray(t.dependsOn)||t.dependsOn.length>30||
      !t.dependsOn.every(d=>typeof d==='string')||taskById.has(t.id))
      return reject('INVALID_OR_DUPLICATE_TASK');
    if(t.impact==='external-effect'&&t.ownerAuthorized!==true)
      return reject('EXTERNAL_EFFECT_NOT_AUTHORIZED:'+t.id);
    taskById.set(t.id,t);
  }
  const parents=new Map(),children=new Map(),depth=new Map();
  for(const t of mission.tasks){
    const deps=new Set(t.dependsOn);
    if(deps.size!==t.dependsOn.length||deps.has(t.id)||[...deps].some(d=>!taskById.has(d)))
      return reject('INVALID_DEPENDENCIES:'+t.id);
    parents.set(t.id,deps);children.set(t.id,[]);
  }
  for(const t of mission.tasks) for(const d of t.dependsOn)children.get(d).push(t.id);
  const q=mission.tasks.filter(t=>parents.get(t.id).size===0).map(t=>t.id);
  const sorted=[];
  while(q.length){
    const id=q.shift();sorted.push(id);
    const t=taskById.get(id);depth.set(id,Math.max(0,...t.dependsOn.map(d=>(depth.get(d)??0)+1)));
    for(const child of children.get(id)){
      parents.get(child).delete(id);
      if(parents.get(child).size===0)q.push(child);
    }
  }
  if(sorted.length!==mission.tasks.length)return reject('CYCLIC_TASK_DAG');
  const routes=[];
  for(const id of sorted){
    const t=taskById.get(id);
    let model='none',agent='native-reverify',reason='NATIVE_DETERMINISTIC';
    const reuse=t.reuse;
    const exact=!!reuse&&isObj(reuse)&&reuse.exactEligible===true&&
      reuse.taskDigest===t.taskDigest&&reuse.sourceDigest===mission.sourceDigest&&
      reuse.rubricDigest===mission.rubricDigest&&t.acceptanceFailed!==true;
    if(exact){reason='EXACT_CERTIFICATE_CANDIDATE_REVERIFY_REQUIRED';}
    else if(t.kind==='native'){reason='NATIVE_TASK';}
    else if(t.kind==='synthesis'||t.kind==='frontier'||t.risk==='critical'){
      model='opus';agent='crown-main-session';reason='FRONTIER_OR_CRITICAL_OPUS';
    }else if(t.kind==='lookup'){model='haiku';agent='ubermind-haiku-scout';reason='BOUNDED_SOURCE_LOOKUP';}
    else if(t.kind==='research'){model='haiku';agent='ubermind-haiku-researcher';reason='BOUNDED_RESEARCH';}
    else if(t.kind==='code'){model='sonnet';agent='ubermind-sonnet-builder';reason='SCOPED_IMPLEMENTATION';}
    else if(t.kind==='review'){model='sonnet';agent='ubermind-sonnet-falsifier';reason='INDEPENDENT_FALSIFICATION';}
    if(t.risk==='material'&&model==='haiku'){model='sonnet';agent='ubermind-sonnet-falsifier';reason='MATERIAL_RISK_UPGRADE';}
    routes.push({id,dependsOn:t.dependsOn,level:depth.get(id),model,agent,reason,
      mustReverify:exact,sourceDigest:mission.sourceDigest,taskDigest:t.taskDigest,
      permission:t.impact,needsOwnerGate:t.impact==='external-effect',
      evidenceRequired:true,status:'PROPOSED_NOT_EXECUTED'});
  }
  const levels=[];
  for(const route of routes){
    let group=levels.find(g=>g.level===route.level);
    if(!group){group={level:route.level,batches:[]};levels.push(group)}
    const sameLevel=routes.filter(r=>r.level===route.level);
    group.batches=[];for(let i=0;i<sameLevel.length;i+=maxParallel)group.batches.push(sameLevel.slice(i,i+maxParallel).map(r=>r.id));
  }
  // Unique levels and deterministic order; no concurrency if no independent tasks.
  const groups=[...new Map(levels.map(x=>[x.level,x])).values()].sort((a,b)=>a.level-b.level);
  return {ok:true,schema:SCHEMA,status:'ROUTING_PLAN_ONLY',crown:{model:'opus',effort:'high',role:'permanent-director-and-final-acceptance',
      actualLoginVerified:false},routes,executionWaves:groups,
    qualityEvidence:'NOT_RUN',actualModelCalls:0,actualSubscriptionSavingPercent:null,
    modelInvocationAuthority:false,paidApiCalls:0,subscriptionPreflight:preflight?.status??'NOT_CHECKED',
    guardrails:['W40/W41/JEV advisory only','No claimed source authenticity from hashes alone',
      'Never replace Opus Crown with Sonnet main','Check /status /usage before live inference',
      'Reject unapproved provider and monetary effects','Native reuse requires real checkout verification',
      'No team scaling without task independence and measured quality',
      'PHOENIX checkpoint after validated real work']};
}