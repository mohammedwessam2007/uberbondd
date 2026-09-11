#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZERO_EXTERNAL_EFFECTS } from '../src/effect-ledgers.mjs';
import { readCognitiveJournal, appendCognitiveJournalEvent } from '../src/cognitive-event-journal.mjs';
import { compileFounderContextSuppression } from '../src/context-privacy.mjs';

export const SOVEREIGN_CONTEXT_SUPPRESS_VERSION='sovereign-context-suppress-1.0.0';
const EVENT_ID=/^brain_evt_[a-f0-9]{24}$/;
const SHA64=/^[a-f0-9]{64}$/;
const zeroEffects=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
function fail(reasonCodes,status='CONTEXT_SUPPRESSION_REFUSED',extra={}){return{ok:false,suppressVersion:SOVEREIGN_CONTEXT_SUPPRESS_VERSION,status,reasonCodes:[...new Set((reasonCodes||[]).filter(Boolean))],businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects(),...extra};}
function safeJson(file,max=65536){try{const st=fs.lstatSync(file);if(!st.isFile()||st.isSymbolicLink()||st.size>max)return null;const value=JSON.parse(fs.readFileSync(file,'utf8'));return value&&typeof value==='object'&&!Array.isArray(value)?value:null;}catch{return null;}}

export function suppressContextEvent({journalPath,authorizationRoot,targetEventId,authorizationId,observedAt=new Date()}={}){
  const target=String(targetEventId||'');const authId=String(authorizationId||'').toLowerCase();
  if(!journalPath||!authorizationRoot||!EVENT_ID.test(target)||!SHA64.test(authId))return fail(['journal-authorization-root-target-and-id-required']);
  const root=path.resolve(authorizationRoot);const authPath=path.resolve(root,`${authId}.json`);
  if(authPath!==path.join(root,`${authId}.json`))return fail(['safe-founder-authorization-path-required']);
  const auth=safeJson(authPath);if(!auth)return fail(['regular-founder-authorization-receipt-required']);
  const journal=readCognitiveJournal(journalPath);if(!journal.ok)return fail(['verified-journal-required',...(journal.reasonCodes||[])]);
  if(!journal.entries.some(entry=>entry.eventId===target))return fail(['suppression-target-must-exist-in-journal']);
  if(journal.entries.some(entry=>entry.event.subjectType==='COGNITIVE_EVENT_SUPPRESSION'&&entry.event.subjectId===target))return fail(['context-event-already-suppressed'],'CONTEXT_SUPPRESSION_DUPLICATE');
  const compiled=compileFounderContextSuppression({targetEventId:target,founderAuthorizationReceipt:auth,observedAt});
  if(!compiled.ok)return fail(['valid-founder-suppression-required',...(compiled.reasonCodes||[])]);
  const appended=appendCognitiveJournalEvent({journalPath,compiledEvent:compiled.compiledEvent});
  if(!appended.ok)return fail(['suppression-journal-append-failed',...(appended.reasonCodes||[])],appended.status);
  return{ok:true,suppressVersion:SOVEREIGN_CONTEXT_SUPPRESS_VERSION,status:'CONTEXT_EVENT_SUPPRESSED_FROM_ORDINARY_RETRIEVAL',targetEventId:target,authorizationId:authId,directiveEventId:appended.eventId,journalSequence:appended.sequence,journalEntryDigest:appended.entryDigest,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects(),truthBoundary:'This appends a founder-authorized retrieval suppression directive. The target remains in the immutable journal and may remain in backups, replicas, or prior exports.'};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const journalPath=process.env.UBERBOND_CONTEXT_JOURNAL_PATH||null;
  const authorizationRoot=process.env.UBERBOND_FOUNDER_AUTHORIZATION_ROOT||null;
  const result=suppressContextEvent({journalPath,authorizationRoot,targetEventId:process.argv[2],authorizationId:process.argv[3]});
  process.stdout.write(`${JSON.stringify(result,null,2)}\n`);if(!result.ok)process.exitCode=2;
}
