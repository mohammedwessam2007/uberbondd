import assert from 'node:assert/strict';
import test from 'node:test';
import { runFrontierTaskTournament } from '../src/frontier-task-tournament.mjs';

const NOW = new Date('2026-09-03T06:00:00Z');
const proofFor = ({ provider, id, revision, taskClass }, identityOverrides = {}) => ({
  ok:true,
  status:'MODEL_ADMISSION_EVIDENCED',
  workerCompilationAuthority:'ELIGIBLE_FOR_INTEGRATION_REVIEW',
  promotionAuthority:'NONE',
  businessEffectAuthority:'NONE',
  identity:{ provider, id, revision, taskClass, ...identityOverrides }
});
const basis = id => ({ providerPriceRef:`price:${id}:v1`, runtimeEvidenceRef:`runtime:${id}:v1`, hardwareEvidenceRef:`hardware:${id}:v1`, permissionEvidenceRef:`permission:${id}:v1`, benchmarkEvidenceRef:`benchmark:${id}:v1`, admissionEvidenceRef:`admission:${id}:v1` });
const candidate = (id, overrides={}) => {
  const merged = {
    id,
    revision:'sha256:abc',
    provider:`provider-${id}`,
    taskClass:'lead-evidence',
    routingBasis:basis(id),
    tournamentEvidenceRef:`artifact:${id}`,
    tournamentObservedAt:'2026-09-03T05:00:00Z',
    attempts:10,
    successfulAttempts:8,
    totalCostUsd:1,
    meanLatencyMs:1000,
    founderMinutes:1,
    hardwareBurdenUsd:0,
    reliability:.99,
    ...overrides
  };
  return {
    ...merged,
    admissionProof:Object.prototype.hasOwnProperty.call(overrides, 'admissionProof')
      ? overrides.admissionProof
      : proofFor(merged)
  };
};
const run = candidates => runFrontierTaskTournament({taskClass:'lead-evidence', candidates}, {now:NOW});

test('blocks candidates without admission proof', () => {
  const out = run([candidate('a'), candidate('b',{admissionProof:{ok:false}})]);
  assert.equal(out.ok,false); assert.match(out.reasons.join('|'),/fresh-admission-required/);
});

test('blocks an admission proof borrowed from a different model identity', () => {
  const a = candidate('a');
  const out = run([a, candidate('b',{admissionProof:a.admissionProof})]);
  assert.equal(out.ok,false); assert.match(out.reasons.join('|'),/admission-proof-identity-mismatch/);
});

test('blocks an admission proof with substituted provider identity', () => {
  const b = candidate('b');
  const out = run([candidate('a'), {...b, admissionProof:proofFor(b,{provider:'provider-forged'})}]);
  assert.equal(out.ok,false); assert.match(out.reasons.join('|'),/admission-proof-identity-mismatch/);
});

test('blocks an admission proof with substituted revision identity', () => {
  const b = candidate('b');
  const out = run([candidate('a'), {...b, admissionProof:proofFor(b,{revision:'sha256:other'})}]);
  assert.equal(out.ok,false); assert.match(out.reasons.join('|'),/admission-proof-identity-mismatch/);
});

test('blocks an admission proof from a different task class', () => {
  const b = candidate('b');
  const out = run([candidate('a'), {...b, admissionProof:proofFor(b,{taskClass:'coding'})}]);
  assert.equal(out.ok,false); assert.match(out.reasons.join('|'),/admission-proof-identity-mismatch/);
});

test('blocks duplicate exact supplier identity', () => {
  const a=candidate('a'); const out=run([a,{...a}]);
  assert.equal(out.ok,false); assert.match(out.reasons.join('|'),/unique-exact-candidate-identity-required/);
});

test('blocks incomplete routing basis', () => {
  const out=run([candidate('a'),candidate('b',{routingBasis:{providerPriceRef:'price:b:v1'}})]);
  assert.equal(out.ok,false); assert.match(out.reasons.join('|'),/complete-routing-basis-required/);
});

test('blocks reused evidence across candidates', () => {
  const out=run([candidate('a'),candidate('b',{tournamentEvidenceRef:'artifact:a'})]);
  assert.equal(out.ok,false); assert.match(out.reasons.join('|'),/independent-tournament-evidence-required/);
});

test('blocks stale evidence', () => {
  const out=run([candidate('a'),candidate('b',{tournamentObservedAt:'2026-08-20T05:00:00Z'})]);
  assert.equal(out.ok,false); assert.match(out.reasons.join('|'),/stale-tournament-evidence-rejected/);
});

test('blocks future evidence', () => {
  const out=run([candidate('a'),candidate('b',{tournamentObservedAt:'2026-09-04T05:00:00Z'})]);
  assert.equal(out.ok,false); assert.match(out.reasons.join('|'),/future-tournament-evidence-rejected/);
});

test('blocks zero-success candidate', () => {
  const out=run([candidate('a'),candidate('b',{totalCostUsd:0,successfulAttempts:0})]);
  assert.equal(out.ok,false); assert.match(out.reasons.join('|'),/successful-trials-required/);
});

test('ranks by successful-task economics and persists routing basis digest', () => {
  const cheapUnreliable=candidate('cheap',{totalCostUsd:.2,attempts:10,successfulAttempts:2,reliability:.5,founderMinutes:8});
  const dearReliable=candidate('reliable',{totalCostUsd:1,attempts:10,successfulAttempts:10,reliability:1,founderMinutes:.2});
  const out=run([cheapUnreliable,dearReliable]);
  assert.equal(out.ok,true); assert.equal(out.winner.id,'reliable'); assert.equal(out.businessEffectAuthority,'NONE');
  assert.equal(out.evidenceFreshness.maxEvidenceAgeDays,7);
  assert.match(out.winner.routingBasisDigest,/^sha256:[a-f0-9]{64}$/);
  assert.equal(out.winner.routingBasis.providerPriceRef,'price:reliable:v1');
});

test('task mismatch fails closed', () => {
  const out=run([candidate('a'),candidate('b',{taskClass:'coding'})]);
  assert.equal(out.ok,false); assert.match(out.reasons.join('|'),/task-class-mismatch/);
});
