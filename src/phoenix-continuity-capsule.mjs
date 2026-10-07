import crypto from 'node:crypto';

export const PHOENIX_CAPSULE_VERSION = 'uberbond.phoenix-continuity-capsule.v1';
export const PHOENIX_MOONSHOT_CORPUS_SHA = '23bb3c1813e3b5997d8ec76c801db2d5c59baf780573fb496da867d90d7017f0';
export const PHOENIX_MOONSHOT_MANIFEST = 'artifacts/research/founder-moonshot-literal-corpus/manifest.json';
const SOURCE_KINDS = new Set(['REPOSITORY', 'ISSUE', 'PR', 'PRIVATE_ATTACHMENT', 'PROVIDER', 'FOUNDER_ATTESTED', 'CHAT_ONLY', 'RESEARCH']);
const CLAIM_KINDS = new Set(['GOAL','DECISION','IMPLEMENTATION','TEST','EXTERNAL_EVIDENCE','BLOCKER','UNKNOWN','FAILED_ATTEMPT','DONOR','NEXT_ACTION','CONTRADICTION']);
const AUTHORITY = new Set(['GOAL_ONLY','SOURCE_OBSERVED','TESTED','MERGED','DEPLOYED','PROVIDER_ATTESTED','FOUNDER_ATTESTED','HYPOTHESIS','UNKNOWN']);
const SHA = /^[a-f0-9]{64}$/;
const GIT_SHA = /^[a-f0-9]{40}$/;
const ID = /^[a-z0-9][a-z0-9._-]{0,99}$/;
const SECRET = /(\b(?:sk-proj|sk-live|ghp_|gho_|github_pat_|xoxb-|xoxp-|Bearer\s+[a-z0-9_.-]{12,}|password\s*[:=]\s*\S+|api[_-]?key\s*[:=]\s*\S+|-----BEGIN (?:RSA|OPENSSH|PRIVATE) KEY)\b)/i;

function fail(code) { throw new Error('PHOENIX_' + code); }
function bounded(value, label, max = 360) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || SECRET.test(value)) fail(label);
  return value.trim();
}
function optional(value, label, max) { return value == null ? null : bounded(value, label, max); }
function plain(value) {
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] === undefined) fail('UNDEFINED_VALUE');
      out[key] = plain(value[key]);
    }
    return out;
  }
  if (value === null || ['string','number','boolean'].includes(typeof value)) {
    if (typeof value === 'number' && !Number.isFinite(value)) fail('NON_FINITE');
    return value;
  }
  fail('NON_JSON_VALUE');
}
function canonical(value) { return JSON.stringify(plain(value)); }
function hash(value) { return crypto.createHash('sha256').update(canonical(value)).digest('hex'); }
function validateTime(time, label) {
  if (typeof time !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(time) || Number.isNaN(Date.parse(time))) fail(label);
  return time;
}
function sourceRef(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) fail('SOURCE_REQUIRED');
  const kind = bounded(source.kind, 'SOURCE_KIND', 40);
  if (!SOURCE_KINDS.has(kind)) fail('SOURCE_KIND_UNKNOWN');
  const locator = bounded(source.locator, 'SOURCE_LOCATOR', 500);
  const witnessDigest = optional(source.witnessDigest, 'SOURCE_DIGEST_INVALID', 64);
  if (witnessDigest !== null && !SHA.test(witnessDigest)) fail('SOURCE_DIGEST_INVALID');
  return { kind, locator, witnessDigest };
}
function eventRecord(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) fail('EVENT_INVALID');
  const id = bounded(event.id, 'EVENT_ID', 100);
  if (!ID.test(id)) fail('EVENT_ID_FORMAT');
  const kind = bounded(event.kind, 'EVENT_KIND', 40);
  const truthClass = bounded(event.truthClass, 'TRUTH_CLASS', 40);
  if (!CLAIM_KINDS.has(kind)) fail('EVENT_KIND_UNKNOWN');
  if (!AUTHORITY.has(truthClass)) fail('TRUTH_CLASS_UNKNOWN');
  const summary = bounded(event.summary, 'EVENT_SUMMARY', 600);
  const ref = sourceRef(event.source);
  if (['SOURCE_OBSERVED','TESTED','MERGED','DEPLOYED','PROVIDER_ATTESTED'].includes(truthClass)
      && ['CHAT_ONLY','FOUNDER_ATTESTED'].includes(ref.kind)) fail('AUTHORITY_SOURCE_MISMATCH');
  if (truthClass === 'PROVIDER_ATTESTED' && ref.kind !== 'PROVIDER') fail('PROVIDER_SOURCE_REQUIRED');
  if (truthClass === 'FOUNDER_ATTESTED' && ref.kind !== 'FOUNDER_ATTESTED') fail('FOUNDER_SOURCE_REQUIRED');
  const ancestors = Array.isArray(event.moonshotIds) ? [...event.moonshotIds] : [];
  if (ancestors.length > 20 || new Set(ancestors).size !== ancestors.length
      || ancestors.some(x => typeof x !== 'string' || !/^founder-moonshot-0(?:00[1-9]|0[1-9]\d|[1-7]\d\d|8(?:[0-8]\d|90))$/.test(x))) fail('MOONSHOT_ANCESTRY_INVALID');
  return {id,kind,truthClass,summary,source:ref,moonshotIds:ancestors.sort()};
}
function bodyOf(capsule) {
  const { digest, ...body } = capsule;
  return body;
}
export function verifyPhoenixCapsule(capsule) {
  try {
    if (!capsule || typeof capsule !== 'object' || Array.isArray(capsule) || !SHA.test(capsule.digest || '')) fail('DIGEST_FORMAT');
    if (capsule.schemaVersion !== PHOENIX_CAPSULE_VERSION || capsule.status !== 'RECORDED_NOT_REHYDRATED') fail('SCHEMA');
    const canonicalInput = createPhoenixCapsule({
      sessionId:capsule.sessionId, recordedAt:capsule.recordedAt, baseMainSha:capsule.baseMainSha,
      parentDigest:capsule.parentDigest, events:capsule.events,
      moonshotCorpusSha:capsule.moonshotCorpusSha
    });
    if (canonical(canonicalInput) !== canonical(capsule)) fail('EXTRA_OR_CHANGED_FIELDS');
    if (hash(bodyOf(capsule)) !== capsule.digest) fail('DIGEST_MISMATCH');
    return {ok:true,status:'CAPSULE_INTEGRITY_VERIFIED',digest:capsule.digest,events:capsule.events.length};
  } catch (error) { return {ok:false,status:'CAPSULE_INVALID',reason:String(error.message||error)}; }
}
export function createPhoenixCapsule({ sessionId, recordedAt, baseMainSha, parentDigest = null, events = [], moonshotCorpusSha = PHOENIX_MOONSHOT_CORPUS_SHA }={}) {
  const session = bounded(sessionId, 'SESSION_ID', 100);
  if (!ID.test(session)) fail('SESSION_ID_FORMAT');
  validateTime(recordedAt,'TIMESTAMP');
  if (typeof baseMainSha !== 'string' || !GIT_SHA.test(baseMainSha)) fail('MAIN_SHA_REQUIRED');
  if (parentDigest !== null && (typeof parentDigest !== 'string' || !SHA.test(parentDigest))) fail('PARENT_DIGEST_INVALID');
  if (moonshotCorpusSha !== PHOENIX_MOONSHOT_CORPUS_SHA) fail('MOONSHOT_CORPUS_DRIFT');
  if (!Array.isArray(events) || events.length > 400) fail('EVENT_COUNT');
  const normalized = events.map(eventRecord);
  const keys = normalized.map(e=>e.id);
  if (new Set(keys).size !== keys.length) fail('DUPLICATE_EVENT_ID');
  const core = {
    schemaVersion:PHOENIX_CAPSULE_VERSION,status:'RECORDED_NOT_REHYDRATED',sessionId:session,
    recordedAt,baseMainSha,parentDigest,moonshotManifest:PHOENIX_MOONSHOT_MANIFEST,
    moonshotCorpusSha,events:normalized,
    truthBoundary:'CONTENT_HASH_IS_INTEGRITY_NOT_AUTHENTICITY; CAPSULE_IS_NOT_COMPLETE_CHAT_TRANSCRIPT; NO_EXTERNAL_EFFECT_AUTHORITY'
  };
  return {...core,digest:hash(core)};
}
export function appendPhoenixEvent(capsule,event,recordedAt) {
  const inspected = verifyPhoenixCapsule(capsule);
  if (!inspected.ok) fail('PARENT_UNVERIFIED');
  const newEvent = eventRecord(event);
  if (capsule.events.some(e=>e.id===newEvent.id)) fail('EVENT_REPLAY_OR_COLLISION');
  return createPhoenixCapsule({
    sessionId:capsule.sessionId,recordedAt,baseMainSha:capsule.baseMainSha,
    parentDigest:capsule.digest,moonshotCorpusSha:capsule.moonshotCorpusSha,events:[...capsule.events,newEvent]
  });
}
export function compilePhoenixRecoveryChallenge(capsule) {
  const verified = verifyPhoenixCapsule(capsule);
  if (!verified.ok) return {ok:false,status:'CAPSULE_INVALID',reason:verified.reason};
  return {
    ok:true,status:'RECOVERY_CHALLENGE_OPEN',digest:capsule.digest,baseMainSha:capsule.baseMainSha,
    eventIds:capsule.events.map(x=>x.id),moonshotCorpusSha:capsule.moonshotCorpusSha,
    sourceLocators:[...new Set(capsule.events.map(x=>x.source.kind+':'+x.source.locator))].sort(),
    instructions:'Read canonical repo and source evidence. Do not claim source revalidation without new external reads. Return exact digest, recovered event IDs, current main SHA and independently checked source locators.'
  };
}
export function reconcilePhoenixRecovery({capsule,acknowledgment}={}) {
  const verified = verifyPhoenixCapsule(capsule);
  if (!verified.ok) return {ok:false,status:'CAPSULE_INVALID',reason:verified.reason};
  if (!acknowledgment || typeof acknowledgment !== 'object') return {ok:false,status:'RECOVERY_NOT_ATTEMPTED'};
  const seen = Array.isArray(acknowledgment.eventIds) ? acknowledgment.eventIds : [];
  if (seen.some(x=>typeof x!=='string') || new Set(seen).size!==seen.length) return {ok:false,status:'ACK_INVALID'};
  const expected = capsule.events.map(e=>e.id);
  const missing=expected.filter(x=>!seen.includes(x));
  const unexpected=seen.filter(x=>!expected.includes(x));
  const digestMatch=acknowledgment.digest===capsule.digest;
  const main = typeof acknowledgment.currentMainSha==='string' && GIT_SHA.test(acknowledgment.currentMainSha) ? acknowledgment.currentMainSha : null;
  const drift = main!==null && main!==capsule.baseMainSha;
  const checked = new Set(Array.isArray(acknowledgment.checkedSourceLocators)?acknowledgment.checkedSourceLocators:[]);
  const refs=[...new Set(capsule.events.filter(e=>['REPOSITORY','PR','ISSUE','PROVIDER'].includes(e.source.kind)).map(e=>e.source.kind+':'+e.source.locator))];
  const notChecked=refs.filter(r=>!checked.has(r));
  const recordComplete=digestMatch && missing.length===0 && unexpected.length===0;
  const sourceComplete=notChecked.length===0 && !!main;
  return {
    ok:recordComplete, status:!recordComplete?'RECOVERY_INCOMPLETE':!sourceComplete?'CAPSULE_RECOVERED_SOURCE_RECHECK_REQUIRED':drift?'CAPSULE_RECOVERED_MAIN_DRIFT_RECONCILE':'CAPSULE_RECOVERED_SOURCES_REPORTED_CHECKED',
    missing,unexpected,digestMatch,recordComplete,sourceComplete,mainDrift:drift,notChecked,
    unresolvedChatOnly:capsule.events.filter(e=>e.source.kind==='CHAT_ONLY').map(e=>e.id),
    warning:'ACKNOWLEDGMENT_IS_SELF_REPORTED; CROSS_CHECK_PROVIDER_AND_REPO_LIVE; CHAT_ONLY_CLAIMS_ARE_NOT_EXTERNAL_PROOF'
  };
}
export function compilePhoenixResumeText(capsule) {
  const checked=verifyPhoenixCapsule(capsule);
  if (!checked.ok) fail('CAPSULE_UNVERIFIED');
  const events=capsule.events.map(e=>'- '+e.id+' ['+e.truthClass+'] '+e.summary+' ('+e.source.kind+': '+e.source.locator+')').join('\n');
  const prefix='UBERBOND PHOENIX RESUME | capsule sha256 '+capsule.digest+'\nRefresh main, read AI_START_HERE.md, AGENTS.md, docs/FOUNDER_890_UNIVERSAL_CROSS_CHAT_INTEGRATION.md and current handoffs. This checkpoint is incomplete without the exact capsule source bytes; use the attached capsule, then perform its recovery challenge. Main at recording: '+capsule.baseMainSha+'; immutable 890 corpus digest: '+capsule.moonshotCorpusSha+'. The hash proves bytes are unchanged, not that chat facts are true. Do not repeat uncertain external effects.\n';
  return prefix+'\nCheckpointed events (not the whole chat):\n'+events+'\nConfirm all event IDs and source rechecks before claiming full recovery.';
}
