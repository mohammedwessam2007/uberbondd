import crypto from 'node:crypto';

export const PROJECT_BRAIN_SCHEMA_VERSION = 'uberbond-project-brain-1.0.0';
export const CANONICAL_OBJECTIVE = 'build a private evidence-first economic operating system that maximizes risk-adjusted cleared contribution profit per founder minute';
export const OPTIMIZATION_TARGET = 'risk-adjusted cleared contribution profit per founder minute';
const REQUIRED_BOUNDARIES = Object.freeze([
  'customerMessages', 'providerCalls', 'spend', 'deployments', 'dnsChanges',
  'credentialChanges', 'kycPaymentAccountChanges', 'productionCustomerMutations', 'moneyMovement'
]);
const SENSITIVE_KEYS = /(?:password|secret|token|cookie|credential|api[_-]?key|private[_-]?key|raw(?:customer|recipient|message|prompt|output|payload|body)|emailAddress|phoneNumber)/i;
const SAFE_KEYS = new Set(REQUIRED_BOUNDARIES);
const ZERO_EFFECTS = Object.freeze({providerCalls:0,messages:0,purchases:0,deployments:0,credentialChanges:0,dnsChanges:0,productionMutations:0,spendCents:0});

function clone(v){ return structuredClone(v); }
function digest(v){ return crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex'); }
function isIso(v){ if(typeof v!=='string') return false; const d=new Date(v); return Number.isFinite(d.getTime()) && d.toISOString()===v; }
function isSha(v){ return typeof v==='string' && /^[a-f0-9]{40}$/i.test(v); }
function sensitiveKeys(value, depth=0, seen=new WeakSet()){
  if(!value || typeof value!=='object' || depth>7) return [];
  if(seen.has(value)) return [];
  seen.add(value);
  const out=[];
  for(const [k,child] of Object.entries(value)){
    if(SENSITIVE_KEYS.test(k) && !SAFE_KEYS.has(k)) out.push(k);
    if(child && typeof child==='object') out.push(...sensitiveKeys(child,depth+1,seen));
  }
  return [...new Set(out)].slice(0,30);
}
function invalid(reasonCodes, extra={}){
  return {ok:false,schemaVersion:PROJECT_BRAIN_SCHEMA_VERSION,reasonCodes:[...new Set(reasonCodes)],businessEffectAuthority:'NONE',externalEffectLedger:clone(ZERO_EFFECTS),...extra};
}

export function validateProjectBrain(brain={}, {now=new Date().toISOString()}={}){
  if(!brain || typeof brain!=='object' || Array.isArray(brain)) return invalid(['project-brain-object-required']);
  const reasons=[];
  if(brain.schemaVersion!==PROJECT_BRAIN_SCHEMA_VERSION) reasons.push('project-brain-schema-version-mismatch');
  if(!isSha(brain.baselineMainCommit)) reasons.push('baseline-main-commit-required');
  if(!isIso(brain.generatedAt)) reasons.push('generated-at-valid-iso-required');
  const nowMs=new Date(now).getTime();
  if(isIso(brain.generatedAt) && Number.isFinite(nowMs) && new Date(brain.generatedAt).getTime()>nowMs+300000) reasons.push('future-dated-project-brain');
  if(String(brain.canonicalObjective||'').trim().toLowerCase()!==CANONICAL_OBJECTIVE) reasons.push('canonical-objective-mismatch');
  if(brain.optimizationTarget!==OPTIMIZATION_TARGET) reasons.push('optimization-target-mismatch');
  if(!Array.isArray(brain.nonGoals) || !brain.nonGoals.includes('vanity metrics')) reasons.push('vanity-metric-non-goal-required');
  if(!Array.isArray(brain.truthHierarchy) || brain.truthHierarchy[0]!=='live repository state') reasons.push('live-repository-must-be-highest-truth');
  if(!brain.authorityBoundaries || typeof brain.authorityBoundaries!=='object') reasons.push('authority-boundaries-required');
  else for(const key of REQUIRED_BOUNDARIES){ if(brain.authorityBoundaries[key]!=='EXPLICIT_OWNER_AUTHORIZATION_REQUIRED') reasons.push(`authority-boundary-${key}-must-require-owner`); }
  if(!brain.currentMission || typeof brain.currentMission!=='object') reasons.push('current-mission-required');
  if(!brain.continuationProtocol || brain.continuationProtocol.mustRefreshLiveMain!==true || brain.continuationProtocol.neverRestartMergedWork!==true) reasons.push('continuation-protocol-incomplete');
  if(!Array.isArray(brain.sourceProvenance) || !brain.sourceProvenance.some(s=>s?.class==='LIVE_REPOSITORY')) reasons.push('live-repository-provenance-required');
  if(!Array.isArray(brain.sourceProvenance) || !brain.sourceProvenance.some(s=>s?.class==='HISTORICAL_CHAT_EXPORT' && s?.limitation)) reasons.push('chat-export-limitation-required');
  const prohibited=sensitiveKeys(brain);
  if(prohibited.length) reasons.push('secret-or-raw-customer-data-prohibited');
  if(reasons.length) return invalid(reasons,{prohibitedKeys:prohibited});
  const canonical=clone(brain);
  return {ok:true,schemaVersion:PROJECT_BRAIN_SCHEMA_VERSION,brain:canonical,brainDigest:digest(canonical),businessEffectAuthority:'NONE',externalEffectLedger:clone(ZERO_EFFECTS)};
}

export function buildContinuationPacket(brain, {liveMainCommit, openPullRequests=[], now=new Date().toISOString()}={}){
  const checked=validateProjectBrain(brain,{now});
  if(!checked.ok) return checked;
  if(!isSha(liveMainCommit)) return invalid(['live-main-commit-required']);
  const prNumbers=[...new Set((openPullRequests||[]).map(v=>Number(v)).filter(Number.isSafeInteger))].sort((a,b)=>a-b);
  const baselineChanged=liveMainCommit.toLowerCase()!==brain.baselineMainCommit.toLowerCase();
  const packet={
    schemaVersion:'uberbond-continuation-packet-1.0.0',
    liveMainCommit:liveMainCommit.toLowerCase(),
    brainBaselineMainCommit:brain.baselineMainCommit.toLowerCase(),
    baselineChanged,
    refreshRequired:baselineChanged,
    canonicalObjective:brain.canonicalObjective,
    optimizationTarget:brain.optimizationTarget,
    currentMission:clone(brain.currentMission),
    lastMergedPr:clone(brain.lastMergedPr||null),
    openPullRequests:prNumbers,
    externalProofRequired:clone(brain.externalProofRequired||[]),
    nextMission:clone(brain.nextMission||null),
    instructions:[
      'Read live main before acting.',
      'Treat live repository state as higher truth than chat summaries or stale docs.',
      'Inspect open PRs and recent commits before creating new work.',
      'Never restart work already merged into main.',
      'Continue the highest-value unfinished dependency-satisfied mission.',
      'Do not synthesize external commercial proof.'
    ],
    businessEffectAuthority:'NONE', externalEffectLedger:clone(ZERO_EFFECTS)
  };
  packet.packetDigest=digest(packet);
  return {ok:true,status:baselineChanged?'LIVE_MAIN_ADVANCED_REFRESH_BRAIN':'CONTINUE_FROM_CANONICAL_BRAIN',packet,businessEffectAuthority:'NONE',externalEffectLedger:clone(ZERO_EFFECTS)};
}

export function reconcileProjectCheckpoint({brain, historicalCheckpoint, liveMainCommit, now=new Date().toISOString()}={}){
  const packet=buildContinuationPacket(brain,{liveMainCommit,now});
  if(!packet.ok) return packet;
  if(!historicalCheckpoint || typeof historicalCheckpoint!=='object') return invalid(['historical-checkpoint-object-required']);
  if(!isIso(historicalCheckpoint.observedAt)) return invalid(['historical-checkpoint-observed-at-required']);
  if(new Date(historicalCheckpoint.observedAt).getTime()>new Date(now).getTime()+300000) return invalid(['future-dated-historical-checkpoint']);
  if(historicalCheckpoint.claimedMainCommit && !isSha(historicalCheckpoint.claimedMainCommit)) return invalid(['historical-checkpoint-main-sha-invalid']);
  const conflicts=[];
  if(historicalCheckpoint.claimedMainCommit && historicalCheckpoint.claimedMainCommit.toLowerCase()!==liveMainCommit.toLowerCase()) conflicts.push('historical-main-differs-from-live-main');
  return {ok:true,status:conflicts.length?'HISTORICAL_CONTEXT_PRESERVED_LIVE_REPO_WINS':'CHECKPOINT_COMPATIBLE',conflicts,authoritativeMainCommit:liveMainCommit.toLowerCase(),historicalCheckpoint:clone(historicalCheckpoint),businessEffectAuthority:'NONE',externalEffectLedger:clone(ZERO_EFFECTS)};
}
