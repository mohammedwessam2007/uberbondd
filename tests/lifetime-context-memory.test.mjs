import test from 'node:test';
import assert from 'node:assert/strict';

import {
  compileLifetimeMemoryIndex,
  compileTaskContextPacket,
  compileMemoryHealthReceipt
} from '../src/lifetime-context-memory.mjs';

const NOW = '2026-09-06T01:00:00.000Z';
function item(overrides = {}) {
  return {
    id: 'm1',
    memoryClass: 'EVIDENCE',
    privacyClass: 'INTERNAL',
    truthClass: 'OBSERVED',
    observedAt: '2026-09-06T00:00:00.000Z',
    title: 'Observed provider state',
    summary: 'Provider callability has not been proven.',
    provenanceRefs: ['artifact:provider-state'],
    confidence: 0.95,
    importance: 0.9,
    economicWeight: 0.7,
    tags: ['provider', 'callability'],
    ...overrides
  };
}

test('lifetime memory requires provenance, valid truth/privacy classes and bounded confidence', () => {
  const result = compileLifetimeMemoryIndex({
    now: NOW,
    items: [item({ provenanceRefs: [], confidence: 2 })]
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.some(code => code.includes('provenance-required')));
  assert.ok(result.reasonCodes.some(code => code.includes('confidence-invalid')));
});

test('synthetic memories can never masquerade as observed history', () => {
  const result = compileLifetimeMemoryIndex({
    now: NOW,
    items: [item({ id: 'future', memoryClass: 'SYNTHETIC', truthClass: 'OBSERVED' })]
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.some(code => code.includes('synthetic-memory-must-remain-synthetic')));
});

test('superseded beliefs remain in lineage but are removed from active recall', () => {
  const result = compileLifetimeMemoryIndex({
    now: NOW,
    items: [
      item({ id: 'old', summary: 'Old belief', observedAt: '2026-09-01T00:00:00Z' }),
      item({ id: 'new', summary: 'Corrected belief', supersedes: ['old'] })
    ]
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(result.index.supersededItemIds, ['old']);
  assert.deepEqual(result.index.activeItemIds, ['new']);
  assert.equal(result.index.items.length, 2);
});

test('unknown supersede targets fail closed instead of silently erasing history', () => {
  const result = compileLifetimeMemoryIndex({
    now: NOW,
    items: [item({ id: 'new', supersedes: ['missing'] })]
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('unknown-superseded-memory:new:missing'));
});

test('unresolved contradiction groups remain explicit review warnings', () => {
  const result = compileLifetimeMemoryIndex({
    now: NOW,
    items: [
      item({ id: 'a', title: 'Price A', summary: 'Provider price is five.', contradictionGroup: 'provider-price' }),
      item({ id: 'b', title: 'Price B', summary: 'Provider price is ten.', contradictionGroup: 'provider-price', provenanceRefs: ['source:b'] })
    ]
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.index.unresolvedContradictions, [{ group: 'provider-price', activeIds: ['a', 'b'] }]);
  const health = compileMemoryHealthReceipt({ index: result.index });
  assert.equal(health.ok, false);
  assert.equal(health.unresolvedContradictions, 1);
});

test('task context excludes private and synthetic memory by default', () => {
  const built = compileLifetimeMemoryIndex({
    now: NOW,
    items: [
      item({ id: 'public', privacyClass: 'PUBLIC', title: 'Payment provider', summary: 'Payment provider public evidence.' }),
      item({ id: 'private', privacyClass: 'PRIVATE', memoryClass: 'WESSAM', title: 'Private note', summary: 'Owner private note.', provenanceRefs: ['memory:private'] }),
      item({ id: 'future', privacyClass: 'INTERNAL', memoryClass: 'SYNTHETIC', truthClass: 'SYNTHETIC', title: 'Synthetic future', summary: 'Possible future payment route.', provenanceRefs: ['simulation:1'] })
    ]
  });
  assert.equal(built.ok, true, JSON.stringify(built));
  const packet = compileTaskContextPacket({ index: built.index, query: 'payment provider', now: NOW });
  assert.equal(packet.ok, true);
  assert.deepEqual(packet.packet.selected.map(row => row.id), ['public']);
  assert.equal(packet.packet.syntheticIncluded, false);
});

test('explicit synthetic recall still preserves SYNTHETIC truth label', () => {
  const built = compileLifetimeMemoryIndex({
    now: NOW,
    items: [item({ id: 'future', memoryClass: 'SYNTHETIC', truthClass: 'SYNTHETIC', title: 'Future option', summary: 'Synthetic expansion option.', provenanceRefs: ['simulation:future'] })]
  });
  const packet = compileTaskContextPacket({ index: built.index, query: 'future expansion', includeSynthetic: true, now: NOW });
  assert.equal(packet.ok, true);
  assert.equal(packet.packet.selected[0].truthClass, 'SYNTHETIC');
  assert.equal(packet.packet.syntheticIncluded, true);
});

test('retrieval ranks relevant high-confidence economically important memory ahead of noise', () => {
  const built = compileLifetimeMemoryIndex({
    now: NOW,
    items: [
      item({ id: 'relevant', title: 'PayPal payment reconciliation', summary: 'Cleared payment requires provider-origin reconciliation and exact binding.', tags: ['paypal', 'payment'], confidence: 1, importance: 1, economicWeight: 1 }),
      item({ id: 'noise', title: 'Unrelated UI detail', summary: 'A decorative card has rounded corners.', tags: ['ui'], confidence: 0.8, importance: 0.2, economicWeight: 0 })
    ]
  });
  const packet = compileTaskContextPacket({ index: built.index, query: 'paypal payment reconciliation', now: NOW, maxItems: 2 });
  assert.equal(packet.ok, true);
  assert.equal(packet.packet.selected[0].id, 'relevant');
  assert.ok(packet.packet.selected[0].retrievalScore > packet.packet.selected[1].retrievalScore);
});

test('task context is a bounded working-memory packet with measurable reduction', () => {
  const items = Array.from({ length: 50 }, (_, index) => item({
    id: `m-${index}`,
    title: index === 42 ? 'Target capability evidence' : `Noise ${index}`,
    summary: index === 42 ? 'capability genome world harvester evidence' : 'unrelated historical memory',
    provenanceRefs: [`source:${index}`]
  }));
  const built = compileLifetimeMemoryIndex({ now: NOW, items });
  const packet = compileTaskContextPacket({ index: built.index, query: 'capability genome world harvester', maxItems: 5, now: NOW });
  assert.equal(packet.ok, true);
  assert.equal(packet.packet.selected.length, 5);
  assert.equal(packet.packet.selected[0].id, 'm-42');
  assert.equal(packet.packet.minimization.sourceItemCount, 50);
  assert.equal(packet.packet.minimization.selectedItemCount, 5);
  assert.equal(packet.packet.minimization.reductionRatio, 0.9);
  assert.equal(packet.packet.consequenceAuthority, 'NONE');
});

test('memory health stays healthy when contradiction and provenance invariants hold', () => {
  const built = compileLifetimeMemoryIndex({ now: NOW, items: [item()] });
  const health = compileMemoryHealthReceipt({ index: built.index });
  assert.deepEqual({ ok: health.ok, status: health.status, missing: health.missingProvenance.length }, {
    ok: true,
    status: 'LIFETIME_MEMORY_HEALTHY',
    missing: 0
  });
  assert.equal(health.businessEffectAuthority, 'NONE');
});
