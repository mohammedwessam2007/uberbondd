import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { bindConstitution } from '../src/omnia-v9/constitution.mjs';

const manifest = JSON.parse(await fs.readFile(new URL('../config/omnia-v9/constitution-sources.json', import.meta.url), 'utf8'));

function textFor(source, extra = '') {
  return Buffer.from(`# ${source.title}\n\n> Formal source — Version ${source.version}  \n> Effective date: ${source.effectiveDate}\n\n${source.anchors.join('\n\n')}\n${extra}\n`, 'utf8');
}
function sources(m = manifest) {
  return new Map(m.sources.map(source => [source.role, textFor(source)]));
}
function clone(value) { return structuredClone(value); }

test('binds the complete four-role normative source set deterministically', () => {
  const first = bindConstitution({ manifest, sourceBytesByRole: sources() });
  const second = bindConstitution({ manifest, sourceBytesByRole: sources() });
  assert.equal(first.constitutionDigest, second.constitutionDigest);
  assert.equal(first.sourceSet.sources.length, 4);
  assert.deepEqual(first.sourceSet.sources.map(s => s.role), ['CORE_DATA_MODEL','DECISION_ENGINE','KNOWLEDGE_GRAPH','LEARNING_ENGINE']);
});

test('input map order cannot change the constitution digest', () => {
  const forward = sources();
  const reverse = new Map([...forward.entries()].reverse());
  assert.equal(bindConstitution({ manifest, sourceBytesByRole: forward }).constitutionDigest, bindConstitution({ manifest, sourceBytesByRole: reverse }).constitutionDigest);
});

test('changing one source byte changes both source-set and constitution digest', () => {
  const original = sources();
  const changed = sources();
  changed.set('DECISION_ENGINE', Buffer.concat([changed.get('DECISION_ENGINE'), Buffer.from('\nnew normative byte')]));
  const a = bindConstitution({ manifest, sourceBytesByRole: original });
  const b = bindConstitution({ manifest, sourceBytesByRole: changed });
  assert.notEqual(a.sourceSetDigest, b.sourceSetDigest);
  assert.notEqual(a.constitutionDigest, b.constitutionDigest);
});

test('missing required source is INCOMPLETE, never a partial constitution', () => {
  const map = sources();
  map.delete('KNOWLEDGE_GRAPH');
  assert.throws(() => bindConstitution({ manifest, sourceBytesByRole: map }), error => error.code === 'INCOMPLETE');
});

test('unexpected source role fails closed rather than silently expanding constitution', () => {
  const map = sources();
  map.set('SURPRISE_CONSTITUTION', Buffer.from('# Surprise'));
  assert.throws(() => bindConstitution({ manifest, sourceBytesByRole: map }), /unexpected source role/);
});

test('duplicate role is a canonical conflict', () => {
  const m = clone(manifest);
  m.sources.push({ ...m.sources[0], path: 'different.md' });
  assert.throws(() => bindConstitution({ manifest: m, sourceBytesByRole: sources() }), error => error.code === 'CANONICAL_CONFLICT');
});

test('duplicate path is a canonical conflict', () => {
  const m = clone(manifest);
  m.sources[1].path = m.sources[0].path;
  assert.throws(() => bindConstitution({ manifest: m, sourceBytesByRole: sources(m) }), /duplicate source path/);
});

test('missing normative dependency is INCOMPLETE', () => {
  const m = clone(manifest);
  m.sources = m.sources.filter(source => source.role !== 'KNOWLEDGE_GRAPH');
  assert.throws(() => bindConstitution({ manifest: m, sourceBytesByRole: sources(m) }), error => error.code === 'INCOMPLETE');
});

test('normative dependency cycle is rejected', () => {
  const m = clone(manifest);
  m.sources.find(s => s.role === 'KNOWLEDGE_GRAPH').requiresRoles = ['CORE_DATA_MODEL'];
  assert.throws(() => bindConstitution({ manifest: m, sourceBytesByRole: sources(m) }), /dependency cycle/);
});

test('source version mismatch is a canonical conflict', () => {
  const map = sources();
  map.set('DECISION_ENGINE', Buffer.from(map.get('DECISION_ENGINE').toString('utf8').replace('Version 1.0.0', 'Version 1.1.0')));
  assert.throws(() => bindConstitution({ manifest, sourceBytesByRole: map }), /version mismatch/);
});

test('effective-date mismatch is a canonical conflict', () => {
  const map = sources();
  map.set('LEARNING_ENGINE', Buffer.from(map.get('LEARNING_ENGINE').toString('utf8').replace('2026-07-14', '2026-07-15')));
  assert.throws(() => bindConstitution({ manifest, sourceBytesByRole: map }), /effective date mismatch/);
});

test('missing normative anchor is a canonical conflict', () => {
  const map = sources();
  const missing = manifest.sources.find(source => source.role === 'CORE_DATA_MODEL').anchors[2];
  map.set('CORE_DATA_MODEL', Buffer.from(map.get('CORE_DATA_MODEL').toString('utf8').replace(missing, '')));
  assert.throws(() => bindConstitution({ manifest, sourceBytesByRole: map }), /missing normative anchor/);
});

test('precedence rule must be anchored in the named normative source', () => {
  const m = clone(manifest);
  m.precedenceRules[0].anchor = 'AI MADE THIS RULE UP';
  assert.throws(() => bindConstitution({ manifest: m, sourceBytesByRole: sources(m) }), /not anchored in source/);
});

test('learning precedence explicitly binds non-waivable Decision gates over learning changes', () => {
  const bundle = bindConstitution({ manifest, sourceBytesByRole: sources() });
  const rule = bundle.sourceSet.precedenceRules.find(rule => rule.id === 'DECISION_NON_WAIVABLE_GATE_OVER_LEARNING');
  assert.equal(rule.higher, 'DECISION_ENGINE.NON_WAIVABLE_GATE');
  assert.equal(rule.lower, 'LEARNING_ENGINE.PROPOSED_CHANGE');
});

test('graph priors are explicitly prevented from becoming external claims by themselves', () => {
  const bundle = bindConstitution({ manifest, sourceBytesByRole: sources() });
  assert(bundle.sourceSet.precedenceRules.some(rule => rule.id === 'CURRENT_EVIDENCE_OVER_GRAPH_PRIOR_FOR_EXTERNAL_CLAIMS'));
});

test('bundle declares exact-source binding, not executable-policy equivalence', () => {
  const bundle = bindConstitution({ manifest, sourceBytesByRole: sources() });
  assert.equal(bundle.semantics, 'EXACT_SOURCE_BINDING_NOT_EXECUTABLE_POLICY');
});
