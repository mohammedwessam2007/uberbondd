import test from 'node:test';
import assert from 'node:assert/strict';
import { compileContextCognitiveEvent } from '../src/sovereign-context-fabric.mjs';
import { compileCognitiveJournalEntry, verifyCognitiveJournalEntries } from '../src/cognitive-event-journal.mjs';
import { compileFounderContextSuppression, applyContextPrivacyView } from '../src/context-privacy.mjs';
import { retrieveRelevantCognitiveHistory } from '../src/context-history-retrieval.mjs';

function append(entries, compiledEvent){
  const row=compileCognitiveJournalEntry({compiledEvent,sequence:entries.length+1,previousEntryDigest:entries.length?entries.at(-1).entryDigest:null});
  assert.equal(row.ok,true);entries.push(row.entry);return row.entry;
}
function fact(id,summary,minute=0){
  const out=compileContextCognitiveEvent({kind:'MEMORY_UPDATE',sourceNodeId:'context-spine',subjectType:'MEMORY_FACT',subjectId:id,summary,evidenceRefs:[`test://${id}`],truthClass:'CHAT_SPEC_GOAL',observedAt:`2026-09-11T20:0${minute}:00Z`});
  assert.equal(out.ok,true);return out;
}
function auth(target){return{schemaVersion:'uberbond.founder-context-authorization.v1',authorizationId:'f'.repeat(64),authorized:true,action:'SUPPRESS_COGNITIVE_EVENT',targetEventId:target,issuedAt:'2026-09-11T20:05:00Z'};}

test('privacy suppression requires explicit matching founder authorization receipt',()=>{
  const target=fact('private-note','A private marker.').eventId;
  assert.equal(compileFounderContextSuppression({targetEventId:target,founderAuthorizationReceipt:null}).ok,false);
  assert.equal(compileFounderContextSuppression({targetEventId:target,founderAuthorizationReceipt:{...auth(target),targetEventId:'brain_evt_'+'0'.repeat(24)}}).ok,false);
  assert.equal(compileFounderContextSuppression({targetEventId:target,founderAuthorizationReceipt:auth(target)}).ok,true);
});

test('suppression preserves full hash chain but removes target and directive from ordinary view',()=>{
  const entries=[];
  const target=append(entries,fact('private-note','private marker alpha',0));
  append(entries,fact('public-note','public marker beta',1));
  const suppression=compileFounderContextSuppression({targetEventId:target.eventId,founderAuthorizationReceipt:auth(target.eventId),observedAt:'2026-09-11T20:06:00Z'});
  assert.equal(suppression.ok,true);
  append(entries,suppression.compiledEvent);
  assert.equal(verifyCognitiveJournalEntries(entries).ok,true);
  const view=applyContextPrivacyView(entries);
  assert.equal(view.ok,true);
  assert.equal(view.totalJournalEntries,3);
  assert.equal(view.retrievableJournalEntries,1);
  assert.deepEqual(view.suppressedEventIds,[target.eventId]);
  assert.equal(view.privacyDirectiveEventIds.length,1);
  assert.equal(view.visibleEntries[0].event.subjectId,'public-note');
});

test('suppressed event cannot return through semantic retrieval or recent fallback',()=>{
  const entries=[];
  const target=append(entries,fact('private-note','rare secret quasar marker',0));
  append(entries,fact('public-note','public continuity marker',1));
  const suppression=compileFounderContextSuppression({targetEventId:target.eventId,founderAuthorizationReceipt:auth(target.eventId),observedAt:'2026-09-11T20:06:00Z'});
  append(entries,suppression.compiledEvent);
  const semantic=retrieveRelevantCognitiveHistory({entries,mission:'rare secret quasar marker',maxEvents:4});
  assert.equal(semantic.ok,true);
  assert.equal(semantic.events.some(event=>event.eventId===target.eventId),false);
  assert.equal(semantic.suppressedEventCount,1);
  const fallback=retrieveRelevantCognitiveHistory({entries,mission:'unmatched xenon phrase',maxEvents:4});
  assert.equal(fallback.events.some(event=>event.eventId===target.eventId),false);
  assert.equal(fallback.events.some(event=>event.subjectType==='COGNITIVE_EVENT_SUPPRESSION'),false);
});

test('malformed suppression-shaped event fails closed instead of silently hiding history',()=>{
  const entries=[];
  const target=append(entries,fact('private-note','private marker',0));
  const malformed=compileContextCognitiveEvent({kind:'MEMORY_UPDATE',sourceNodeId:'context-spine',subjectType:'COGNITIVE_EVENT_SUPPRESSION',subjectId:target.eventId,summary:'hide it',evidenceRefs:['founder-context-authorization://'+'f'.repeat(64)],truthClass:'FOUNDER_AUTHORIZED_PRIVACY_DIRECTIVE',observedAt:'2026-09-11T20:06:00Z',parentEventIds:[target.eventId]});
  assert.equal(malformed.ok,true);append(entries,malformed);
  const view=applyContextPrivacyView(entries);
  assert.equal(view.ok,false);
  assert.ok(view.reasonCodes.includes('malformed-context-privacy-directive'));
});
