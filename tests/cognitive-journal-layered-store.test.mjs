import test from 'node:test';
import assert from 'node:assert/strict';
import { compileContextCognitiveEvent } from '../src/sovereign-context-fabric.mjs';
import { compileCognitiveJournalEntry } from '../src/cognitive-event-journal.mjs';
import { compileCognitiveJournalSegments } from '../src/cognitive-journal-segments.mjs';
import { compileLayeredCognitiveJournalStore, verifyCognitiveJournalTail } from '../src/cognitive-journal-layered-store.mjs';

function entries(count=6){const rows=[];let previous=null;for(let i=0;i<count;i+=1){const event=compileContextCognitiveEvent({kind:'MEMORY_UPDATE',sourceNodeId:'context-spine',subjectType:'LAYERED_TEST',subjectId:`layered-${i}`,summary:`Layered journal event ${i}`,evidenceRefs:[`test://layered-${i}`],truthClass:'VERIFIED_CURRENT',observedAt:`2026-09-11T21:0${i}:00Z`});assert.equal(event.ok,true);const row=compileCognitiveJournalEntry({compiledEvent:event,sequence:i+1,previousEntryDigest:previous});assert.equal(row.ok,true);rows.push(row.entry);previous=row.entry.entryDigest;}return rows;}
function fixture(){const all=entries(6);const archiveRows=all.slice(0,4);const tailEntries=all.slice(4);const archive=compileCognitiveJournalSegments(archiveRows,{segmentSize:2});assert.equal(archive.ok,true);return{all,archive,tailEntries};}
