import assert from 'node:assert/strict';
import test from 'node:test';
import { runFrontierTaskTournament } from '../src/frontier-task-tournament.mjs';
import { verifyFrontierRoutingAtExecution } from '../src/frontier-routing-revalidation-proof.mjs';

const NOW = new Date('2026-09-03T06:00:00Z');
const EXEC = new Date('2026-09-03T06:20:00Z');
const proofFor = ({provider,id,revision,taskClass}, identityOverrides={}) => ({
  ok:true,
  status:'MODEL_ADMISSION_EVIDENCED',
  workerCompilationAuthority:'ELIGIBLE_FOR_INTEGRATION_REVIEW',
  promotionAuthority:'NONE',
  businessEffectAuthority:'NONE',
  identity:{provider,id,revision,taskClass,...identityOverrides}
});
const basis = id => ({ providerPriceRef:`price:${id}:v1`, runtimeEvidenceRef:`runtime:${id}:v1`, hardwareEvidenceRef:`hardware:${id}:v1`, permissionEvidenceRef:`permission:${id}:v1`, benchmarkEvidenceRef:`benchmark:${id}:v1`, admissionEvidenceRef:`admission:${id}:v1` });
const candidate = (id, overrides={}) => {
  const merged = { id, revision:'sha256:abc', provider:`provider-${id}`, taskClass:'lead-evidence', routingBasis:basis(id), tournamentEvidenceRef:`artifact:${id}`, tournamentObservedAt:'2026-09-03T05:50:00Z', attempts:10, successfulAttempts:10, totalCostUsd:id==='a'?1:2, meanLatencyMs:1000, founderMinutes:.1, hardwareBurdenUsd:0, reliability:1, ...overrides };
  return {
    ...merged,
    admissionProof:Object.prototype.hasOwnProperty.call(overrides,'admissionProof') ? overrides.admissionProof : proofFor(merged)
  };
};
const tournament = () => runFrontierTaskTournament({taskClass:'lead-evidence', candidates:[candidate('a'),candidate('b')]},{now:NOW});
const currentWinner = t => {
  const identity = { provider:t.winner.provider, id:t.winner.id, revision:t.winner.revision, taskClass:t.winner.taskClass };
  return { ...identity, admissionProof:proofFor(identity), routingBasis:t.winner.routingBasis };
};

test('revalidates unchanged fresh winner only for compilation review', () => {
  const t=tournament(); const out=verifyFrontierRoutingAtExecution({tournament:t,currentSupplier:currentWinner(t)},{now:EXEC});
  assert.equal(out.ok,true); assert.equal(out.status,'ROUTING_REVALIDATED');
  assert.equal(out.routingAuthority,'ELIGIBLE_FOR_PROVIDER_NEUTRAL_WORKER_COMPILATION_REVIEW');
  assert.equal(out.businessEffectAuthority,'NONE');
});

test('blocks exact model revision drift', () => {
  const t=tournament(); const out=verifyFrontierRoutingAtExecution({tournament:t,currentSupplier:{...currentWinner(t),revision:'sha256:new'}},{now:EXEC});
  assert.equal(out.ok,false); assert.match(out.reasons.join('|'),/exact-winner-identity-required|routing-basis-drift-detected/);
});

test('blocks provider price evidence drift', () => {
  const t=tournament(); const current=currentWinner(t); current.routingBasis={...current.routingBasis,providerPriceRef:'price:a:v2'};
  const out=verifyFrontierRoutingAtExecution({tournament:t,currentSupplier:current},{now:EXEC});
  assert.equal(out.ok,false); assert.match(out.reasons.join('|'),/routing-basis-drift-detected/);
});

test('blocks runtime or hardware drift', () => {
  const t=tournament(); const current=currentWinner(t); current.routingBasis={...current.routingBasis,runtimeEvidenceRef:'runtime:a:v2',hardwareEvidenceRef:'hardware:a:v2'};
  const out=verifyFrontierRoutingAtExecution({tournament:t,currentSupplier:current},{now:EXEC});
  assert.equal(out.ok,false); assert.match(out.reasons.join('|'),/routing-basis-drift-detected/);
});

test('blocks permission or benchmark basis drift', () => {
  const t=tournament(); const current=currentWinner(t); current.routingBasis={...current.routingBasis,permissionEvidenceRef:'permission:a:revoked',benchmarkEvidenceRef:'benchmark:a:v2'};
  const out=verifyFrontierRoutingAtExecution({tournament:t,currentSupplier:current},{now:EXEC});
  assert.equal(out.ok,false); assert.match(out.reasons.join('|'),/routing-basis-drift-detected/);
});

test('blocks revoked current admission even with unchanged basis', () => {
  const t=tournament(); const current={...currentWinner(t),admissionProof:{ok:false,status:'MODEL_ADMISSION_BLOCKED'}};
  const out=verifyFrontierRoutingAtExecution({tournament:t,currentSupplier:current},{now:EXEC});
  assert.equal(out.ok,false); assert.match(out.reasons.join('|'),/current-admission-required/);
});

test('blocks an admission proof borrowed from another model at execution time', () => {
  const t=tournament(); const current=currentWinner(t);
  current.admissionProof=proofFor(current,{id:'different-model'});
  const out=verifyFrontierRoutingAtExecution({tournament:t,currentSupplier:current},{now:EXEC});
  assert.equal(out.ok,false); assert.match(out.reasons.join('|'),/current-admission-identity-mismatch/);
});

test('blocks an admission proof for another task class at execution time', () => {
  const t=tournament(); const current=currentWinner(t);
  current.admissionProof=proofFor(current,{taskClass:'coding'});
  const out=verifyFrontierRoutingAtExecution({tournament:t,currentSupplier:current},{now:EXEC});
  assert.equal(out.ok,false); assert.match(out.reasons.join('|'),/current-admission-identity-mismatch/);
});

test('blocks stale winner selection', () => {
  const t=tournament(); const out=verifyFrontierRoutingAtExecution({tournament:t,currentSupplier:currentWinner(t),maxSelectionAgeMinutes:10},{now:EXEC});
  assert.equal(out.ok,false); assert.match(out.reasons.join('|'),/stale-selection-rejected/);
});
