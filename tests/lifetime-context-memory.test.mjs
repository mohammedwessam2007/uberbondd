import test from 'node:test';
import assert from 'node:assert/strict';

import { compileLifetimeMemoryIndex, compileTaskContextPacket, compileMemoryHealthReceipt } from '../src/lifetime-context-memory.mjs';

const NOW = '2026-09-06T01:00:00.000Z';
function item(overrides = {}) {
  return { id:'m1', memoryClass:'EVIDENCE', privacyClass:'INTERNAL', truthClass:'OBSERVED', observedAt:'2026-09-06T00:00:00.000Z', title:'Observed provider state', summary:'Provider callability has not been proven.', provenanceRefs:['artifact:provider-state'], confidence:0.95, importance:0.9, economicWeight:0.7, tags:['provider','callability'], ...overrides };
}

test('lifetime memory requires provenance and bounded confidence', () => {
  const result = compileLifetimeMemoryIndex({ now:NOW, items:[item({ provenanceRefs:[], confidence:2 })] });
  assert.equal(result.ok,false);
  assert.ok(result.reasonCodes.some(code=>code.includes('provenance-required')));
  assert.ok(result.reasonCodes.some(code=>code.includes('confidence-invalid')));
});

test('synthetic memories can never masquerade as observed history', () => {
  const result = compileLifetimeMemoryIndex({ now:NOW, items:[item({ id:'future', memoryClass:'SYNTHETIC', truthClass:'OBSERVED' })] });
  assert.equal(result.ok,false);
  assert.ok(result.reasonCodes.some(code=>code.includes('synthetic-memory-must-remain-synthetic')));
});

test('superseded beliefs remain in lineage but leave active recall', () => {
  const result = compileLifetimeMemoryIndex({ now:NOW, items:[item({id:'old',summary:'Old belief',observedAt:'2026-09-01T00:00:00Z'}),item({id:'new',summary:'Corrected belief',supersedes:['old']})] });
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.deepEqual(result.index.supersededItemIds,['old']);
  assert.deepEqual(result.index.activeItemIds,['new']);
});

test('unknown supersede targets fail closed', () => {
  const result = compileLifetimeMemoryIndex({ now:NOW, items:[item({id:'new',supersedes:['missing']})] });
  assert.equal(result.ok,false);
  assert.ok(result.reasonCodes.includes('unknown-superseded-memory:new:missing'));
});

test('unresolved contradictions remain explicit review warnings', () => {
  const result = compileLifetimeMemoryIndex({ now:NOW, items:[item({id:'a',contradictionGroup:'provider-price'}),item({id:'b',summary:'Different price',provenanceRefs:['source:b'],contradictionGroup:'provider-price'})] });
  assert.equal(result.ok,true);
  assert.equal(result.index.unresolvedContradictions.length,1);
  assert.equal(compileMemoryHealthReceipt({index:result.index}).ok,false);
});

test('task context excludes private and synthetic memory by default', () => {
  const built = compileLifetimeMemoryIndex({ now:NOW, items:[item({id:'public',privacyClass:'PUBLIC',title:'Payment provider',summary:'Payment provider public evidence.'}),item({id:'private',privacyClass:'PRIVATE',memoryClass:'WESSAM',title:'Private note',summary:'Owner private note.',provenanceRefs:['memory:private']}),item({id:'future',memoryClass:'SYNTHETIC',truthClass:'SYNTHETIC',title:'Synthetic future',summary:'Possible future payment route.',provenanceRefs:['simulation:1']})] });
  const packet = compileTaskContextPacket({index:built.index,query:'payment provider',now:NOW});
  assert.equal(packet.ok,true);
  assert.deepEqual(packet.packet.selected.map(row=>row.id),['public']);
  assert.equal(packet.packet.syntheticIncluded,false);
});

test('explicit synthetic recall preserves SYNTHETIC label', () => {
  const built = compileLifetimeMemoryIndex({now:NOW,items:[item({id:'future',memoryClass:'SYNTHETIC',truthClass:'SYNTHETIC',title:'Future option',summary:'Synthetic expansion option.',provenanceRefs:['simulation:future']})]});
  const packet = compileTaskContextPacket({index:built.index,query:'future expansion',includeSynthetic:true,now:NOW});
  assert.equal(packet.packet.selected[0].truthClass,'SYNTHETIC');
});

test('retrieval ranks relevant economically important evidence ahead of noise', () => {
  const built = compileLifetimeMemoryIndex({now:NOW,items:[item({id:'relevant',title:'PayPal payment reconciliation',summary:'Cleared payment requires provider-origin reconciliation and exact binding.',tags:['paypal','payment'],confidence:1,importance:1,economicWeight:1}),item({id:'noise',title:'Unrelated UI detail',summary:'A decorative card has rounded corners.',tags:['ui'],confidence:0.8,importance:0.2,economicWeight:0})]});
  const packet=compileTaskContextPacket({index:built.index,query:'paypal payment reconciliation',now:NOW,maxItems:2});
  assert.equal(packet.packet.selected[0].id,'relevant');
  assert.ok(packet.packet.selected[0].retrievalScore>packet.packet.selected[1].retrievalScore);
});

test('task context is bounded working memory with measurable reduction', () => {
  const items=Array.from({length:50},(_,index)=>item({id:`m-${index}`,title:index===42?'Target capability evidence':`Noise ${index}`,summary:index===42?'capability genome world harvester evidence':'unrelated historical memory',provenanceRefs:[`source:${index}`]}));
  const built=compileLifetimeMemoryIndex({now:NOW,items});
  const packet=compileTaskContextPacket({index:built.index,query:'capability genome world harvester',maxItems:5,now:NOW});
  assert.equal(packet.packet.selected.length,5);
  assert.equal(packet.packet.selected[0].id,'m-42');
  assert.equal(packet.packet.minimization.reductionRatio,0.9);
  assert.equal(packet.packet.consequenceAuthority,'NONE');
});
