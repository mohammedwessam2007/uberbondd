import test from 'node:test';
import assert from 'node:assert/strict';
import { crystallizeParametricOperator, instantiateParametricOperator } from '../src/omega-operator-crystallizer.mjs';

const traces = [
  [
    { op: 'RETRIEVE', args: { entity: 'alpha', source: 'canon' } },
    { op: 'COMPARE', args: { candidate: 'x', mode: 'strict' } },
    { op: 'VERIFY', args: { candidate: 'x', verifier: 'deterministic' } }
  ],
  [
    { op: 'RETRIEVE', args: { entity: 'beta', source: 'canon' } },
    { op: 'COMPARE', args: { candidate: 'y', mode: 'strict' } },
    { op: 'VERIFY', args: { candidate: 'y', verifier: 'deterministic' } }
  ]
];

test('repeated successful-shaped traces crystallize into constants plus typed slots', () => {
  const out = crystallizeParametricOperator({ traces, name: 'retrieve-compare-verify' });
  assert.equal(out.ok, true);
  assert.equal(out.crystal.trainingTraceCount, 2);
  assert.equal(out.crystal.promotionAuthority, 'NONE');
  assert.equal(out.crystal.requiresHeldOutVerification, true);
  assert.equal(out.crystal.template[0].args.source.kind, 'CONST');
  assert.equal(out.crystal.template[0].args.entity.kind, 'SLOT');
  assert.equal(out.crystal.template[1].args.mode.kind, 'CONST');
  assert.match(out.truthBoundary, /does not prove semantic equivalence/i);
});

test('a crystal instantiates a new held-out-shaped trajectory without granting execution authority', () => {
  const crystal = crystallizeParametricOperator({ traces }).crystal;
  const bindings = Object.fromEntries(crystal.slots.map(slot => {
    if (slot.key === 'entity') return [slot.slotId, 'gamma'];
    return [slot.slotId, 'z'];
  }));
  const out = instantiateParametricOperator({ crystal, bindings });
  assert.equal(out.ok, true);
  assert.equal(out.trace[0].args.entity, 'gamma');
  assert.equal(out.trace[0].args.source, 'canon');
  assert.equal(out.trace[1].args.candidate, 'z');
  assert.equal(out.trace[2].args.candidate, 'z');
  assert.equal(out.verificationRequired, true);
  assert.equal(out.executionAuthority, 'NONE');
});

test('shape mismatch and binding type mismatch fail closed', () => {
  const bad = crystallizeParametricOperator({ traces: [traces[0], [{ op: 'DIFFERENT', args: { entity: 'beta', source: 'canon' } }]] });
  assert.equal(bad.ok, false);

  const crystal = crystallizeParametricOperator({ traces }).crystal;
  const bindings = Object.fromEntries(crystal.slots.map(slot => [slot.slotId, slot.valueType === 'string' ? 'ok' : 1]));
  const first = crystal.slots[0];
  bindings[first.slotId] = 42;
  const refused = instantiateParametricOperator({ crystal, bindings });
  assert.equal(refused.ok, false);
  assert.ok(refused.reasonCodes.includes('binding-type-mismatch'));
});
