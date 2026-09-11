import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileFounderContextAuthorization } from '../src/context-privacy.mjs';
import { checkpointSovereignContext } from '../scripts/sovereign-context-checkpoint.mjs';
import { mountSovereignContext } from '../scripts/sovereign-context-mount.mjs';
import { migrateContextJournalToLayered } from '../scripts/sovereign-context-layered-migrate.mjs';
import { readConfiguredRuntimeCognitiveJournal } from '../scripts/sovereign-cognitive-journal-configured-runtime.mjs';
import { suppressContextEvent } from '../scripts/sovereign-context-suppress.mjs';

const repoRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

test('canonical Context paths continue one brain across live layered activation',()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'ub-layered-integration-'));const journal=path.join(root,'events.jsonl');const capsule=path.join(root,'brainstate.json');const mountCache=path.join(root,'mount.json');const authRoot=path.join(root,'authorizations');fs.mkdirSync(authRoot,{mode:0o700});try{
  const first=checkpointSovereignContext({rootDir:repoRoot,journalPath:journal,capsulePath:capsule,mission:'verify layered Context integration',generatedAt:'2026-09-12T02:00:00Z'});assert.equal(first.ok,true);assert.equal(first.journalSequence,1);
  const legacyBytes=fs.readFileSync(journal,'utf8');
  const migrated=migrateContextJournalToLayered({journalPath:journal,segmentSize:2,activatedAt:'2026-09-12T02:01:00Z'});assert.equal(migrated.ok,true);assert.equal(migrated.entryCount,1);
  const mounted=mountSovereignContext({rootDir:repoRoot,journalPath:journal,capsuleCachePath:capsule,mountCachePath:mountCache,mission:'verify layered Context integration',generatedAt:'2026-09-12T02:02:00Z'});assert.equal(mounted.ok,true);assert.equal(mounted.journalRuntimeMode,'ARCHIVE_PLUS_TAIL');assert.equal(mounted.journalRuntimeStateId,migrated.runtimeStateId);assert.equal(mounted.journalArchiveEntryCount,1);
  const second=checkpointSovereignContext({rootDir:repoRoot,journalPath:journal,capsulePath:capsule,mission:'verify layered Context integration',generatedAt:'2026-09-12T02:03:00Z'});assert.equal(second.ok,true);assert.equal(second.journalSequence,2);assert.equal(second.journalRuntimeMode,'ARCHIVE_PLUS_TAIL');assert.equal(fs.readFileSync(journal,'utf8'),legacyBytes);
  const auth=compileFounderContextAuthorization({targetEventId:first.eventId,founderConfirmed:true,issuedAt:'2026-09-12T02:04:00Z'});assert.equal(auth.ok,true);fs.writeFileSync(path.join(authRoot,`${auth.receipt.authorizationId}.json`),JSON.stringify(auth.receipt),{mode:0o600});
  const suppressed=suppressContextEvent({journalPath:journal,authorizationRoot:authRoot,targetEventId:first.eventId,authorizationId:auth.receipt.authorizationId,observedAt:'2026-09-12T02:05:00Z'});assert.equal(suppressed.ok,true);assert.equal(suppressed.journalSequence,3);assert.equal(suppressed.journalRuntimeMode,'ARCHIVE_PLUS_TAIL');
  const logical=readConfiguredRuntimeCognitiveJournal({journalPath:journal});assert.equal(logical.ok,true);assert.equal(logical.entryCount,3);assert.equal(logical.archiveEntryCount,1);assert.equal(logical.tailEntryCount,2);
  const remounted=mountSovereignContext({rootDir:repoRoot,journalPath:journal,capsuleCachePath:capsule,mountCachePath:null,mission:'verify layered Context integration',maxHistoricalEvents:8,generatedAt:'2026-09-12T02:06:00Z'});assert.equal(remounted.ok,true);assert.equal(remounted.mount.cognitiveHistory.events.some(event=>event.eventId===first.eventId),false);assert.equal(remounted.mount.cognitiveHistory.suppressedEventCount,1);assert.equal(fs.readFileSync(journal,'utf8'),legacyBytes);
}finally{fs.rmSync(root,{recursive:true,force:true});}});
