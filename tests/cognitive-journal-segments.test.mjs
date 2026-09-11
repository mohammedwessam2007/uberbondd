import test from 'node:test';
import assert from 'node:assert/strict';
import { compileContextCognitiveEvent } from '../src/sovereign-context-fabric.mjs';
import { compileCognitiveJournalEntry } from '../src/cognitive-event-journal.mjs';
import { compileCognitiveJournalSegments, verifyCognitiveJournalSegments } from '../src/cognitive-journal-segments.mjs';

function entries(count=7){const rows=[];let previous=null;for(let i=0;i<count;i+=1){const event=compileContextCognitiveEvent({kind:'MEMORY_UPDATE',sourceNodeId:'context-spine',subjectType:'SEGMENT_TEST',subjectId:`row-${i}`,summary:`Segmented cognitive row ${i}`,evidenceRefs:[`test://row-${i}`],truthClass:'VERIFIED_CURRENT',observedAt:`2026-09-11T20:${String(i).padStart(2,'0')}:00Z`});assert.equal(event.ok,true);const compiled=compileCognitiveJournalEntry({compiledEvent:event,sequence:i+1,previousEntryDigest:previous});assert.equal(compiled.ok,true);rows.push(compiled.entry);previous=compiled.entry.entryDigest;}return rows;}

test('journal compiles into independently addressed chained segments and reconstructs exactly',()=>{const original=entries();const out=compileCognitiveJournalSegments(original,{segmentSize:3});assert.equal(out.ok,true);assert.equal(out.manifest.segmentCount,3);assert.equal(out.segments.map(s=>s.entryCount).join(','),'3,3,1');assert.match(out.manifest.manifestId,/^[a-f0-9]{64}$/);assert.equal(out.segments[1].previousSegmentDigest,out.segments[0].segmentDigest);const verified=verifyCognitiveJournalSegments(out);assert.equal(verified.ok,true);assert.deepEqual(verified.entries,original);assert.equal(verified.journalTipDigest,original.at(-1).entryDigest);});

test('segment reorder and deletion fail closed',()=>{const out=compileCognitiveJournalSegments(entries(),{segmentSize:2});const reordered=structuredClone(out);[reordered.segments[0],reordered.segments[1]]=[reordered.segments[1],reordered.segments[0]];assert.equal(verifyCognitiveJournalSegments(reordered).ok,false);const dropped=structuredClone(out);dropped.segments.splice(1,1);assert.equal(verifyCognitiveJournalSegments(dropped).ok,false);});

test('entry mutation inside a segment fails even when outer manifest is unchanged',()=>{const out=compileCognitiveJournalSegments(entries(),{segmentSize:3});const poisoned=structuredClone(out);poisoned.segments[0].entries[0].event.summary='poisoned history';assert.equal(verifyCognitiveJournalSegments(poisoned).ok,false);});

test('segment descriptor or prior-segment substitution fails',()=>{const out=compileCognitiveJournalSegments(entries(),{segmentSize:2});const mutated=structuredClone(out);mutated.segments[1].previousSegmentDigest='f'.repeat(64);assert.equal(verifyCognitiveJournalSegments(mutated).ok,false);const descriptor=structuredClone(out);descriptor.manifest.segments[0].endSequence=999;assert.equal(verifyCognitiveJournalSegments(descriptor).ok,false);});
