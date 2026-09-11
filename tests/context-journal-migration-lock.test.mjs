import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { compileContextCognitiveEvent } from '../src/sovereign-context-fabric.mjs';
import { appendCognitiveJournalEvent } from '../src/cognitive-event-journal.mjs';
import { readContextJournalRuntime } from '../src/context-journal-runtime.mjs';
import { migrateContextJournalToLayeredStore } from '../scripts/sovereign-context-journal-migrate.mjs';

function seed(dir){const journal=path.join(dir,'events.jsonl');const event=compileContextCognitiveEvent({kind:'MEMORY_UPDATE',sourceNodeId:'context-spine',subjectType:'MIGRATION_LOCK_TEST',subjectId:'lock',summary:'Migration lock row.',evidenceRefs:['test://lock'],truthClass:'VERIFIED_CURRENT',observedAt:'2026-09-11T21:40:00Z'});assert.equal(event.ok,true);assert.equal(appendCognitiveJournalEvent({journalPath:journal,compiledEvent:event}).ok,true);return journal;}

test('migration shares the legacy writer lock and refuses concurrent cutover',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ub-migrate-lock-'));try{const journal=seed(dir);const fd=fs.openSync(`${journal}.lock`,'wx',0o600);try{const out=migrateContextJournalToLayeredStore({journalPath:journal});assert.equal(out.ok,false);assert.equal(out.status,'CONTEXT_JOURNAL_MIGRATION_BUSY');assert.ok(out.reasonCodes.includes('journal-writer-lock-held'));}finally{fs.closeSync(fd);fs.unlinkSync(`${journal}.lock`);}}finally{fs.rmSync(dir,{recursive:true,force:true});}});

test('active store refuses missing tail rather than silently reverting to archived prefix',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ub-missing-tail-'));try{const journal=seed(dir);assert.equal(migrateContextJournalToLayeredStore({journalPath:journal}).ok,true);fs.unlinkSync(path.join(dir,'journal-store','tail.jsonl'));const out=readContextJournalRuntime({journalPath:journal});assert.equal(out.ok,false);assert.equal(out.status,'CONTEXT_JOURNAL_LAYERED_INVALID');assert.ok(out.reasonCodes.includes('layered-tail-read-failed'));}finally{fs.rmSync(dir,{recursive:true,force:true});}});

test('sovereign migration wrapper serializes with the authoring pulse lock and stays local',()=>{const wrapper=readFileSync(new URL('../ops/sovereign/uberbond-context-journal-migrate',import.meta.url),'utf8');assert.match(wrapper,/authoring-pulse\.lock/);assert.match(wrapper,/flock -n 9/);assert.match(wrapper,/sovereign-context-journal-migrate\.mjs/);assert.doesNotMatch(wrapper,/curl|wget|https?:\/\//i);});
