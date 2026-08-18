import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  compileMechanismAtom,
  extractMechanismAtoms,
  recombineMechanismAtoms,
  redTeamMechanismCandidate,
  logMechanismLabReceipt,
  MECHANISM_LAB_POLICY_VERSION
} from '../src/mechanism-lab.mjs';
import { createJobHandlers } from '../src/job-handlers.mjs';

const date = new Date('2026-08-18T12:00:00.000Z');

function atom(overrides = {}) {
  return compileMechanismAtom({
    atomId: 'atom:one', type: 'VALUE', description: 'Evidence-backed journey reliability review',
    evidenceRefs: ['evidence:model-1'], evidenceClass: 'SUPPORTED_INFERENCE', date, ...overrides
  });
}

test('atoms require structured type, description, and evidence references', () => {
  assert.equal(compileMechanismAtom({ type: 'VALUE', description: 'x', date }).ok, false);
  assert.equal(compileMechanismAtom({ atomId: 'a', type: 'MAGIC', description: 'x', evidenceRefs: ['evidence:1'], date }).ok, false);
  const invalid = atom({ evidenceRefs: ['https://private/raw'] });
  assert.ok(invalid.reasonCodes.includes('evidence-reference-format-invalid'));
});

test('atom compilation preserves evidence class and unknown commercial fields', () => {
  const result = atom();
  assert.equal(result.status, 'EVIDENCE_REFERENCED_NOT_PROMOTED');
  assert.equal(result.evidenceClass, 'SUPPORTED_INFERENCE');
  assert.equal(result.recurrence, 'UNKNOWN');
  assert.equal(result.externalEffectLedger.spendCents, 0);
});

test('genome extraction is bounded and returns no atoms without evidence', () => {
  const noEvidence = extractMechanismAtoms({ modelId: 'm1', genome: { buyer: 'agency' }, date });
  assert.equal(noEvidence.status, 'NO_EVIDENCED_ATOMS');
  const result = extractMechanismAtoms({
    modelId: 'm1', evidenceRefs: ['opportunity:m1'], maxAtoms: 2,
    genome: { buyer: 'agencies', value: 'reliability proof', pricing: '$unknown', recurrence: 'monthly monitoring' }, date
  });
  assert.equal(result.atoms.length, 2);
  assert.equal(result.boundedCount, 2);
  assert.ok(result.atoms.every(item => item.status === 'EVIDENCE_REFERENCED_NOT_PROMOTED'));
});

test('recombination produces bounded hypotheses and never invents price or payment', () => {
  const atoms = [atom({ atomId: 'atom:a', type: 'VALUE' }), atom({ atomId: 'atom:b', type: 'ACQUISITION', description: 'Agency distribution' }), atom({ atomId: 'atom:c', type: 'RECURRENCE', description: 'Monitoring subscription' })];
  const result = recombineMechanismAtoms({ atoms, buyer: 'agencies', objective: 'reduce owner burden', maxCandidates: 1, date });
  assert.equal(result.status, 'HYPOTHESES_GENERATED');
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].evidenceStatus, 'UNPROVEN_COMBINATION');
  assert.equal(result.candidates[0].pricingHypothesis, null);
  assert.equal(result.candidates[0].paymentProof, null);
});

test('recombination with no valid atoms remains empty rather than creating noise', () => {
  const result = recombineMechanismAtoms({ atoms: [{ atomId: 'not-compiled' }], date });
  assert.equal(result.status, 'NO_VALID_ATOMS');
  assert.equal(result.candidateCount, 0);
});

test('red-team output recommends review or bounded validation, never autonomous kill/promotion', () => {
  const candidate = recombineMechanismAtoms({ atoms: [atom({ atomId: 'a' }), atom({ atomId: 'b', type: 'TRUST' })], date }).candidates[0];
  const result = redTeamMechanismCandidate({ candidate, contradictions: ['single-source claim'], date });
  assert.equal(result.status, 'REVIEW_REQUIRED');
  assert.equal(result.decision, 'KILL_OR_REPAIR_REVIEW');
  assert.match(result.promotion, /DISABLED/);
});

test('handlers generate atoms and combinations through auditLog only', async () => {
  const calls = [];
  const handlers = createJobHandlers({ store: { log: async (type, detail) => { calls.push({ type, detail }); return { id: type }; } }, cfg: {} });
  const extracted = await handlers['prometheus.mechanism.extract']({ modelId: 'm1', evidenceRefs: ['opportunity:m1'], genome: { value: 'audit', acquisition: 'partners' }, date });
  assert.equal(extracted.ok, true);
  const combined = await handlers['prometheus.mechanism.recombine']({ atoms: extracted.atoms, buyer: 'agencies', date });
  assert.equal(combined.ok, true);
  const review = await handlers['prometheus.mechanism.red-team']({ candidate: combined.candidates[0], risks: ['platform dependency'], date });
  assert.equal(review.ok, true);
  assert.deepEqual(calls.map(call => call.type), ['mechanism_extraction', 'mechanism_recombination', 'mechanism_red_team']);
});

test('mechanism receipt excludes raw genome and module has no I/O/provider boundary', async () => {
  const calls = [];
  await logMechanismLabReceipt({ log: async (type, detail) => { calls.push({ type, detail }); return { id: 'm' }; } }, 'mechanism_atom', { ok: true, policyVersion: MECHANISM_LAB_POLICY_VERSION, status: 'x', genome: { secret: 'x' } });
  assert.equal(calls[0].detail.genome, undefined);
  const source = await fs.readFile(new URL('../src/mechanism-lab.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /fetch\(|http\.request|https\.request|readFile\(|writeFile\(|spawn\(|exec\(|process\.env/);
});
