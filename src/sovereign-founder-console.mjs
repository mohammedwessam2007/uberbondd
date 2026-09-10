import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const SOVEREIGN_FOUNDER_CONSOLE_VERSION = 'uberbond.sovereign-founder-console.v1.2';
export const FOUNDER_CONSOLE_COMMANDS = Object.freeze(['status', 'wake', 'pause', 'resume', 'verify', 'doctor']);
const LOOPBACKS = new Set(['127.0.0.1', '::1', 'localhost']);
const zeroEffects = () => structuredClone(ZERO_EXTERNAL_EFFECTS);
const text = (value, max = 4000) => String(value ?? '').trim().slice(0, max);

export function constantTimeTokenEqual(expected, supplied) {
  const a = Buffer.from(String(expected || ''), 'utf8');
  const b = Buffer.from(String(supplied || ''), 'utf8');
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function compileFounderConsoleBinding({ host = '127.0.0.1', token = '' } = {}) {
  const normalizedHost = text(host, 255).toLowerCase() || '127.0.0.1';
  const loopback = LOOPBACKS.has(normalizedHost);
  if (!loopback && text(token, 4096).length < 32) {
    return { ok:false, status:'FOUNDER_CONSOLE_BINDING_REFUSED', reasonCodes:['non-loopback-founder-console-requires-strong-token'], businessEffectAuthority:'NONE', externalEffectAuthority:'NONE', externalEffectLedger:zeroEffects() };
  }
  return { ok:true, status:loopback?'FOUNDER_CONSOLE_LOOPBACK_ONLY':'FOUNDER_CONSOLE_PRIVATE_NETWORK_AUTH_REQUIRED', host:normalizedHost, tokenRequired:!loopback || Boolean(text(token,4096)), publicExposureAuthorized:false, businessEffectAuthority:'NONE', externalEffectAuthority:'NONE', externalEffectLedger:zeroEffects(), truthBoundary:'This binding authorizes only the founder control surface. It never grants merge, signing, deployment, customer, payment, DNS, credential, production, or private-life access authority.' };
}

export function parseFounderConsoleInput(input) {
  const raw = text(typeof input === 'string' ? input : input?.command, 4000);
  if (!raw) return { ok:false, status:'FOUNDER_CONSOLE_INPUT_REFUSED', reasonCodes:['founder-command-required'] };
  const normalized = raw.toLowerCase().replace(/\s+/g,' ').trim();
  const aliases = new Map([
    ['status','status'],['what is happening','status'],['what are you doing','status'],['how are you doing','status'],
    ['continue','wake'],['go','wake'],['wake','wake'],['work','wake'],['keep working','wake'],
    ['pause','pause'],['stop','pause'],['hold','pause'],['resume','resume'],['unpause','resume'],
    ['verify','verify'],['check','verify'],['review','verify'],
    ['doctor','doctor'],['diagnose','doctor'],['readiness','doctor'],['are you ready','doctor'],['can you finish yourself','doctor']
  ]);
  const command=aliases.get(normalized);
  if(command) return { ok:true, kind:'CONTROL_COMMAND', command, founderIntent:null, businessEffectAuthority:'NONE', externalEffectAuthority:'NONE', externalEffectLedger:zeroEffects() };
  return { ok:true, kind:'FOUNDER_INTENT', command:null, founderIntent:raw, businessEffectAuthority:'NONE', externalEffectAuthority:'NONE', externalEffectLedger:zeroEffects(), truthBoundary:'A founder intent is an instruction/context record, not authority to perform an external effect. Any later action still passes the normal capability, policy, verification, and effect gates.' };
}

export function compileFounderConsoleSnapshot({ autonomyStatus=null, continuation=null, verifiedChange=null, localPromotion=null, releaseRequest=null, runtimeReceipt=null, latestIntent=null }={}) {
  const safe=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:null;
  const status=safe(autonomyStatus), cont=safe(continuation), verified=safe(verifiedChange), promotion=safe(localPromotion), release=safe(releaseRequest), runtime=safe(runtimeReceipt), intent=safe(latestIntent);
  return {
    ok:true, schemaVersion:SOVEREIGN_FOUNDER_CONSOLE_VERSION, status:'FOUNDER_CONSOLE_SNAPSHOT',
    autonomy:{ status:status?.status||'NO_AUTONOMY_PULSE_RECORDED', baseRevision:status?.baseRevision||null, taskId:status?.taskId||null, attemptId:status?.attemptId||null, taskRequired:status?.taskRequired??null, newWorkerDispatch:status?.newWorkerDispatch??null, observedAt:status?.observedAt||null, reasonCodes:Array.isArray(status?.reasonCodes)?status.reasonCodes.slice(0,30):[] },
    continuation:cont?{ status:cont?.continuation?.status||null, decision:cont?.continuation?.decision||null, observedBaseRevision:cont?.observedBaseRevision||null, observedTaskId:cont?.observedTaskId||null, observedAttemptId:cont?.observedAttemptId||null }:null,
    verification:verified?{ status:verified.status||null, taskId:verified.taskId||null, baseRevision:verified.baseRevision||null, promotion:verified.promotion||null }:null,
    localPromotion:promotion?{ status:promotion.status||null, promotionClass:promotion.promotionClass||null, promotionCommitSha:promotion.promotionCommitSha||null, priorMainSha:promotion.priorMainSha||null, changeSetId:promotion.changeSetId||null, networkCalls:promotion.networkCalls??null }:null,
    release:release?{ status:release.status||null, sourceCommit:release.sourceCommit||null, promotionClass:release.promotionClass||null, requestDigest:release.requestDigest||null, signingAuthority:release.signingAuthority||null, deploymentAuthority:release.deploymentAuthority||null }:null,
    runtime:runtime?{ status:runtime.status||null, sourceCommit:runtime.sourceCommit||runtime.commit||null, observedAt:runtime.observedAt||runtime.generatedAt||null }:null,
    latestFounderIntent:intent?{ id:intent.id||null, createdAt:intent.createdAt||null, state:intent.state||'QUEUED' }:null,
    privacy:{ personalCivilizationVaultRead:false, networkLifeStateAccessAuthorized:false }, commands:[...FOUNDER_CONSOLE_COMMANDS], businessEffectAuthority:'NONE', externalEffectAuthority:'NONE', externalEffectLedger:zeroEffects(),
    truthBoundary:'This is a local founder-control snapshot. Missing receipts remain unknown; source promotion is not signing or deployment; no customer, revenue, runtime sovereignty, life outcome, or ASI claim is inferred.'
  };
}
