import test from 'node:test';
import assert from 'node:assert/strict';
import { compileContextCognitiveEvent } from '../src/sovereign-context-fabric.mjs';
import { compileCognitiveJournalEntry } from '../src/cognitive-event-journal.mjs';
import { compileCognitiveJournalSegments } from '../src/cognitive-journal-segments.mjs';
import { compileLayeredCognitiveJournalStore, verifyCognitiveJournalTail } from '../src/cognitive-journal-layered-store.mjs';

function entries(count=6){const rows=[];let previous=null;for(let i=0;i<count;i+=1){const event=compileContextCognitiveEvent({kind:'MEMORY_UPDATE',sourceNodeId:'context-spine',subjectType:'LAYERED_TEST',subjectId:`layered-${i}`,summary:`Layered journal event ${i}`,evidenceRefs:[`test://layered-${i}`],truthClass:'VERIFIED_CURRENT',observedAt:`2026-09-11T21:0${i}:00Z`});assert.equal(event.ok,true);const row=compileCognitiveJournalEntry({compiledEvent:event,sequence:i+1,previousEntryDigest:previous});assert.equal(row.ok,true);rows.push(row.entry);previous=row.entry.entryDigest;}return rows;}
function fixture(){const all=entries(6);const archiveRows=all.slice(0,4);const tailEntries=all.slice(4);const archive=compileCognitiveJournalSegments(archiveRows,{segmentSize:2});assert.equal(archive.ok,true);return{all,archive,tailEntries};}

test('layered store preserves exact archive to tail continuity',()=>{const f=fixture();const out=compileLayeredCognitiveJournalStore({manifest:f.archive.manifest,segments:f.archive.segments,tailEntries:f.tailEntries});assert.equal(out.ok,true);assert.equal(out.descriptor.archiveEntryCount,4);assert.equal(out.descriptor.tailEntryCount,2);assert.equal(out.descriptor.totalEntries,6);assert.equal(out.descriptor.journalTipDigest,f.all.at(-1).entryDigest);assert.match(out.descriptor.storeId,/^[a-f0-9]{64}$/);});

test('tail cannot skip sequence or detach from archive tip',()=>{const f=fixture();const skipped=structuredClone(f.tailEntries);skipped[0].sequence+=1;assert.equal(verifyCognitiveJournalTail({archiveEntryCount:4,archiveTipDigest:f.archive.manifest.journalTipDigest,tailEntries:skipped}).ok,false);const detached=structuredClone(f.tailEntries);detached[0].previousEntryDigest='f'.repeat(64);assert.equal(verifyCognitiveJournalTail({archiveEntryCount:4,archiveTipDigest:f.archive.manifest.journalTipDigest,tailEntries:detached}).ok,false);});

test('tail event mutation fails canonical recompile',()=>{const f=fixture();const mutated=structuredClone(f.tailEntries);mutated[0].event.summary='mutated after journal admission';const out=verifyCognitiveJournalTail({archiveEntryCount:4,archiveTipDigest:f.archive.manifest.journalTipDigest,tailEntries:mutated});assert.equal(out.ok,false);});
