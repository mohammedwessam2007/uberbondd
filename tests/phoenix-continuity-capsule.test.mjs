import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPhoenixCapsule,appendPhoenixEvent,verifyPhoenixCapsule,
  compilePhoenixRecoveryChallenge,reconcilePhoenixRecovery,compilePhoenixResumeText,
  PHOENIX_MOONSHOT_CORPUS_SHA
} from '../src/phoenix-continuity-capsule.mjs';

const sha='90a52bc7c2539a79a1080c77d1228ce23a1c9c19';
const stamp='2026-10-08T00:00:00Z';
const e=(id='fact-1',extra={})=>({id,kind:'DECISION',summary:'Use exact source evidence rather than chat-only recollection.',
  truthClass:'SOURCE_OBSERVED',source:{kind:'REPOSITORY',locator:'docs/CROSS_CHAT_CONTINUITY.md'},moonshotIds:['founder-moonshot-0060','founder-moonshot-0890'],...extra});
const make=(extra={})=>createPhoenixCapsule({sessionId:'uberbond-phoenix-smoke',recordedAt:stamp,baseMainSha:sha,events:[e()],...extra});

test('source checkpoint produces verifiable deterministic digest',()=>{
 const a=make(),b=make();assert.equal(a.digest,b.digest);
 assert.deepEqual(verifyPhoenixCapsule(a),{ok:true,status:'CAPSULE_INTEGRITY_VERIFIED',digest:a.digest,events:1});
});
test('different session or time changes digest',()=>{
 assert.notEqual(make({sessionId:'different-branch'}).digest,make().digest);
 assert.notEqual(make({recordedAt:'2026-10-08T00:00:01Z'}).digest,make().digest);
});
test('round trip JSON retains capsule integrity',()=>assert.equal(verifyPhoenixCapsule(JSON.parse(JSON.stringify(make()))).ok,true));
test('mutated facts cannot retain integrity',()=>{
 const c=make();c.events[0].summary='Actually the opposite.';
 assert.equal(verifyPhoenixCapsule(c).ok,false);
});
test('extra unrecognized field cannot be smuggled into signed payload',()=>{
 const c=make();c.isLiveReady=true;assert.equal(verifyPhoenixCapsule(c).ok,false);
});
test('missing digest is refused',()=>assert.equal(verifyPhoenixCapsule({...make(),digest:null}).ok,false));
test('unknown source or truth classes are refused',()=>{
 assert.throws(()=>make({events:[e('bad',{source:{kind:'MAGIC',locator:'x'}})]}),/PHOENIX_SOURCE_KIND_UNKNOWN/);
 assert.throws(()=>make({events:[e('bad',{truthClass:'PAID_CUSTOMER'})]}),/PHOENIX_TRUTH_CLASS_UNKNOWN/);
});
test('provider claims require provider source and remain only provider attestation',()=>{
 assert.throws(()=>make({events:[e('p',{truthClass:'PROVIDER_ATTESTED'})]}),/PHOENIX_PROVIDER_SOURCE_REQUIRED/);
 const c=make({events:[e('p',{kind:'EXTERNAL_EVIDENCE',truthClass:'PROVIDER_ATTESTED',source:{kind:'PROVIDER',locator:'support receipt, not bank settlement'}})]});
 assert.equal(c.events[0].truthClass,'PROVIDER_ATTESTED');
});
test('chat-only events cannot self-promote to deployment or external truth',()=>{
 for(const truthClass of ['MERGED','DEPLOYED','TESTED','SOURCE_OBSERVED','PROVIDER_ATTESTED'])
 assert.throws(()=>make({events:[e('p',{truthClass,source:{kind:'CHAT_ONLY',locator:'private transcript'}})]}));
});
test('founder attested facts remain explicitly separate',()=>{
 const c=make({events:[e('p',{kind:'UNKNOWN',truthClass:'FOUNDER_ATTESTED',source:{kind:'FOUNDER_ATTESTED',locator:'owner says pending'}})]});
 assert.equal(c.events[0].truthClass,'FOUNDER_ATTESTED');
});
test('reject secret-like material rather than publishing credentials into Git',()=>{
 assert.throws(()=>make({events:[e('p',{summary:'password=unacceptable'})]}),/PHOENIX_EVENT_SUMMARY/);
 assert.throws(()=>make({events:[e('p',{source:{kind:'REPOSITORY',locator:'Bearer abcdefghijklmnopqrstuvwxyz'}})]}),/PHOENIX_SOURCE_LOCATOR/);
});
test('duplicate event IDs and duplicate ancestry rejected',()=>{
 assert.throws(()=>make({events:[e('same'),e('same')]}),/PHOENIX_DUPLICATE_EVENT_ID/);
 assert.throws(()=>make({events:[e('x',{moonshotIds:['founder-moonshot-0001','founder-moonshot-0001']})]}),/PHOENIX_MOONSHOT_ANCESTRY_INVALID/);
});
test('immutable 890 corpus anchor cannot silently drift',()=>{
 assert.match(PHOENIX_MOONSHOT_CORPUS_SHA,/^[a-f0-9]{64}$/);
 assert.throws(()=>make({moonshotCorpusSha:'a'.repeat(64)}),/PHOENIX_MOONSHOT_CORPUS_DRIFT/);
});
test('ancestry ID 1 and 890 pass, nonexistent ID 891 fails',()=>{
 assert.equal(make({events:[e('x',{moonshotIds:['founder-moonshot-0001','founder-moonshot-0890']})]}).events[0].moonshotIds.length,2);
 assert.throws(()=>make({events:[e('x',{moonshotIds:['founder-moonshot-0891']})]}),/PHOENIX_MOONSHOT_ANCESTRY_INVALID/);
});
test('chain append preserves original and binds parent digest',()=>{
 const a=make();const b=appendPhoenixEvent(a,e('fact-2',{kind:'BLOCKER',truthClass:'UNKNOWN'}),'2026-10-08T00:01:00Z');
 assert.equal(b.parentDigest,a.digest);assert.equal(a.events.length,1);assert.equal(b.events.length,2);
 assert.equal(verifyPhoenixCapsule(b).ok,true);
});
test('cannot replay event identity on append',()=>{
 assert.throws(()=>appendPhoenixEvent(make(),e('fact-1'),'2026-10-08T00:01:00Z'),/PHOENIX_EVENT_REPLAY_OR_COLLISION/);
});
test('tampered parent cannot become anchor of a new checkpoint',()=>{
 const c=make();c.events[0].summary='tampered';assert.throws(()=>appendPhoenixEvent(c,e('second'),'2026-10-08T00:01:00Z'),/PHOENIX_PARENT_UNVERIFIED/);
});
test('recovery challenge carries all IDs, sha and distinct sources',()=>{
 const a=make({events:[e('a'),e('b',{source:{kind:'CHAT_ONLY',locator:'private capsule only'},truthClass:'UNKNOWN'})]});
 const challenge=compilePhoenixRecoveryChallenge(a);
 assert.equal(challenge.eventIds.length,2);assert.equal(challenge.digest,a.digest);
 assert.ok(challenge.sourceLocators.some(x=>x.includes('docs/CROSS_CHAT_CONTINUITY.md')));
});
test('missing event is always reported instead of silently compressed away',()=>{
 const a=make({events:[e('a'),e('b')]});
 const r=reconcilePhoenixRecovery({capsule:a,acknowledgment:{digest:a.digest,eventIds:['a'],currentMainSha:sha}});
 assert.equal(r.status,'RECOVERY_INCOMPLETE');assert.deepEqual(r.missing,['b']);
});
test('wrong digest even with matching event IDs is incomplete',()=>{
 const a=make();const r=reconcilePhoenixRecovery({capsule:a,acknowledgment:{digest:'f'.repeat(64),eventIds:['fact-1'],currentMainSha:sha}});
 assert.equal(r.status,'RECOVERY_INCOMPLETE');assert.equal(r.digestMatch,false);
});
test('unverified source recheck prevents declaring complete source recovery',()=>{
 const a=make();const r=reconcilePhoenixRecovery({capsule:a,acknowledgment:{digest:a.digest,eventIds:['fact-1'],currentMainSha:sha}});
 assert.equal(r.status,'CAPSULE_RECOVERED_SOURCE_RECHECK_REQUIRED');
 assert.equal(r.notChecked[0],'REPOSITORY:docs/CROSS_CHAT_CONTINUITY.md');
});
test('source reporting complete does not equate to independent proof',()=>{
 const a=make();const r=reconcilePhoenixRecovery({capsule:a,acknowledgment:{digest:a.digest,eventIds:['fact-1'],currentMainSha:sha,checkedSourceLocators:['REPOSITORY:docs/CROSS_CHAT_CONTINUITY.md']}});
 assert.equal(r.status,'CAPSULE_RECOVERED_SOURCES_REPORTED_CHECKED');
 assert.match(r.warning,/SELF_REPORTED/);
});
test('moving main forces reconciliation even with complete source claims',()=>{
 const a=make();const r=reconcilePhoenixRecovery({capsule:a,acknowledgment:{digest:a.digest,eventIds:['fact-1'],currentMainSha:'1'.repeat(40),checkedSourceLocators:['REPOSITORY:docs/CROSS_CHAT_CONTINUITY.md']}});
 assert.equal(r.status,'CAPSULE_RECOVERED_MAIN_DRIFT_RECONCILE');
});
test('chat-only claims survive but never become external proof',()=>{
 const a=make({events:[e('private',{kind:'UNKNOWN',truthClass:'UNKNOWN',source:{kind:'CHAT_ONLY',locator:'private local transcript'}})]});
 const r=reconcilePhoenixRecovery({capsule:a,acknowledgment:{digest:a.digest,eventIds:['private'],currentMainSha:sha}});
 assert.deepEqual(r.unresolvedChatOnly,['private']);
});
test('resume instruction emphasizes attached capsule and no replay of uncertain effects',()=>{
 const text=compilePhoenixResumeText(make());assert.match(text,/not the whole chat/i);
 assert.match(text,/Do not repeat uncertain external effects/);assert.match(text,/fact-1/);
});
test('malformed timestamps, missing main and unsafe IDs refuse creation',()=>{
 assert.throws(()=>make({recordedAt:'yesterday'}),/PHOENIX_TIMESTAMP/);
 assert.throws(()=>make({baseMainSha:'latest'}),/PHOENIX_MAIN_SHA_REQUIRED/);
 assert.throws(()=>make({sessionId:'../../bad'}),/PHOENIX_SESSION_ID_FORMAT/);
});
test('maximum per-capsule work bounded but multi-checkpoint chain supported',()=>{
 const rows=Array.from({length:400},(_,i)=>e('ev-'+String(i).padStart(3,'0')));
 const a=make({events:rows});assert.equal(a.events.length,400);
 assert.throws(()=>make({events:[...rows,e('overflow')]}),/PHOENIX_EVENT_COUNT/);
});

test('deployed claim requires a runtime witness rather than a repository file',()=>{
 assert.throws(()=>make({events:[e('deploy-1',{kind:'IMPLEMENTATION',truthClass:'DEPLOYED'})]}),/PHOENIX_RUNTIME_WITNESS_REQUIRED/);
 const c=make({events:[e('deploy-1',{kind:'IMPLEMENTATION',truthClass:'DEPLOYED',source:{kind:'RUNTIME',locator:'Render live deploy with exact SHA'}})]});
 assert.equal(c.events[0].truthClass,'DEPLOYED');
});
test('tested claim requires actual execution log witness',()=>{
 assert.throws(()=>make({events:[e('test-1',{kind:'TEST',truthClass:'TESTED'})]}),/PHOENIX_EXECUTED_TEST_WITNESS_REQUIRED/);
 const c=make({events:[e('test-1',{kind:'TEST',truthClass:'TESTED',source:{kind:'RUN_LOG',locator:'Executed 27 scoped test assertions'}})]});
 assert.equal(c.events[0].truthClass,'TESTED');
});
test('merged claim cannot be laundered from private chat or a provider reply',()=>{
 assert.throws(()=>make({events:[e('merge-1',{kind:'IMPLEMENTATION',truthClass:'MERGED',source:{kind:'PROVIDER',locator:'Support email'}})]}),/PHOENIX_MERGE_SOURCE_REQUIRED/);
 const c=make({events:[e('merge-1',{kind:'IMPLEMENTATION',truthClass:'MERGED',source:{kind:'PR',locator:'https://github.com/mohammedwessam2007/uberbondd/pull/1287'}})]});
 assert.equal(c.events[0].truthClass,'MERGED');
});
