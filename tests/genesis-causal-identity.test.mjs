import test from 'node:test';
import assert from 'node:assert/strict';
import {
  semanticStatementIdentity,
  semanticPrimitiveId,
  causalSignature,
  normalizeDonorMechanism,
  decomposeToPrimitives,
  mutateAssumptions,
  recombineAcrossDonors,
  compileGenesisMechanisms
} from '../src/genesis-mechanism-compiler.mjs';

const donor = ({ id, does, exploits, assumptions = ['the mechanism continues to hold'] }) => normalizeDonorMechanism({
  mechanismId: id,
  domain: 'synthetic-causal-test',
  does,
  exploits,
  effects: ['a measurable outcome changes'],
  assumptions,
  evidenceClass: 'VERIFIED_FACT',
  source: { kind: 'OBSERVED_SYSTEM', ref: `fixture:${id}`, observedAt: '2026-09-08T00:00:00.000Z' }
});

test('genuine state/restatement paraphrases still dedupe', () => {
  assert.equal(
    semanticStatementIdentity('idle capacity becomes billable revenue'),
    semanticStatementIdentity('revenue from idle capacity becomes billable')
  );
  assert.equal(
    semanticStatementIdentity('capacity sits idle'),
    semanticStatementIdentity('idle sits capacity')
  );
});

test('actor direction is identity: alpha funds beta is not beta funds alpha', () => {
  const forward = semanticStatementIdentity('alpha funds beta');
  const reverse = semanticStatementIdentity('beta funds alpha');
  assert.notEqual(forward, reverse);
  assert.notEqual(semanticPrimitiveId('ACTION', 'alpha funds beta'), semanticPrimitiveId('ACTION', 'beta funds alpha'));
});

test('temporal direction is identity while fronted equivalent phrasing still dedupes', () => {
  const before = semanticStatementIdentity('verify payment before delivery');
  const fronted = semanticStatementIdentity('before delivery, verify the payment');
  const after = semanticStatementIdentity('verify payment after delivery');
  assert.equal(before, fronted, 'fronting the same before-clause is not a new mechanism');
  assert.notEqual(before, after, 'before and after are different causal mechanisms');
});

test('from/to entity roles are preserved', () => {
  assert.notEqual(
    semanticStatementIdentity('transfer funds from alpha to beta'),
    semanticStatementIdentity('transfer funds from beta to alpha')
  );
});

test('multiplicity is preserved instead of erased by Set canonicalization', () => {
  assert.notEqual(
    semanticStatementIdentity('alpha funds beta'),
    semanticStatementIdentity('alpha alpha funds beta')
  );
});

test('unknown action-like equivalence is conservative rather than forcibly merged', () => {
  assert.notEqual(
    semanticStatementIdentity('alpha blocks beta'),
    semanticStatementIdentity('beta blocks alpha')
  );
  assert.notEqual(
    semanticStatementIdentity('alpha can block beta'),
    semanticStatementIdentity('beta can block alpha')
  );
});

test('causalSignature preserves direction even when primitive id inputs are absent', () => {
  assert.notEqual(
    causalSignature({ exploits: ['payer refunds seller'] }),
    causalSignature({ exploits: ['seller refunds payer'] })
  );
  assert.equal(
    causalSignature({ exploits: ['capacity sits idle'] }),
    causalSignature({ exploits: ['idle sits capacity'] })
  );
});

test('decomposition emits direction-safe primitive ids', () => {
  const forward = donor({ id: 'forward', does: 'alpha funds beta', exploits: 'alpha funds beta' });
  const reverse = donor({ id: 'reverse', does: 'beta funds alpha', exploits: 'beta funds alpha' });
  const a = decomposeToPrimitives({ mechanism: forward });
  const b = decomposeToPrimitives({ mechanism: reverse });
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  const actionA = a.primitives.find(row => row.role === 'ACTION');
  const actionB = b.primitives.find(row => row.role === 'ACTION');
  assert.notEqual(actionA.primitiveId, actionB.primitiveId);
  assert.notEqual(actionA.semanticIdentity, actionB.semanticIdentity);
});

test('same-role reversed preconditions survive before any lossy core dedupe', () => {
  const mechanism = normalizeDonorMechanism({
    mechanismId: 'same-role-reversal',
    domain: 'synthetic-causal-test',
    does: 'route verified work',
    exploits: 'capacity sits idle',
    preconditions: ['alpha funds beta', 'beta funds alpha'],
    effects: ['a measurable outcome changes'],
    assumptions: ['the mechanism continues to hold'],
    evidenceClass: 'VERIFIED_FACT',
    source: { kind: 'OBSERVED_SYSTEM', ref: 'fixture:same-role-reversal', observedAt: '2026-09-08T00:00:00.000Z' }
  });
  assert.equal(mechanism.ok, true);
  const decomposed = decomposeToPrimitives({ mechanism });
  assert.equal(decomposed.ok, true);
  const preconditions = decomposed.primitives.filter(row => row.role === 'PRECONDITION');
  assert.equal(preconditions.length, 2, 'the mature core must not erase one before hardening');
  assert.notEqual(preconditions[0].primitiveId, preconditions[1].primitiveId);
  assert.notEqual(preconditions[0].semanticIdentity, preconditions[1].semanticIdentity);
});

test('assumption mutation variants retain distinct hardened signatures', () => {
  const mechanism = donor({
    id: 'mutation',
    does: 'alpha routes work to beta',
    exploits: 'alpha routes work to beta',
    assumptions: ['alpha pays beta', 'delivery happens after verification']
  });
  const mutated = mutateAssumptions({ mechanism });
  assert.equal(mutated.ok, true);
  assert.equal(new Set(mutated.variants.map(row => row.causalSignature)).size, mutated.variantCount);
});

test('recombination does not collapse directionally different primitives', () => {
  const forward = decomposeToPrimitives({ mechanism: donor({ id: 'd1', does: 'alpha funds beta', exploits: 'alpha funds beta' }) }).primitives.find(row => row.role === 'ACTION');
  const reverse = decomposeToPrimitives({ mechanism: donor({ id: 'd2', does: 'beta funds alpha', exploits: 'beta funds alpha' }) }).primitives.find(row => row.role === 'ACTION');
  const third = decomposeToPrimitives({ mechanism: donor({ id: 'd3', does: 'capacity sits idle', exploits: 'capacity sits idle' }) }).primitives.find(row => row.role === 'CONSTRAINT');
  const result = recombineAcrossDonors({ primitives: [forward, reverse, third] });
  assert.equal(result.ok, true);
  assert.ok(result.candidateCount >= 3, 'directionally distinct pairs must survive dedupe');
});

test('full compiler uses hardened facade end-to-end and creates no authority', () => {
  const result = compileGenesisMechanisms({ donors: [
    {
      mechanismId: 'a', domain: 'x', does: 'alpha funds beta', exploits: 'alpha funds beta',
      effects: ['capacity sits idle'], assumptions: ['delivery happens after verification'], evidenceClass: 'VERIFIED_FACT',
      source: { kind: 'OBSERVED_SYSTEM', ref: 'fixture:a', observedAt: '2026-09-08T00:00:00.000Z' }
    },
    {
      mechanismId: 'b', domain: 'y', does: 'beta funds alpha', exploits: 'beta funds alpha',
      effects: ['idle capacity becomes billable revenue'], assumptions: ['delivery happens before settlement'], evidenceClass: 'VERIFIED_FACT',
      source: { kind: 'OBSERVED_SYSTEM', ref: 'fixture:b', observedAt: '2026-09-08T00:00:00.000Z' }
    }
  ] });
  assert.equal(result.ok, true);
  assert.equal(result.businessEffectAuthority, 'NONE');
  assert.ok(result.primitives.every(row => typeof row.semanticIdentity === 'string'));
  assert.equal(JSON.stringify(result).includes('"validated":true'), false);
});
