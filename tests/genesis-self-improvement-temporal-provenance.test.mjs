import test from 'node:test';
import assert from 'node:assert/strict';
import { compileGenesisSelfImprovementAdmission } from '../src/genesis-self-improvement-bridge.mjs';

test('future-dated donor observation cannot enter causal self-improvement provenance',()=>{
  const out=compileGenesisSelfImprovementAdmission({
    evaluatedAt:'2026-09-09T04:00:00.000Z',
    donors:[{source:{observedAt:'2026-09-09T04:00:00.001Z'}}]
  });
  assert.equal(out.ok,false);
  assert.ok(out.reasonCodes.includes('future-dated-donor-evidence-prohibited'));
  assert.equal(out.writeAuthority,'NONE');
  assert.equal(out.selfModificationAuthority,'NONE');
  assert.equal(out.asiStatus,'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED');
});

test('invalid evaluation time fails before GENESIS compilation',()=>{
  const out=compileGenesisSelfImprovementAdmission({evaluatedAt:'not-a-time',donors:[]});
  assert.equal(out.ok,false);
  assert.ok(out.reasonCodes.includes('valid-genesis-evaluation-time-required'));
});
